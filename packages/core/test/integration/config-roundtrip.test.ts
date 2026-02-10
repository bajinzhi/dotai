import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { ConfigWriter } from "../../src/config/writer.js";
import { ConfigResolver } from "../../src/config/resolver.js";
import type { DotAISettings } from "../../src/types.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-integ-config-roundtrip");
const SETTINGS_PATH = path.join(TEST_DIR, "settings.yaml");
const PROJECT_DIR = path.join(TEST_DIR, "project");

const FULL_SETTINGS: DotAISettings = {
  repository: { url: "git@github.com:team/ai-config.git", branch: "main", auth: "ssh" },
  sync: { autoSync: true, intervalMinutes: 30, tools: ["cursor", "claude", "copilot"], overrideMode: "overwrite" },
  log: { level: "info" },
};

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(PROJECT_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("Integration: Config Round-trip (ConfigWriter -> ConfigResolver)", () => {
  it("should write full settings and read them back identically", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    const resolver = new ConfigResolver(SETTINGS_PATH);

    await writer.writeSettings(FULL_SETTINGS);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.settings.repository.url).toBe(FULL_SETTINGS.repository.url);
    expect(config.settings.repository.branch).toBe(FULL_SETTINGS.repository.branch);
    expect(config.settings.repository.auth).toBe(FULL_SETTINGS.repository.auth);
    expect(config.settings.sync.autoSync).toBe(FULL_SETTINGS.sync.autoSync);
    expect(config.settings.sync.intervalMinutes).toBe(FULL_SETTINGS.sync.intervalMinutes);
    expect(config.settings.sync.tools).toEqual(FULL_SETTINGS.sync.tools);
    expect(config.settings.sync.overrideMode).toBe(FULL_SETTINGS.sync.overrideMode);
    expect(config.settings.log.level).toBe(FULL_SETTINGS.log.level);
  });

  it("should handle partial update then read back merged result", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    const resolver = new ConfigResolver(SETTINGS_PATH);

    await writer.writeSettings(FULL_SETTINGS);
    await writer.updateSettings({
      sync: { autoSync: false, intervalMinutes: 60, tools: "all", overrideMode: "skip" },
    });

    const config = resolver.resolve(PROJECT_DIR);

    // Repository section should be unchanged
    expect(config.settings.repository.url).toBe(FULL_SETTINGS.repository.url);
    expect(config.settings.repository.branch).toBe("main");
    // Sync section should reflect update
    expect(config.settings.sync.autoSync).toBe(false);
    expect(config.settings.sync.intervalMinutes).toBe(60);
    expect(config.settings.sync.tools).toBe("all");
    expect(config.settings.sync.overrideMode).toBe("skip");
  });

  it("should preserve YAML header comment through update cycle", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);

    await writer.writeSettings(FULL_SETTINGS);
    const raw1 = await fs.readFile(SETTINGS_PATH, "utf-8");
    expect(raw1.startsWith("# DotAI configuration")).toBe(true);
    expect(raw1).toContain(SETTINGS_PATH);

    await writer.updateSettings({ log: { level: "debug" } });
    const raw2 = await fs.readFile(SETTINGS_PATH, "utf-8");
    expect(raw2.startsWith("# DotAI configuration")).toBe(true);
    expect(raw2).toContain(SETTINGS_PATH);
  });

  it("should compute repoLocalPath consistently from URL", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    const resolver = new ConfigResolver(SETTINGS_PATH);

    await writer.writeSettings(FULL_SETTINGS);
    const config1 = resolver.resolve(PROJECT_DIR);
    const config2 = resolver.resolve(PROJECT_DIR);

    expect(config1.repoLocalPath).toBe(config2.repoLocalPath);
    expect(config1.repoLocalPath).toContain("cache");
  });

  it("should round-trip tools: 'all' correctly", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    const resolver = new ConfigResolver(SETTINGS_PATH);

    const settings: DotAISettings = {
      ...FULL_SETTINGS,
      sync: { ...FULL_SETTINGS.sync, tools: "all" },
    };
    await writer.writeSettings(settings);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.settings.sync.tools).toBe("all");
  });

  it("should round-trip all auth methods", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    const resolver = new ConfigResolver(SETTINGS_PATH);

    for (const auth of ["ssh", "https"] as const) {
      const settings: DotAISettings = {
        ...FULL_SETTINGS,
        repository: { ...FULL_SETTINGS.repository, auth },
      };
      await writer.writeSettings(settings);
      const config = resolver.resolve(PROJECT_DIR);
      expect(config.settings.repository.auth).toBe(auth);
    }
  });

  it("should handle multiple sequential updates without data loss", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    const resolver = new ConfigResolver(SETTINGS_PATH);

    await writer.writeSettings(FULL_SETTINGS);

    // Update 1: change repository branch
    await writer.updateSettings({
      repository: { url: FULL_SETTINGS.repository.url, branch: "develop", auth: "ssh" },
    });

    // Update 2: change log level
    await writer.updateSettings({ log: { level: "debug" } });

    // Update 3: change sync interval
    await writer.updateSettings({
      sync: { autoSync: true, intervalMinutes: 120, tools: ["cursor"], overrideMode: "overwrite" },
    });

    const config = resolver.resolve(PROJECT_DIR);
    expect(config.settings.repository.branch).toBe("develop");
    expect(config.settings.log.level).toBe("debug");
    expect(config.settings.sync.intervalMinutes).toBe(120);
    expect(config.settings.sync.tools).toEqual(["cursor"]);
  });

  it("should apply overrides on top of YAML settings", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    const resolver = new ConfigResolver(SETTINGS_PATH);

    await writer.writeSettings(FULL_SETTINGS);

    const config = resolver.resolveWithOverrides(PROJECT_DIR, {
      sync: { autoSync: false, intervalMinutes: 0, tools: "all", overrideMode: "ask" },
    });

    // Overridden fields
    expect(config.settings.sync.autoSync).toBe(false);
    expect(config.settings.sync.overrideMode).toBe("ask");
    // Non-overridden fields preserved
    expect(config.settings.repository.url).toBe(FULL_SETTINGS.repository.url);
    expect(config.settings.log.level).toBe("info");
  });
});
