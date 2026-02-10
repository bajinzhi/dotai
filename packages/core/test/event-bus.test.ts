import { describe, it, expect, vi } from "vitest";
import { EventBusImpl } from "../src/events/event-bus.js";
import type { SyncEvent, EventType } from "../src/types.js";

function createEvent(type: EventType, data: Record<string, unknown> = {}): SyncEvent {
  return { type, timestamp: new Date(), data };
}

describe("EventBusImpl", () => {
  it("should emit and receive typed events", () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();

    bus.on("sync:start", handler);
    const event = createEvent("sync:start", { foo: "bar" });
    bus.emit(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("should not call handler for non-matching event type", () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();

    bus.on("sync:start", handler);
    bus.emit(createEvent("sync:complete"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("should support wildcard subscription", () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();

    bus.on("*", handler);
    bus.emit(createEvent("sync:start"));
    bus.emit(createEvent("git:pull:start"));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should support array of event types", () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();

    bus.on(["sync:start", "sync:complete"], handler);
    bus.emit(createEvent("sync:start"));
    bus.emit(createEvent("sync:complete"));
    bus.emit(createEvent("sync:error"));

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should dispose subscription correctly", () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();

    const disposable = bus.on("sync:start", handler);
    bus.emit(createEvent("sync:start"));
    expect(handler).toHaveBeenCalledOnce();

    disposable.dispose();
    bus.emit(createEvent("sync:start"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should dispose wildcard subscription correctly", () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();

    const disposable = bus.on("*", handler);
    bus.emit(createEvent("sync:start"));
    expect(handler).toHaveBeenCalledOnce();

    disposable.dispose();
    bus.emit(createEvent("sync:start"));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should remove wildcard handler via off()", () => {
    const bus = new EventBusImpl();
    const handler = vi.fn();

    bus.on("*", handler);
    bus.emit(createEvent("sync:start"));
    expect(handler).toHaveBeenCalledOnce();

    bus.off(handler);
    bus.emit(createEvent("sync:start"));
    expect(handler).toHaveBeenCalledOnce();
  });
});
