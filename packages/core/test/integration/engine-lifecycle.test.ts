import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { createDotAIEngine, BUILT_IN_TOOL_IDS } from "../../src/engine.js";
import { ConfigWriter } from "../../src/config/writer.js";
import { ConfigResolver } from "../../src/config/resolver.js";
import type { DotAISettings, SyncEvent, ResolvedConfig } from "../../src/types.js";
import type { CreateEngineOptions } from "../../src/engine.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-integ-engine-lifecycle");
const SETTINGS_PATH = path.join(TEST_DIR, "settings.yaml");
const PROJECT_DIR = path.join(TEST_DIR, "project");

const INITIAL_SETTINGS: DotAISettings = {
  repository: { url: "git@github.com:team/config.git", branch: "main", auth: "ssh" },
  sync: { autoSync: true, intervalMinutes: 15, tools: ["cursor", "claude"], overrideMode: "overwrite" },
  log: { level: "info" },
};

/**
 * Helper: resolve config first to discover repoLocalPath, ensure that
 * directory exists (simple-git requires baseDir to be a real path),
 * then create the engine.
 */
async function createTestEngine(opts?: CreateEngineOptions) {
  const cfgPath = opts?.configPath ?? SETTINGS_PATH;
  const projPath = opts?.projectPath ?? PROJECT_DIR;
  const resolver = new ConfigResolver(cfgPath);
  let config: ResolvedConfig;
  if (opts?.settingsOverrides) {
    config = resolver.resolveWithOverrides(projPath, opts.settingsOverrides);
  } else {
    config = resolver.resolve(projPath);
  }
  // Ensure cache directory exists so simple-git doesn't throw
  await fs.ensureDir(config.repoLocalPath);

  return createDotAIEngine({
    configPath: cfgPath,
    projectPath: projPath,
    settingsOverrides: opts?.settingsOverrides,
  });
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(PROJECT_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("Integration: Engine Lifecycle", () => {
  it("should create engine with correct initial config from YAML", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(INITIAL_SETTINGS);

    const engine = await createTestEngine();

    expect(engine.config.settings.repository.url).toBe("git@github.com:team/config.git");
    expect(engine.config.settings.repository.branch).toBe("main");
    expect(engine.config.settings.repository.auth).toBe("ssh");
    expect(engine.config.settings.sync.tools).toEqual(["cursor", "claude"]);
    expect(engine.config.settings.sync.intervalMinutes).toBe(15);
    expect(engine.config.effectiveTools).toEqual(["cursor", "claude"]);
  });

  it("should reload config after external YAML change", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(INITIAL_SETTINGS);

    const engine = await createTestEngine();

    // Verify initial state
    expect(engine.config.settings.sync.intervalMinutes).toBe(15);
    expect(engine.config.settings.sync.autoSync).toBe(true);

    // Update YAML externally
    await writer.updateSettings({
      sync: { autoSync: false, intervalMinutes: 60, tools: "all", overrideMode: "skip" },
    });

    // Ensure new cache dir exists (URL unchanged so same path, but be safe)
    const resolver = new ConfigResolver(SETTINGS_PATH);
    const newConfig = resolver.resolve(PROJECT_DIR);
    await fs.ensureDir(newConfig.repoLocalPath);

    // Reload
    engine.reloadConfig();

    // Verify updated state
    expect(engine.config.settings.sync.autoSync).toBe(false);
    expect(engine.config.settings.sync.intervalMinutes).toBe(60);
    expect(engine.config.settings.sync.tools).toBe("all");
    expect(engine.config.settings.sync.overrideMode).toBe("skip");
    // Repository should remain unchanged
    expect(engine.config.settings.repository.url).toBe("git@github.com:team/config.git");
  });

  it("should apply settings overrides at runtime", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(INITIAL_SETTINGS);

    const engine = await createTestEngine();

    // Ensure cache dir for new URL
    const resolver = new ConfigResolver(SETTINGS_PATH);
    const newConfig = resolver.resolveWithOverrides(PROJECT_DIR, {
      repository: { url: "git@github.com:new/repo.git", branch: "develop", auth: "https" },
    });
    await fs.ensureDir(newConfig.repoLocalPath);

    engine.applySettings({
      repository: { url: "git@github.com:new/repo.git", branch: "develop", auth: "https" },
    });

    expect(engine.config.settings.repository.url).toBe("git@github.com:new/repo.git");
    expect(engine.config.settings.repository.branch).toBe("develop");
    expect(engine.config.settings.repository.auth).toBe("https");
    // Sync settings should be preserved from YAML
    expect(engine.config.settings.sync.intervalMinutes).toBe(15);
    expect(engine.config.settings.sync.tools).toEqual(["cursor", "claude"]);
  });

  it("should create engine with default config when no YAML exists", async () => {
    const nonExistentPath = path.join(TEST_DIR, "nonexistent.yaml");
    const engine = await createTestEngine({ configPath: nonExistentPath });

    expect(engine.config.settings.repository.url).toBe("");
    expect(engine.config.settings.repository.branch).toBe("main");
    expect(engine.config.settings.repository.auth).toBe("ssh");
    expect(engine.config.settings.sync.autoSync).toBe(true);
    expect(engine.config.settings.sync.tools).toBe("all");
    expect(engine.config.settings.log.level).toBe("info");
  });

  it("should support settingsOverrides at creation time", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(INITIAL_SETTINGS);

    const engine = await createTestEngine({
      settingsOverrides: {
        sync: { autoSync: false, intervalMinutes: 0, tools: "all", overrideMode: "skip" },
      },
    });

    // Overridden fields
    expect(engine.config.settings.sync.autoSync).toBe(false);
    expect(engine.config.settings.sync.tools).toBe("all");
    expect(engine.config.settings.sync.overrideMode).toBe("skip");
    // YAML fields preserved
    expect(engine.config.settings.repository.url).toBe("git@github.com:team/config.git");
    expect(engine.config.settings.log.level).toBe("info");
  });

  it("should export BUILT_IN_TOOL_IDS with all 14 tools", () => {
    expect(BUILT_IN_TOOL_IDS).toEqual([
      "cursor", "claude", "copilot", "windsurf", "cline", "roo", "codex", "qoder",
      "codebuddy", "trae", "lingma", "antigravity", "gemini", "iflow",
    ]);
    expect(BUILT_IN_TOOL_IDS).toHaveLength(14);
  });

  it("should provide working event bus", async () => {
    const nonExistentPath = path.join(TEST_DIR, "nonexistent.yaml");
    const engine = await createTestEngine({ configPath: nonExistentPath });

    const events: SyncEvent[] = [];
    const disposable = engine.eventBus.on("*", (e) => events.push(e));

    engine.eventBus.emit({
      type: "sync:start",
      timestamp: new Date(),
      data: { test: true },
    });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("sync:start");

    disposable.dispose();

    // Should no longer receive events after dispose
    engine.eventBus.emit({
      type: "sync:complete",
      timestamp: new Date(),
      data: {},
    });
    expect(events).toHaveLength(1);
  });

  it("should update repoLocalPath when repository URL changes via reloadConfig", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(INITIAL_SETTINGS);

    const engine = await createTestEngine();
    const originalCachePath = engine.config.repoLocalPath;

    // Update URL in YAML
    await writer.updateSettings({
      repository: { url: "git@github.com:different/repo.git", branch: "main", auth: "ssh" },
    });

    // Ensure new cache dir exists
    const resolver = new ConfigResolver(SETTINGS_PATH);
    const newConfig = resolver.resolve(PROJECT_DIR);
    await fs.ensureDir(newConfig.repoLocalPath);

    engine.reloadConfig();

    // Different URL should produce different cache path
    expect(engine.config.repoLocalPath).not.toBe(originalCachePath);
    expect(engine.config.repoLocalPath).toContain("cache");
  });

  it("should allow custom adapter registration", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(INITIAL_SETTINGS);

    const engine = await createTestEngine();

    const mockAdapter = {
      toolId: "custom-tool",
      displayName: "Custom Tool",
      supportedScopes: ["user" as const],
      detect: async () => ({ installed: true }),
      getPathMappings: async () => [],
      validate: async () => ({ valid: true, errors: [] }),
      deploy: async () => ({ filesWritten: 0, filesSkipped: 0, errors: [] }),
      preview: async () => [],
    };

    // Should not throw
    engine.registerAdapter(mockAdapter);
  });
});
