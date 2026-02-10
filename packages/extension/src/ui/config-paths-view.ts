import * as vscode from "vscode";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { TOOL_MANAGED_CONFIG_SPECS } from "@dotai/core";
import type { DotAIEngine, ToolManagedConfigSpec } from "@dotai/core";

type ScopeKind = "user" | "project";

class ToolNode extends vscode.TreeItem {
  constructor(public readonly tool: ToolManagedConfigSpec) {
    super(tool.displayName, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = "installed";
    this.iconPath = new vscode.ThemeIcon("tools");
  }
}

class ScopeNode extends vscode.TreeItem {
  constructor(
    public readonly tool: ToolManagedConfigSpec,
    public readonly scope: ScopeKind,
    public readonly rootPath: string
  ) {
    super(scope === "user" ? "User Config" : "Project Config", vscode.TreeItemCollapsibleState.Collapsed);
    this.description = rootPath;
    this.iconPath = new vscode.ThemeIcon(scope === "user" ? "account" : "folder");
  }
}

class DirectoryNode extends vscode.TreeItem {
  constructor(
    public readonly tool: ToolManagedConfigSpec,
    public readonly rootPath: string,
    public readonly dirPath: string,
    public readonly managedRoot?: string
  ) {
    super(path.basename(dirPath), vscode.TreeItemCollapsibleState.Collapsed);
    this.description = toRelative(rootPath, dirPath);
    this.iconPath = new vscode.ThemeIcon("folder");
  }
}

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly rootPath: string,
    public readonly filePath: string
  ) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
    this.description = toRelative(rootPath, filePath);
    this.iconPath = new vscode.ThemeIcon("file");
    this.command = {
      command: "dotai.openConfigFile",
      title: "Open Config File",
      arguments: [filePath],
    };
  }
}

class MessageNode extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon("info");
  }
}

type ConfigPathItem = ToolNode | ScopeNode | DirectoryNode | FileNode | MessageNode;

export class ConfigPathsProvider implements vscode.TreeDataProvider<ConfigPathItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly getEngine: () => DotAIEngine | undefined) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: ConfigPathItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ConfigPathItem): Promise<ConfigPathItem[]> {
    if (!element) {
      return this.getInstalledToolNodes();
    }

    if (element instanceof ToolNode) {
      return this.getScopeNodes(element.tool);
    }

    if (element instanceof ScopeNode) {
      return this.listScopeRootLevel(element.tool, element.rootPath, element.scope);
    }

    if (element instanceof DirectoryNode) {
      return this.listManagedDirectoryLevel(element.tool, element.rootPath, element.dirPath, element.managedRoot);
    }

    return [];
  }

  private async getInstalledToolNodes(): Promise<ConfigPathItem[]> {
    const engine = this.getEngine();
    if (!engine) {
      return [new MessageNode("DotAI engine not ready", "Check settings and reload window")];
    }

    try {
      const report = await engine.detectTools();
      const installed = report.tools.filter((t) => t.installed);
      if (installed.length === 0) {
        return [new MessageNode("No installed tools detected")];
      }
      const installedSet = new Set(installed.map((t) => t.toolId));
      return TOOL_MANAGED_CONFIG_SPECS
        .filter((t) => installedSet.has(t.toolId))
        .map((t) => new ToolNode(t));
    } catch (err) {
      return [new MessageNode("Detection failed", err instanceof Error ? err.message : String(err))];
    }
  }

  private getScopeNodes(tool: ToolManagedConfigSpec): ConfigPathItem[] {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const userPath = tool.toolId === "cline"
      ? path.join(os.homedir(), "Documents", "Cline")
      : path.join(os.homedir(), tool.configDirName);
    const projectPath = workspacePath
      ? (tool.toolId === "cline"
        ? workspacePath
        : path.join(workspacePath, tool.configDirName))
      : "(open a workspace folder)";

    return [
      new ScopeNode(tool, "user", userPath),
      new ScopeNode(tool, "project", projectPath),
    ];
  }

  private async listScopeRootLevel(
    tool: ToolManagedConfigSpec,
    rootPath: string,
    scope: ScopeKind
  ): Promise<ConfigPathItem[]> {
    if (rootPath.includes("(open a workspace folder)")) {
      return [new MessageNode("Project path unavailable", "Open a workspace folder first")];
    }

    const exists = await pathExists(rootPath);
    if (!exists) {
      return [new MessageNode("Path not found", rootPath)];
    }

    const nodeByPath = new Map<string, ConfigPathItem>();

    if (tool.includeRootEntries) {
      const rootEntries = await readDirectoryEntries(rootPath);
      if (!Array.isArray(rootEntries)) {
        return [new MessageNode("Read failed", rootEntries)];
      }
      for (const entry of rootEntries) {
        const fullPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
          nodeByPath.set(
            fullPath,
            new DirectoryNode(tool, rootPath, fullPath, findManagedRoot(tool, entry.name))
          );
        } else if (entry.isFile()) {
          nodeByPath.set(fullPath, new FileNode(rootPath, fullPath));
        }
      }
    }

    for (const managedDir of tool.managedDirectories) {
      const dirPath = path.join(rootPath, managedDir.name);
      if (await isDirectory(dirPath)) {
        nodeByPath.set(dirPath, new DirectoryNode(tool, rootPath, dirPath, managedDir.name));
      }
    }

    const scopeRootFiles = tool.rootFilesByScope?.[scope] ?? tool.rootFiles;
    for (const fileName of scopeRootFiles) {
      const filePath = path.join(rootPath, fileName);
      if (await isFile(filePath)) {
        nodeByPath.set(filePath, new FileNode(rootPath, filePath));
      }
    }

    const nodes = [...nodeByPath.values()];

    if (nodes.length === 0) {
      return [new MessageNode("No managed config files found", rootPath)];
    }

    return nodes.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
  }

  private async listManagedDirectoryLevel(
    tool: ToolManagedConfigSpec,
    rootPath: string,
    targetDir: string,
    managedRoot?: string
  ): Promise<ConfigPathItem[]> {
    const exists = await pathExists(targetDir);
    if (!exists) {
      return [new MessageNode("Path not found", targetDir)];
    }

    const entries = await readDirectoryEntries(targetDir);
    if (!Array.isArray(entries)) {
      return [new MessageNode("Read failed", entries)];
    }
    const fileRule = getFileRule(tool, managedRoot);

    const dirs = entries
      .filter((e) => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => new DirectoryNode(tool, rootPath, path.join(targetDir, e.name), managedRoot));

    const files = entries
      .filter((e) => e.isFile())
      .filter((e) => {
        if (!fileRule) {
          return true;
        }
        return fileRule.test(e.name);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => new FileNode(rootPath, path.join(targetDir, e.name)));

    if (dirs.length === 0 && files.length === 0) {
      return [new MessageNode("No managed files", toRelative(rootPath, targetDir))];
    }

    return [...dirs, ...files];
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function readDirectoryEntries(targetDir: string): Promise<Awaited<ReturnType<typeof fs.readdir>> | string> {
  try {
    return await fs.readdir(targetDir, { withFileTypes: true });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function findManagedRoot(tool: ToolManagedConfigSpec, rootName: string): string | undefined {
  const found = tool.managedDirectories.find((item) => item.name === rootName);
  return found?.name;
}

function getFileRule(tool: ToolManagedConfigSpec, managedRoot?: string): RegExp | undefined {
  if (!managedRoot) {
    return undefined;
  }
  const found = tool.managedDirectories.find((item) => item.name === managedRoot);
  if (!found?.filePattern) {
    return undefined;
  }
  return new RegExp(found.filePattern, "i");
}

function toRelative(rootPath: string, targetPath: string): string {
  const rel = path.relative(rootPath, targetPath);
  return rel === "" ? "." : rel;
}
