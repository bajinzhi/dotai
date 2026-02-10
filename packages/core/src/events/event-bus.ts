import { EventEmitter } from "eventemitter3";
import type { EventType, SyncEvent, Disposable } from "../types.js";

export interface EventBus {
  emit(event: SyncEvent): void;
  on(
    type: EventType | EventType[] | "*",
    handler: (event: SyncEvent) => void
  ): Disposable;
  off(handler: (event: SyncEvent) => void): void;
}

export class EventBusImpl implements EventBus {
  private readonly emitter = new EventEmitter();
  private readonly wildcardHandlers = new Set<(event: SyncEvent) => void>();

  emit(event: SyncEvent): void {
    this.emitter.emit(event.type, event);
    this.wildcardHandlers.forEach((handler) => handler(event));
  }

  on(
    type: EventType | EventType[] | "*",
    handler: (event: SyncEvent) => void
  ): Disposable {
    if (type === "*") {
      this.wildcardHandlers.add(handler);
      return { dispose: () => { this.wildcardHandlers.delete(handler); } };
    }
    const types = Array.isArray(type) ? type : [type];
    types.forEach((t) => this.emitter.on(t, handler));
    return {
      dispose: () => { types.forEach((t) => this.emitter.off(t, handler)); },
    };
  }

  off(handler: (event: SyncEvent) => void): void {
    this.wildcardHandlers.delete(handler);
  }
}

