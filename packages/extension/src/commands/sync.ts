import * as vscode from "vscode";
import { BUILT_IN_TOOL_IDS } from "@dotai/core";
import type { DotAIEngine } from "@dotai/core";
import { NotificationManager } from "../ui/notifications.js";
import type { OutputChannelManager } from "../ui/output.js";
import {
  buildAuthHint,
  classifyGitAccessError,
  verifyRepositoryAccess,
} from "../utils/git-auth.js";

const notifications = new NotificationManager();

export function registerSyncCommand(
  context: vscode.ExtensionContext,
  engine: DotAIEngine,
  output: OutputChannelManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.sync", async () => {
      output.show();
      const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const overrideMode = engine.config.settings.sync.overrideMode;

      try {
        const canSync = await ensureRepositoryAuth(engine, output);
        if (!canSync) {
          return;
        }

        // "ask" mode: preview first, then confirm before deploy
        if (overrideMode === "ask") {
          const previewItems = await engine.preview({ projectPath });
          if (previewItems.length === 0) {
            vscode.window.showInformationMessage("DotAI: No changes to deploy.");
            return;
          }
          const confirmed = await notifications.confirmSync(previewItems);
          if (!confirmed) {
            output.warn("Sync cancelled by user.", "SYNC");
            return;
          }
        }

        const report = await engine.sync({ projectPath });
        notifications.showSyncResult(report);
      } catch (err) {
        notifications.showError(
          err instanceof Error ? err.message : String(err)
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.syncTool", async () => {
      const allTools = [...BUILT_IN_TOOL_IDS];
      const selected = await vscode.window.showQuickPick(allTools, {
        placeHolder: "Select tool(s) to sync",
        canPickMany: true,
      });
      if (!selected || selected.length === 0) {
        return;
      }

      output.show();
      const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const overrideMode = engine.config.settings.sync.overrideMode;

      try {
        const canSync = await ensureRepositoryAuth(engine, output);
        if (!canSync) {
          return;
        }

        // "ask" mode: preview first
        if (overrideMode === "ask") {
          const previewItems = await engine.preview({
            tools: selected,
            projectPath,
          });
          if (previewItems.length === 0) {
            vscode.window.showInformationMessage("DotAI: No changes to deploy.");
            return;
          }
          const confirmed = await notifications.confirmSync(previewItems);
          if (!confirmed) {
            output.warn("Sync cancelled by user.", "SYNC");
            return;
          }
        }

        const report = await engine.sync({
          tools: selected,
          projectPath,
        });
        notifications.showSyncResult(report);
      } catch (err) {
        notifications.showError(
          err instanceof Error ? err.message : String(err)
        );
      }
    })
  );
}

async function ensureRepositoryAuth(
  engine: DotAIEngine,
  output: OutputChannelManager
): Promise<boolean> {
  const repoUrl = engine.config.settings.repository.url?.trim();
  if (!repoUrl) {
    vscode.window.showWarningMessage(
      "DotAI: Repository URL is empty. Run DotAI: Open Settings first."
    );
    return false;
  }

  const branch = engine.config.settings.repository.branch || "main";
  const auth = engine.config.settings.repository.auth;
  const authHint = buildAuthHint(repoUrl, auth);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DotAI: Checking repository authentication...",
      },
      async () => verifyRepositoryAccess(repoUrl, branch, 120_000)
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const kind = classifyGitAccessError(message);

    if (kind === "network") {
      output.warn(`Repository network check failed: ${message}`, "AUTH");
      output.info("DotAI will continue and try offline cache.", "AUTH");
      vscode.window.showWarningMessage(
        "DotAI: Network check failed, continuing with offline cache if available."
      );
      return true;
    }

    output.error(`Repository auth check failed: ${message}`, "AUTH");
    output.warn(`Hint: ${authHint}`, "AUTH");
    for (const link of buildAuthHelpLinks(repoUrl, auth)) {
      output.info(`Auth help: ${link}`, "AUTH");
    }
    if (kind === "auth") {
      const action = await vscode.window.showErrorMessage(
        `DotAI authentication failed: ${message}`,
        "Open DotAI Settings",
        "Show Hint",
        "Open Output"
      );
      if (action === "Open DotAI Settings") {
        await vscode.commands.executeCommand("dotai.openSettings");
      } else if (action === "Show Hint") {
        vscode.window.showInformationMessage(`DotAI hint: ${authHint}`);
      } else if (action === "Open Output") {
        output.show();
      }
      return false;
    }

    // Unknown pre-check error: don't hard block; let core sync decide.
    vscode.window.showWarningMessage(
      "DotAI: Repository pre-check failed, continuing sync attempt."
    );
    return true;
  }
}

function buildAuthHelpLinks(repoUrl: string, auth: "ssh" | "https"): string[] {
  const links: string[] = [];
  const lower = repoUrl.toLowerCase();
  const isGithub = lower.includes("github.com");
  const isGitlab = lower.includes("gitlab.com");

  if (auth === "ssh") {
    if (isGithub) {
      links.push("https://docs.github.com/en/authentication/connecting-to-github-with-ssh");
    }
    if (isGitlab) {
      links.push("https://docs.gitlab.com/user/ssh/");
    }
    if (!isGithub && !isGitlab) {
      links.push("https://git-scm.com/book/en/v2/Git-on-the-Server-The-Protocols");
    }
  } else {
    if (isGithub) {
      links.push("https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git");
    }
    if (isGitlab) {
      links.push("https://docs.gitlab.com/user/profile/personal_access_tokens/");
    }
    links.push("https://git-scm.com/docs/gitcredentials");
  }

  return links;
}
