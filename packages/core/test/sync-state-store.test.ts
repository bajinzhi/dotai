import { describe, it, expect, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { SyncStateStore } from "../src/sync/state-store.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-test-state-store");
const STATE_PATH = path.join(TEST_DIR, ".sync-state.json");

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("SyncStateStore", () => {
  it("should return empty state when file does not exist", async () => {
    const store = new SyncStateStore(STATE_PATH);
    const state = await store.load();

    expect(state.tools).toEqual({});
    expect(state.lastGlobalSync).toBeNull();
  });

  it("should persist and load tool sync time", async () => {
    const store = new SyncStateStore(STATE_PATH);
    const timestamp = new Date("2025-06-15T10:30:00.000Z");

    await store.recordToolSync("cursor", timestamp);
    const syncTime = await store.getToolSyncTime("cursor");

    expect(syncTime).not.toBeNull();
    expect(syncTime?.toISOString()).toBe("2025-06-15T10:30:00.000Z");
  });

  it("should return null for tool that was never synced", async () => {
    const store = new SyncStateStore(STATE_PATH);
    const syncTime = await store.getToolSyncTime("nonexistent");

    expect(syncTime).toBeNull();
  });

  it("should record global sync with multiple tools", async () => {
    const store = new SyncStateStore(STATE_PATH);
    const timestamp = new Date("2025-06-15T14:00:00.000Z");

    await store.recordGlobalSync(
      [
        { toolId: "cursor", success: true },
        { toolId: "claude", success: true },
        { toolId: "copilot", success: false },
      ],
      timestamp
    );

    const state = await store.load();
    expect(state.lastGlobalSync).toBe("2025-06-15T14:00:00.000Z");
    expect(state.tools["cursor"]).toBe("2025-06-15T14:00:00.000Z");
    expect(state.tools["claude"]).toBe("2025-06-15T14:00:00.000Z");
    expect(state.tools["copilot"]).toBeUndefined();
  });

  it("should update existing tool sync time", async () => {
    const store = new SyncStateStore(STATE_PATH);
    const first = new Date("2025-06-15T10:00:00.000Z");
    const second = new Date("2025-06-15T14:00:00.000Z");

    await store.recordToolSync("cursor", first);
    await store.recordToolSync("cursor", second);

    const syncTime = await store.getToolSyncTime("cursor");
    expect(syncTime?.toISOString()).toBe("2025-06-15T14:00:00.000Z");
  });

  it("should handle corrupted state file gracefully", async () => {
    await fs.ensureDir(TEST_DIR);
    await fs.writeFile(STATE_PATH, "not valid json{{{", "utf-8");

    const store = new SyncStateStore(STATE_PATH);
    const state = await store.load();

    expect(state.tools).toEqual({});
    expect(state.lastGlobalSync).toBeNull();
  });
});