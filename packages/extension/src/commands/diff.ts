import * as vscode from "vscode";
import type { DotAIEngine } from "@dotai/core";
import type { OutputChannelManager } from "../ui/output.js";

export function registerDiffCommand(
  context: vscode.ExtensionContext,
  engine: DotAIEngine,
  output: OutputChannelManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.diff", async () => {
      output.show();
      output.appendLine("--- DotAI Diff ---");

      try {
        const diff = await engine.diff();
        if (!diff.hasChanges) {
          output.appendLine("No changes detected.");
        } else {
          for (const change of diff.changes) {
            output.appendLine(`  ${change.status.toUpperCase()} [${change.tool}] ${change.file}`);
          }
        }
      } catch (err) {
        output.appendLine(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }

      output.appendLine("--- End Diff ---");
    })
  );
}
