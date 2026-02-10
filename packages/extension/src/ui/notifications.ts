import * as vscode from "vscode";
import type { SyncReport, PreviewItem } from "@dotai/core";

export class NotificationManager {

  async confirmSync(previewItems: PreviewItem[]): Promise<boolean> {
    const createCount = previewItems.filter((i) => i.action === "create").length;
    const overwriteCount = previewItems.filter((i) => i.action === "overwrite").length;

    const parts: string[] = [];
    if (createCount > 0) {
      parts.push(`create ${createCount} file(s)`);
    }
    if (overwriteCount > 0) {
      parts.push(`overwrite ${overwriteCount} file(s)`);
    }

    const message = `DotAI will ${parts.join(" and ")}. Proceed?`;
    const result = await vscode.window.showInformationMessage(
      message,
      { modal: false },
      "Confirm",
      "Details"
    );

    if (result === "Details") {
      const detail = previewItems
        .map((i) => `  ${i.action.toUpperCase()} ${i.targetPath}`)
        .join("\n");
      const confirm = await vscode.window.showInformationMessage(
        `Files to be changed:\n${detail}`,
        { modal: true },
        "Confirm"
      );
      return confirm === "Confirm";
    }

    return result === "Confirm";
  }

  showSyncResult(report: SyncReport): void {
    const successCount = report.results.filter((r) => r.status === "success").length;
    const skippedCount = report.results.filter((r) => r.status === "skipped").length;
    const failedCount = report.results.filter((r) => r.status === "failed").length;
    const duration = (report.endTime.getTime() - report.startTime.getTime()) / 1000;

    const message =
      `Sync complete: ${successCount} tool(s) succeeded, ` +
      `${skippedCount} skipped, ${failedCount} failed ` +
      `(${duration.toFixed(1)}s)`;

    if (failedCount > 0) {
      vscode.window.showWarningMessage(message, "Show Log").then((action) => {
        if (action === "Show Log") {
          vscode.commands.executeCommand("dotai.status");
        }
      });
    } else {
      vscode.window.showInformationMessage(message);
    }
  }

  showError(message: string): void {
    vscode.window.showErrorMessage(`DotAI: ${message}`);
  }
}
