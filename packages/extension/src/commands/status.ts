import * as vscode from "vscode";
import type { DotAIEngine } from "@dotai/core";
import type { OutputChannelManager } from "../ui/output.js";

function summarizeReason(reason: string | undefined, debug = false): string {
  if (!reason) {
    return "";
  }
  if (debug) {
    return reason;
  }
  const firstLine = reason.split(/\r?\n/, 1)[0].trim();
  const maxLen = 120;
  if (firstLine.length <= maxLen) {
    return firstLine;
  }
  return `${firstLine.slice(0, maxLen - 3)}...`;
}

export function registerStatusCommand(
  context: vscode.ExtensionContext,
  engine: DotAIEngine,
  output: OutputChannelManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.status", async () => {
      output.show();
      output.appendLine("--- DotAI Status ---");

      try {
        const debug = engine.config.settings.log.level === "debug";
        const status = await engine.status();
        output.appendLine(`Repository: ${engine.config.settings.repository.url}`);
        output.appendLine(`Branch: ${engine.config.settings.repository.branch}`);
        output.appendLine(`Local commit: ${status.repo.localCommit || "N/A"}`);
        output.appendLine(`Remote commit: ${status.repo.remoteCommit || "N/A"}`);
        output.appendLine(`Offline: ${status.repo.isOffline}`);
        output.appendLine("");
        output.appendLine("Installed tools:");
        for (const tool of status.tools) {
          const icon = tool.installed ? "\u2713" : "\u2717";
          const reason = !tool.installed
            ? summarizeReason(tool.reason, debug)
            : "";
          const reasonText = reason ? ` - ${reason}` : "";
          output.appendLine(`  ${icon} ${tool.displayName}${reasonText}`);
          if (debug && !tool.installed && tool.reason && reason !== tool.reason) {
            output.appendLine(`    raw: ${tool.reason}`);
          }
        }
      } catch (err) {
        output.appendLine(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }

      output.appendLine("--- End Status ---");
    })
  );
}
