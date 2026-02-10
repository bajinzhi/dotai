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

export function registerDetectCommand(
  context: vscode.ExtensionContext,
  engine: DotAIEngine,
  output: OutputChannelManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.detectTools", async () => {
      output.show();
      output.appendLine("--- DotAI Installed Tool Detection ---");

      try {
        const debug = engine.config.settings.log.level === "debug";
        const report = await engine.detectTools();
        const installed = report.tools.filter((t) => t.installed);
        const failedDetections = report.tools.filter(
          (t) => !t.installed && (t.reason?.startsWith("Detection failed:") ?? false)
        );
        const notInstalled = report.tools.filter(
          (t) => !t.installed && !(t.reason?.startsWith("Detection failed:") ?? false)
        );

        output.appendLine(`Detected: ${installed.length}/${report.tools.length}`);
        if (failedDetections.length > 0) {
          output.appendLine(`Probe errors: ${failedDetections.length}`);
        }
        output.appendLine("");

        if (installed.length > 0) {
          output.appendLine("Installed:");
          for (const tool of installed) {
            const location = tool.location ? ` (${tool.location})` : "";
            output.appendLine(`  ✓ ${tool.displayName}${location}`);
          }
          output.appendLine("");
        }

        if (notInstalled.length > 0) {
          output.appendLine("Not installed:");
          for (const tool of notInstalled) {
            const reason = summarizeReason(tool.reason, debug);
            const reasonText = reason ? ` - ${reason}` : "";
            output.appendLine(`  ✗ ${tool.displayName}${reasonText}`);
            if (debug && tool.reason && reason !== tool.reason) {
              output.appendLine(`    raw: ${tool.reason}`);
            }
          }
        }

        if (failedDetections.length > 0) {
          output.appendLine("");
          output.appendLine("Detection failed:");
          for (const tool of failedDetections) {
            const reason = summarizeReason(tool.reason, debug);
            const reasonText = reason ? ` - ${reason}` : "";
            output.appendLine(`  ! ${tool.displayName}${reasonText}`);
            if (debug && tool.reason && reason !== tool.reason) {
              output.appendLine(`    raw: ${tool.reason}`);
            }
          }
        }
      } catch (err) {
        output.appendLine(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }

      output.appendLine("--- End Detection ---");
    })
  );
}
