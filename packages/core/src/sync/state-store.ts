import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import lockfile from "proper-lockfile";

/**
 * Persists per-tool sync timestamps to ~/.dotai/.sync-state.json.
 * This allows status() to report meaningful "last synced" times.
 */
export interface SyncState {
  /** Tool ID -> ISO timestamp of last successful sync */
  tools: Record<string, string>;
  /** ISO timestamp of last global sync */
  lastGlobalSync: string | null;
}

const DEFAULT_STATE: SyncState = {
  tools: {},
  lastGlobalSync: null,
};

export class SyncStateStore {
  private readonly statePath: string;

  constructor(statePath?: string) {
    this.statePath =
      statePath ?? path.join(os.homedir(), ".dotai", ".sync-state.json");
  }

  async load(): Promise<SyncState> {
    try {
      if (await fs.pathExists(this.statePath)) {
        const raw = await fs.readFile(this.statePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<SyncState>;
        return {
          tools: parsed.tools ?? {},
          lastGlobalSync: parsed.lastGlobalSync ?? null,
        };
      }
    } catch {
      // Corrupted file 鈥?return defaults
    }
    return { ...DEFAULT_STATE, tools: {} };
  }

  async save(state: SyncState): Promise<void> {
    await fs.ensureDir(path.dirname(this.statePath));
    // Ensure the file exists before locking
    await fs.ensureFile(this.statePath);

    // Use file lock to prevent concurrent write conflicts
    const release = await lockfile.lock(this.statePath, {
      stale: 5000, // Lock becomes stale after 5 seconds
      retries: {
        retries: 10,
        factor: 2,
        minTimeout: 100,
        maxTimeout: 1000,
      },
    });

    try {
      // Re-read the latest state after acquiring lock
      const latestState = await this.load();

      // Merge the new state with latest state (keep newer timestamps)
      const mergedState: SyncState = {
        tools: { ...latestState.tools, ...state.tools },
        lastGlobalSync:
          state.lastGlobalSync ?? latestState.lastGlobalSync,
      };

      await fs.writeFile(
        this.statePath,
        JSON.stringify(mergedState, null, 2),
        "utf-8"
      );
    } finally {
      await release();
    }
  }

  async recordToolSync(toolId: string, timestamp: Date): Promise<void> {
    const state = await this.load();
    state.tools[toolId] = timestamp.toISOString();
    await this.save(state);
  }

  async recordGlobalSync(
    toolResults: Array<{ toolId: string; success: boolean }>,
    timestamp: Date
  ): Promise<void> {
    const state = await this.load();
    state.lastGlobalSync = timestamp.toISOString();
    for (const result of toolResults) {
      if (result.success) {
        state.tools[result.toolId] = timestamp.toISOString();
      }
    }
    await this.save(state);
  }

  async getToolSyncTime(toolId: string): Promise<Date | null> {
    const state = await this.load();
    const iso = state.tools[toolId];
    return iso ? new Date(iso) : null;
  }
}