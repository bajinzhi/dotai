import * as vscode from "vscode";

export function registerSettingsCommand(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.openSettings", () => {
      // Open VSCode native settings UI, filtered to DotAI settings
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:dotai.dotai-vscode"
      );
    })
  );
}
