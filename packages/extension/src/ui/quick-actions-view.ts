import * as vscode from "vscode";

class ActionItem extends vscode.TreeItem {
  constructor(
    label: string,
    commandId: string,
    description?: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = { command: commandId, title: label };
    this.description = description;
  }
}

export class QuickActionsProvider implements vscode.TreeDataProvider<ActionItem> {
  private readonly items: ActionItem[] = [
    new ActionItem("Sync All", "dotai.sync", "Sync all configured tools"),
    new ActionItem("Sync Tool...", "dotai.syncTool", "Pick tools to sync"),
    new ActionItem("Status", "dotai.status", "Show repository and tool status"),
    new ActionItem("Detect Installed Tools", "dotai.detectTools", "Detect local tool installations"),
    new ActionItem("Show Diff", "dotai.diff", "Preview config changes"),
    new ActionItem("Open Settings", "dotai.openSettings", "Edit DotAI settings"),
  ];

  getTreeItem(element: ActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<ActionItem[]> {
    return this.items;
  }
}
