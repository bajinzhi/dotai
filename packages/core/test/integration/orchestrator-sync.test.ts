import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { SyncOrchestrator } from "../../src/sync/orchestrator.js";
import { ConfigResolver } from "../../src/config/resolver.js";
import { EventBusImpl } from "../../src/events/event-bus.js";
import { AtomicFileWriterImpl } from "../../src/io/atomic-writer.js";
import { LockManagerImpl } from "../../src/io/lock.js";
import { ToolAdapterRegistry } from "../../src/adapters/registry.js";
import { SyncStateStore } from "../../src/sync/state-store.js";
import { AbstractToolAdapter } from "../../src/adapters/base.js";
import type { GitProvider } from "../../src/git/provider.js";
import type { PullResult, RepoStatus, ToolDetectResult, SyncEvent } from "../../src/types.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-integ-orchestrator");
const SETTINGS_PATH = path.join(TEST_DIR, "settings.yaml");
const REPO_DIR = path.join(TEST_DIR, "repo");
const PROJECT_DIR = path.join(TEST_DIR, "project");
const TARGET_DIR = path.join(TEST_DIR, "target");
const LOCK_FILE = path.join(TEST_DIR, ".sync.lock");
const STATE_FILE = path.join(TEST_DIR, ".sync-state.json");

// ─── Mock GitProvider ──────────────────────────────────────────────────────────

class MockGitProvider implements GitProvider {
  constructor(private readonly localPath: string) {}

  async pull(): Promise<PullResult> {
    return {
      updated: true,
      commitHash: "abc123def456",
      previousHash: null,
      changedFiles: [],
      fromCache: false,
    };
  }

  async getStatus(): Promise<RepoStatus> {
    return {
      localCommit: "abc123def456",
      remoteCommit: "abc123def456",
      isOffline: false,
      lastSyncTime: new Date(),
      cachePath: this.localPath,
    };
  }

  getLocalPath(): string {
    return this.localPath;
  }

  async checkConnectivity(): Promise<boolean> {
    return true;
  }
}

// ─── Test Adapter ──────────────────────────────────────────────────────────────

class IntegTestAdapter extends AbstractToolAdapter {
  constructor(repoPath: string, toolId: string, displayName: string) {
    super(repoPath, {
      toolId,
      displayName,
      supportedScopes: ["user"],
      repoDirName: toolId,
      scopeConfigs: {
        user: {
          repoSubPath: "config",
          targetResolver: () => path.join(TARGET_DIR, toolId),
          filePattern: "**/*",
        },
        project: undefined,
      },
      allowedExtensions: [], // allow all
    });
  }

  async detect(): Promise<ToolDetectResult> {
    return { installed: true };
  }
}

class FailingDetectAdapter extends IntegTestAdapter {
  async detect(): Promise<ToolDetectResult> {
    throw new Error("probe failed");
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function writeMinimalSettings(): void {
  const settingsContent = [
    "repository:",
    '  url: "git@github.com:test/repo.git"',
    '  branch: "main"',
    '  auth: "ssh"',
    "sync:",
    "  autoSync: false",
    "  intervalMinutes: 0",
    '  tools: "all"',
    '  overrideMode: "overwrite"',
  ].join("\n");
  fs.ensureDirSync(path.dirname(SETTINGS_PATH));
  fs.writeFileSync(SETTINGS_PATH, settingsContent);
}

function writeUninitializedSettings(): void {
  const settingsContent = [
    "repository:",
    '  url: ""',
    '  branch: "main"',
    '  auth: "ssh"',
    "sync:",
    "  autoSync: false",
    "  intervalMinutes: 0",
    '  tools: "all"',
    '  overrideMode: "overwrite"',
  ].join("\n");
  fs.ensureDirSync(path.dirname(SETTINGS_PATH));
  fs.writeFileSync(SETTINGS_PATH, settingsContent);
}

function createOrchestrator() {
  writeMinimalSettings();

  const eventBus = new EventBusImpl();
  const configResolver = new ConfigResolver(SETTINGS_PATH);
  const config = configResolver.resolve(PROJECT_DIR);
  const gitProvider = new MockGitProvider(REPO_DIR);
  const registry = new ToolAdapterRegistry();
  const fileWriter = new AtomicFileWriterImpl();
  const lockManager = new LockManagerImpl({ lockFile: LOCK_FILE, staleTimeout: 60_000 });
  const syncStateStore = new SyncStateStore(STATE_FILE);

  const orchestrator = new SyncOrchestrator({
    configResolver,
    gitProvider,
    registry,
    fileWriter,
    lockManager,
    eventBus,
    config,
    syncStateStore,
  });

  return { orchestrator, eventBus, registry, syncStateStore };
}

function createUninitializedOrchestrator() {
  writeUninitializedSettings();

  const eventBus = new EventBusImpl();
  const configResolver = new ConfigResolver(SETTINGS_PATH);
  const config = configResolver.resolve(PROJECT_DIR);
  const gitProvider = new MockGitProvider(REPO_DIR);
  const registry = new ToolAdapterRegistry();
  const fileWriter = new AtomicFileWriterImpl();
  const lockManager = new LockManagerImpl({ lockFile: LOCK_FILE, staleTimeout: 60_000 });
  const syncStateStore = new SyncStateStore(STATE_FILE);

  const orchestrator = new SyncOrchestrator({
    configResolver,
    gitProvider,
    registry,
    fileWriter,
    lockManager,
    eventBus,
    config,
    syncStateStore,
  });

  return { orchestrator };
}

// ─── Test Suite ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(REPO_DIR);
  await fs.ensureDir(PROJECT_DIR);
  await fs.ensureDir(TARGET_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("Integration: SyncOrchestrator Full Pipeline", () => {
  it("should complete full sync cycle and emit events in correct order", async () => {
    const { orchestrator, eventBus, registry } = createOrchestrator();

    // Set up repo: tool-a/user/config/settings.json
    const toolADir = path.join(REPO_DIR, "tool-a", "user", "config");
    await fs.ensureDir(toolADir);
    await fs.writeFile(path.join(toolADir, "settings.json"), '{"key": "value"}');

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));

    // Collect events
    const events: SyncEvent[] = [];
    eventBus.on("*", (e) => events.push(e));

    const report = await orchestrator.sync({ projectPath: PROJECT_DIR });

    // Verify report
    expect(report.success).toBe(true);
    expect(report.totalFiles).toBe(1);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].tool).toBe("tool-a");
    expect(report.results[0].status).toBe("success");
    expect(report.results[0].filesDeployed).toBe(1);
    expect(report.errors).toHaveLength(0);

    // Verify file was deployed
    const targetFile = path.join(TARGET_DIR, "tool-a", "settings.json");
    expect(await fs.pathExists(targetFile)).toBe(true);
    const content = await fs.readFile(targetFile, "utf-8");
    expect(content).toBe('{"key": "value"}');

    // Verify event sequence
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("sync:start");
    expect(eventTypes).toContain("lock:acquired");
    expect(eventTypes).toContain("tool:deploy:start");
    expect(eventTypes).toContain("tool:deploy:complete");
    expect(eventTypes).toContain("lock:released");
    expect(eventTypes).toContain("sync:complete");

    // Verify ordering
    const indexOf = (t: string) => eventTypes.indexOf(t as any);
    expect(indexOf("sync:start")).toBeLessThan(indexOf("sync:complete"));
    expect(indexOf("lock:acquired")).toBeLessThan(indexOf("lock:released"));
    expect(indexOf("tool:deploy:start")).toBeLessThan(indexOf("tool:deploy:complete"));
  });

  it("should sync multiple tools and record state", async () => {
    const { orchestrator, registry, syncStateStore } = createOrchestrator();

    for (const toolId of ["tool-a", "tool-b"]) {
      const dir = path.join(REPO_DIR, toolId, "user", "config");
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, `${toolId}.txt`), `content for ${toolId}`);
    }

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));
    registry.register(new IntegTestAdapter(REPO_DIR, "tool-b", "Tool B"));

    const report = await orchestrator.sync({ projectPath: PROJECT_DIR });

    expect(report.success).toBe(true);
    expect(report.totalFiles).toBe(2);
    expect(report.results).toHaveLength(2);

    // Verify both target files exist
    expect(await fs.pathExists(path.join(TARGET_DIR, "tool-a", "tool-a.txt"))).toBe(true);
    expect(await fs.pathExists(path.join(TARGET_DIR, "tool-b", "tool-b.txt"))).toBe(true);

    // Verify state was persisted
    const stateA = await syncStateStore.getToolSyncTime("tool-a");
    const stateB = await syncStateStore.getToolSyncTime("tool-b");
    expect(stateA).not.toBeNull();
    expect(stateB).not.toBeNull();
  });

  it("should filter tools when tools option is specified", async () => {
    const { orchestrator, registry } = createOrchestrator();

    for (const toolId of ["tool-a", "tool-b"]) {
      const dir = path.join(REPO_DIR, toolId, "user", "config");
      await fs.ensureDir(dir);
      await fs.writeFile(path.join(dir, "file.txt"), `content`);
    }

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));
    registry.register(new IntegTestAdapter(REPO_DIR, "tool-b", "Tool B"));

    // Only sync tool-a
    const report = await orchestrator.sync({ tools: ["tool-a"], projectPath: PROJECT_DIR });

    expect(report.totalFiles).toBe(1);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].tool).toBe("tool-a");

    // tool-b target should not exist
    expect(await fs.pathExists(path.join(TARGET_DIR, "tool-b", "file.txt"))).toBe(false);
  });

  it("should support dry-run without writing files", async () => {
    const { orchestrator, registry } = createOrchestrator();

    const toolADir = path.join(REPO_DIR, "tool-a", "user", "config");
    await fs.ensureDir(toolADir);
    await fs.writeFile(path.join(toolADir, "file.txt"), "content");

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));

    const report = await orchestrator.sync({ dryRun: true, projectPath: PROJECT_DIR });

    expect(report.success).toBe(true);
    expect(report.totalFiles).toBe(1);

    // File should NOT be deployed in dry-run mode
    expect(await fs.pathExists(path.join(TARGET_DIR, "tool-a", "file.txt"))).toBe(false);
  });

  it("should handle unregistered tool gracefully", async () => {
    const { orchestrator } = createOrchestrator();

    // Sync a tool that has no adapter registered
    const report = await orchestrator.sync({ tools: ["nonexistent"], projectPath: PROJECT_DIR });

    expect(report.success).toBe(true);
    expect(report.results).toHaveLength(1);
    expect(report.results[0].status).toBe("skipped");
    expect(report.results[0].reason).toContain("No adapter registered");
  });

  it("should generate diff report for new files", async () => {
    const { orchestrator, registry } = createOrchestrator();

    const toolADir = path.join(REPO_DIR, "tool-a", "user", "config");
    await fs.ensureDir(toolADir);
    await fs.writeFile(path.join(toolADir, "new-file.txt"), "new content");

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));

    const diff = await orchestrator.diff({ projectPath: PROJECT_DIR });

    expect(diff.hasChanges).toBe(true);
    expect(diff.changes.length).toBeGreaterThanOrEqual(1);
    expect(diff.changes[0].status).toBe("added");
    expect(diff.changes[0].tool).toBe("tool-a");
  });

  it("should detect modified files in diff", async () => {
    const { orchestrator, registry } = createOrchestrator();

    const toolADir = path.join(REPO_DIR, "tool-a", "user", "config");
    await fs.ensureDir(toolADir);
    await fs.writeFile(path.join(toolADir, "config.json"), '{"version": 2}');

    // Pre-create target with different content
    const targetToolA = path.join(TARGET_DIR, "tool-a");
    await fs.ensureDir(targetToolA);
    await fs.writeFile(path.join(targetToolA, "config.json"), '{"version": 1}');

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));

    const diff = await orchestrator.diff({ projectPath: PROJECT_DIR });

    expect(diff.hasChanges).toBe(true);
    expect(diff.changes[0].status).toBe("modified");
  });

  it("should report status for registered tools", async () => {
    const { orchestrator, registry } = createOrchestrator();

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));
    registry.register(new IntegTestAdapter(REPO_DIR, "tool-b", "Tool B"));

    const status = await orchestrator.status({ projectPath: PROJECT_DIR });

    expect(status.repo.localCommit).toBe("abc123def456");
    expect(status.repo.isOffline).toBe(false);
    expect(status.tools).toHaveLength(2);
    expect(status.tools.map((t) => t.toolId)).toEqual(["tool-a", "tool-b"]);
    expect(status.tools[0].installed).toBe(true);
    expect(status.tools[1].installed).toBe(true);
  });

  it("should continue tool detection when one adapter throws", async () => {
    const { orchestrator, registry } = createOrchestrator();

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));
    registry.register(new FailingDetectAdapter(REPO_DIR, "tool-b", "Tool B"));

    const detect = await orchestrator.detectTools();

    expect(detect.tools).toHaveLength(2);
    expect(detect.tools[0]).toMatchObject({
      toolId: "tool-a",
      installed: true,
    });
    expect(detect.tools[1].toolId).toBe("tool-b");
    expect(detect.tools[1].installed).toBe(false);
    expect(detect.tools[1].reason).toContain("Detection failed");
    expect(detect.tools[1].reason).toContain("probe failed");
  });

  it("should validate repo structure", async () => {
    const { orchestrator, registry } = createOrchestrator();

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));

    const report = await orchestrator.validate({ projectPath: PROJECT_DIR });
    expect(report.valid).toBe(true);
    expect(report.results).toHaveLength(0);
  });

  it("should generate preview without side effects", async () => {
    const { orchestrator, registry } = createOrchestrator();

    const toolADir = path.join(REPO_DIR, "tool-a", "user", "config");
    await fs.ensureDir(toolADir);
    await fs.writeFile(path.join(toolADir, "preview.txt"), "preview content");

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));

    const preview = await orchestrator.preview({ projectPath: PROJECT_DIR });

    expect(preview.length).toBe(1);
    expect(preview[0].action).toBe("create");
    expect(preview[0].sourcePath).toContain("preview.txt");

    // No files should have been written
    expect(await fs.pathExists(path.join(TARGET_DIR, "tool-a", "preview.txt"))).toBe(false);
  });

  it("should record sync timing in report", async () => {
    const { orchestrator, registry } = createOrchestrator();

    registry.register(new IntegTestAdapter(REPO_DIR, "tool-a", "Tool A"));

    const before = new Date();
    const report = await orchestrator.sync({ projectPath: PROJECT_DIR });
    const after = new Date();

    expect(report.startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(report.endTime.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(report.startTime.getTime()).toBeLessThanOrEqual(report.endTime.getTime());
  });

  it("should fail fast when repository is not initialized", async () => {
    const { orchestrator } = createUninitializedOrchestrator();

    await expect(orchestrator.sync({ projectPath: PROJECT_DIR })).rejects.toThrow(
      "DotAI is not initialized"
    );
    await expect(orchestrator.preview({ projectPath: PROJECT_DIR })).rejects.toThrow(
      "DotAI is not initialized"
    );
    await expect(orchestrator.diff({ projectPath: PROJECT_DIR })).rejects.toThrow(
      "DotAI is not initialized"
    );
    await expect(orchestrator.validate({ projectPath: PROJECT_DIR })).rejects.toThrow(
      "DotAI is not initialized"
    );
  });
});
