import type { EventBus, Disposable, SyncEvent } from "@dotai/core";
import type { OutputChannelManager } from "./ui/output.js";

export class EventHandler {
  private readonly subscription: Disposable;

  constructor(eventBus: EventBus, output: OutputChannelManager) {
    this.subscription = eventBus.on("*", (event: SyncEvent) => {
      output.appendEvent(event);
    });
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
