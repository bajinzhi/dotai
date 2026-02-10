import * as vscode from "vscode";

class SyncActionItem extends vscode.TreeItem {
  constructor() {
    super("Sync Now", vscode.TreeItemCollapsibleState.None);
    this.description = "Run DotAI sync";
    this.command = {
      command: "dotai.quickSync",
      title: "Sync Now",
    };
    this.iconPath = new vscode.ThemeIcon("sync");
  }
}

export class SyncActionProvider implements vscode.TreeDataProvider<SyncActionItem> {
  private readonly item = new SyncActionItem();

  getTreeItem(element: SyncActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<SyncActionItem[]> {
    return [this.item];
  }
}
