import * as vscode from "vscode";
import type { EventBus, SyncEvent, Disposable } from "@dotai/core";

type SyncState = "idle" | "syncing" | "warning" | "offline" | "conflict";

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;
  private readonly subscription: Disposable;
  private hasConflictInCurrentSync = false;

  constructor(eventBus: EventBus) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000
    );
    this.item.command = "dotai.quickSync";
    this.item.name = "DotAI Sync";
    this.updateState("idle");
    this.item.show();

    this.subscription = eventBus.on("*", (event: SyncEvent) => {
      this.handleEvent(event);
    });
  }

  dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private handleEvent(event: SyncEvent): void {
    switch (event.type) {
      case "sync:start":
        this.hasConflictInCurrentSync = false;
        this.updateState("syncing");
        break;
      case "sync:complete":
        this.updateState(this.hasConflictInCurrentSync ? "conflict" : "idle");
        break;
      case "sync:error":
        this.updateState("warning");
        break;
      case "git:offline":
        this.updateState("offline");
        break;
      case "conflict:detected":
        this.hasConflictInCurrentSync = true;
        break;
    }
  }

  private updateState(state: SyncState): void {
    switch (state) {
      case "idle":
        this.item.text = "$(sync) DotAI Sync";
        this.item.tooltip = "DotAI: Sync now";
        break;
      case "syncing":
        this.item.text = "$(sync~spin) DotAI Sync";
        this.item.tooltip = "DotAI: Syncing...";
        break;
      case "warning":
        this.item.text = "$(warning) DotAI Sync";
        this.item.tooltip = "DotAI: Sync completed with errors";
        break;
      case "offline":
        this.item.text = "$(cloud-offline) DotAI Sync";
        this.item.tooltip = "DotAI: Offline mode (using cache)";
        break;
      case "conflict":
        this.item.text = "$(warning) DotAI Sync";
        this.item.tooltip = "DotAI: Conflicts detected (local files preserved)";
        break;
    }
  }
}
