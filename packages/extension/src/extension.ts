import * as vscode from "vscode";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import { createDotAIEngine, ConfigWriter, ConfigResolver, BUILT_IN_TOOL_IDS } from "@dotai/core";
import type { DotAIEngine, DotAISettings, OverrideMode } from "@dotai/core";
import { OutputChannelManager } from "./ui/output.js";
import { StatusBarManager } from "./ui/status-bar.js";
import { SyncActionProvider } from "./ui/sync-action-view.js";
import { ConfigPathsProvider } from "./ui/config-paths-view.js";
import { LogViewProvider } from "./ui/log-view.js";
import { EventHandler } from "./event-handler.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerDetectCommand } from "./commands/detect.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerProfileCommand } from "./commands/profile.js";
import { registerSettingsCommand } from "./commands/settings.js";
import {
  buildAuthHint,
  classifyGitAccessError,
  verifyRepositoryAccess,
} from "./utils/git-auth.js";

let statusBarManager: StatusBarManager | undefined;
let eventHandler: EventHandler | undefined;
let outputManager: OutputChannelManager | undefined;
let syncTimer: ReturnType<typeof setInterval> | undefined;
let engineRef: DotAIEngine | undefined;
let syncActionTree: vscode.TreeView<unknown> | undefined;
let configPathsTree: vscode.TreeView<unknown> | undefined;

/**
 * Re-entrancy guard: when true, VSCode settings changes are caused by
 * programmatic YAML-to-VSCode sync and should NOT be written back to YAML.
 */
let updatingFromYaml = false;

/**
 * Delay (ms) before clearing the YAML-sync re-entrancy guard.
 * Must be long enough for all batched onDidChangeConfiguration events to fire.
 */
const YAML_SYNC_GUARD_DELAY_MS = 500;

// ---- Tools array <-> "all" conversion helpers ----

/** VSCode stores an empty array to mean "all tools". */
function toInternalTools(vsCodeTools: string[]): string[] | "all" {
  return vsCodeTools.length > 0 ? vsCodeTools : "all";
}

/** Convert internal "all" representation back to VSCode's empty-array convention. */
function toVSCodeTools(tools: string[] | "all"): string[] {
  return tools === "all" ? [] : tools;
}

// ---- YAML <-> VSCode Settings bidirectional sync ----

/**
 * Read current VSCode settings and build a full DotAISettings object.
 */
function readVSCodeSettings(): DotAISettings {
  const cfg = vscode.workspace.getConfiguration("dotai");

  return {
    repository: {
      url: cfg.get<string>("repository.url", ""),
      branch: cfg.get<string>("repository.branch", "main"),
      auth: cfg.get<"ssh" | "https">("repository.auth", "ssh"),
    },
    sync: {
      autoSync: cfg.get<boolean>("sync.autoSync", true),
      intervalMinutes: cfg.get<number>("sync.intervalMinutes", 0),
      overrideMode: cfg.get<OverrideMode>("sync.overrideMode", "ask"),
      tools: toInternalTools(cfg.get<string[]>("sync.tools", [])),
    },
    log: {
      level: cfg.get<"debug" | "info" | "warn" | "error">("logLevel", "info"),
    },
  };
}

/**
 * Populate VSCode settings from a DotAISettings object (YAML -> VSCode).
 * Sets the `updatingFromYaml` guard to prevent write-back loops.
 */
async function syncYamlToVSCode(settings: DotAISettings): Promise<void> {
  updatingFromYaml = true;
  try {
    const cfg = vscode.workspace.getConfiguration("dotai");
    const target = vscode.ConfigurationTarget.Global;

    await cfg.update("repository.url", settings.repository.url, target);
    await cfg.update("repository.branch", settings.repository.branch, target);
    await cfg.update("repository.auth", settings.repository.auth, target);
    await cfg.update("sync.autoSync", settings.sync.autoSync, target);
    await cfg.update("sync.intervalMinutes", settings.sync.intervalMinutes, target);
    await cfg.update("sync.overrideMode", settings.sync.overrideMode, target);
    await cfg.update("sync.tools", toVSCodeTools(settings.sync.tools), target);
    await cfg.update("logLevel", settings.log.level, target);
  } finally {
    // Delay clearing the guard to allow all onDidChangeConfiguration events to fire
    setTimeout(() => { updatingFromYaml = false; }, YAML_SYNC_GUARD_DELAY_MS);
  }
}

/**
 * Start or restart the periodic sync timer.
 */
function setupSyncTimer(engine: DotAIEngine, output: OutputChannelManager): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = undefined;
  }

  const intervalMinutes = engine.config.settings.sync.intervalMinutes;
  if (intervalMinutes <= 0) {
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  output.appendLine(`Periodic sync enabled: every ${intervalMinutes} minute(s)`);

  syncTimer = setInterval(() => {
    const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    verifyAccessForBackgroundSync(engine, output).then((ok) => {
      if (!ok) {
        return;
      }
      engine.sync({ projectPath }).catch((err) => {
        output.appendLine(
          `Periodic sync failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    });
  }, intervalMs);
}

/**
 * Create a FileSystemWatcher for settings.yaml, handling the case where
 * the parent directory (~/.dotai) may not yet exist.
 */
function createYamlWatcher(
  context: vscode.ExtensionContext,
  yamlPath: string,
  onChange: () => void
): void {
  const dirPath = path.dirname(yamlPath);
  const fileName = path.basename(yamlPath);

  const setupWatcher = (): void => {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(dirPath), fileName)
    );
    context.subscriptions.push(watcher.onDidChange(onChange));
    context.subscriptions.push(watcher.onDidCreate(onChange));
    context.subscriptions.push(watcher);
  };

  if (fs.pathExistsSync(dirPath)) {
    setupWatcher();
    return;
  }

  // Directory does not exist yet — poll until it appears, then set up watcher
  const POLL_INTERVAL_MS = 5_000;
  const pollTimer = setInterval(() => {
    if (fs.pathExistsSync(dirPath)) {
      clearInterval(pollTimer);
      setupWatcher();
    }
  }, POLL_INTERVAL_MS);

  context.subscriptions.push({
    dispose: () => clearInterval(pollTimer),
  });
}

export function activate(context: vscode.ExtensionContext): void {
  outputManager = new OutputChannelManager();
  const logViewProvider = new LogViewProvider(outputManager);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("dotai.logs", logViewProvider),
    logViewProvider
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.clearLogs", () => {
      outputManager?.clear();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.quickSync", async () => {
      outputManager.show();
      outputManager.appendLine("DotAI: Quick sync requested.");

      if (!engineRef) {
        const action = await vscode.window.showWarningMessage(
          "DotAI engine is not ready yet. Open settings to check repository configuration.",
          "Open DotAI Settings"
        );
        if (action === "Open DotAI Settings") {
          await vscode.commands.executeCommand("dotai.openSettings");
        }
        return;
      }

      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "DotAI: Running quick sync...",
          },
          async () => {
            try {
              await vscode.commands.executeCommand("dotai.sync");
            } catch {
              const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              await engineRef?.sync({ projectPath });
            }
          }
        );
        outputManager.appendLine("DotAI: Quick sync finished.");
        vscode.window.showInformationMessage("DotAI: Quick sync finished.");
      } catch (err) {
        outputManager.appendLine(
          `DotAI: Quick sync failed - ${err instanceof Error ? err.message : String(err)}`
        );
        vscode.window.showErrorMessage(
          `DotAI: Quick sync failed - ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // Always register settings command first so fallback entry can open settings.
  registerSettingsCommand(context);

  // Activity bar: single actionable sync entry.
  const syncActionProvider = new SyncActionProvider();
  syncActionTree = vscode.window.createTreeView("dotai.syncAction", {
    treeDataProvider: syncActionProvider,
  });
  context.subscriptions.push(syncActionTree);

  const configPathsProvider = new ConfigPathsProvider(() => engineRef);
  configPathsTree = vscode.window.createTreeView("dotai.configPaths", {
    treeDataProvider: configPathsProvider,
  });
  context.subscriptions.push(configPathsTree);

  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.openConfigPath", async (targetPath: string) => {
      if (!targetPath || targetPath.includes("(open a workspace folder)")) {
        vscode.window.showWarningMessage("DotAI: Open a workspace folder to access project config paths.");
        return;
      }
      const uri = vscode.Uri.file(targetPath);
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        const create = await vscode.window.showInformationMessage(
          `Path does not exist:\n${targetPath}`,
          "Create and Open",
          "Cancel"
        );
        if (create !== "Create and Open") {
          return;
        }
        await vscode.workspace.fs.createDirectory(uri);
      }
      await vscode.commands.executeCommand("revealFileInOS", uri);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.openConfigFile", async (targetPath: string) => {
      if (!targetPath) {
        return;
      }
      const uri = vscode.Uri.file(targetPath);
      try {
        await vscode.window.showTextDocument(uri, { preview: false });
      } catch (err) {
        vscode.window.showErrorMessage(
          `DotAI: Failed to open file - ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.refreshConfigPaths", () => {
      configPathsProvider.refresh();
    })
  );

  const cfg = vscode.workspace.getConfiguration("dotai");
  const settingsPath = cfg.get<string>("settingsPath") || undefined;
  const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Resolve the actual YAML path
  const resolvedYamlPath =
    settingsPath || path.join(os.homedir(), ".dotai", "settings.yaml");

  // Initialize UI components
  outputManager.appendLine(`DotAI supported tools: ${BUILT_IN_TOOL_IDS.join(", ")}`);

  // ConfigWriter for writing VSCode changes back to YAML
  const configWriter = new ConfigWriter(resolvedYamlPath);

  // ConfigResolver for reading YAML settings
  const configResolver = new ConfigResolver(resolvedYamlPath);

  let engine: DotAIEngine;
  try {
    // Initialize core engine -- reads directly from settings.yaml (SSOT)
    engine = createDotAIEngine({
      configPath: resolvedYamlPath,
      projectPath,
    });
    engineRef = engine;
  } catch (err) {
    outputManager.appendLine(
      `DotAI engine initialization failed: ${err instanceof Error ? err.message : String(err)}`
    );
    context.subscriptions.push(
      vscode.commands.registerCommand("dotai.sync", async () => {
        outputManager?.show();
        const action = await vscode.window.showWarningMessage(
          "DotAI engine is not ready. Open settings to check repository configuration.",
          "Open DotAI Settings"
        );
        if (action === "Open DotAI Settings") {
          await vscode.commands.executeCommand("dotai.openSettings");
        }
      })
    );
    return;
  }

  statusBarManager = new StatusBarManager(engine.eventBus);
  eventHandler = new EventHandler(engine.eventBus, outputManager);

  context.subscriptions.push({
    dispose: () => {
      if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = undefined;
      }
      outputManager?.dispose();
      statusBarManager?.dispose();
      eventHandler?.dispose();
    },
  });

  // Register all commands
  registerSyncCommand(context, engine, outputManager);
  registerStatusCommand(context, engine, outputManager);
  registerDetectCommand(context, engine, outputManager);
  registerDiffCommand(context, engine, outputManager);
  registerProfileCommand(context, engine);

  // ---- Bidirectional sync: YAML <-> VSCode Settings ----

  // 1. On activation: read YAML and populate VSCode settings
  try {
    const yamlSettings = configResolver.loadSettings();
    syncYamlToVSCode(yamlSettings).catch(() => {
      // Ignore errors during initial population
    });
  } catch (err) {
    outputManager.appendLine(
      `Failed to load settings.yaml on activation: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. VSCode settings change -> write back to YAML -> refresh engine
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (updatingFromYaml) {
        return; // Prevent write-back loop
      }
      if (e.affectsConfiguration("dotai")) {
        const newSettings = readVSCodeSettings();
        // Write to YAML (fire-and-forget, errors logged)
        configWriter.updateSettings(newSettings).then(() => {
          // Re-read from YAML to refresh engine
          engine.reloadConfig();
          outputManager?.appendLine("Settings saved to settings.yaml");
          if (outputManager) {
            setupSyncTimer(engine, outputManager);
          }
        }).catch((err) => {
          outputManager?.appendLine(
            `Failed to save settings: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      }
    })
  );

  // 3. Watch settings.yaml for external changes (e.g. CLI dotai init)
  createYamlWatcher(context, resolvedYamlPath, () => {
    if (updatingFromYaml) {
      return;
    }
    try {
      const freshSettings = configResolver.loadSettings();
      syncYamlToVSCode(freshSettings).catch(() => {});
      engine.reloadConfig();
      outputManager?.appendLine("Settings reloaded from settings.yaml (external change detected)");
      if (outputManager) {
        setupSyncTimer(engine, outputManager);
      }
    } catch (err) {
      outputManager?.appendLine(
        `Failed to reload settings: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  // Setup periodic sync timer
  setupSyncTimer(engine, outputManager);

  // Auto-sync on activation if enabled
  const autoSync = engine.config.settings.sync.autoSync;
  if (autoSync && engine.config.settings.repository.url) {
    verifyAccessForBackgroundSync(engine, outputManager).then((ok) => {
      if (!ok) {
        return;
      }
      engine.sync({ projectPath }).catch((err) => {
        outputManager?.appendLine(
          `Auto-sync failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    });
  }

  configPathsProvider.refresh();
}

export function deactivate(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = undefined;
  }
  outputManager?.dispose();
  statusBarManager?.dispose();
  eventHandler?.dispose();
  syncActionTree?.dispose();
  syncActionTree = undefined;
  configPathsTree?.dispose();
  configPathsTree = undefined;
}

async function verifyAccessForBackgroundSync(
  engine: DotAIEngine,
  output: OutputChannelManager
): Promise<boolean> {
  const repoUrl = engine.config.settings.repository.url?.trim();
  if (!repoUrl) {
    return false;
  }
  const branch = engine.config.settings.repository.branch || "main";
  const auth = engine.config.settings.repository.auth;
  const authHint = buildAuthHint(repoUrl, auth);
  try {
    await verifyRepositoryAccess(repoUrl, branch, 60_000);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind = classifyGitAccessError(message);
    if (kind === "network") {
      output.appendLine(
        `Repository network check failed (background): ${message}. Trying offline cache.`
      );
      return true;
    }
    if (kind === "auth") {
      output.appendLine(`Repository auth check failed (background sync skipped): ${message}`);
      output.appendLine(`Hint: ${authHint}`);
      return false;
    }
    output.appendLine(
      `Repository pre-check failed (background): ${message}. Sync will continue.`
    );
    return true;
  }
}
