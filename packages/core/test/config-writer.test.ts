import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml } from "yaml";
import { ConfigWriter } from "../src/config/writer.js";
import type { DotAISettings } from "../src/types.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-config-writer-test");
const TEST_SETTINGS_PATH = path.join(TEST_DIR, "settings.yaml");

const FULL_SETTINGS: DotAISettings = {
  repository: { url: "git@github.com:team/config.git", branch: "main", auth: "ssh" },
  sync: { autoSync: true, intervalMinutes: 30, tools: ["cursor", "claude"], overrideMode: "overwrite" },
  log: { level: "info" },
};

describe("ConfigWriter", () => {
  beforeEach(async () => {
    await fs.remove(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it("should create settings.yaml from scratch with writeSettings", async () => {
    const writer = new ConfigWriter(TEST_SETTINGS_PATH);
    await writer.writeSettings(FULL_SETTINGS);

    expect(await fs.pathExists(TEST_SETTINGS_PATH)).toBe(true);
    const raw = await fs.readFile(TEST_SETTINGS_PATH, "utf-8");
    const parsed = parseYaml(raw);
    expect(parsed.repository.url).toBe("git@github.com:team/config.git");
    expect(parsed.sync.intervalMinutes).toBe(30);
    expect(parsed.log.level).toBe("info");
  });

  it("should return settingsPath via getSettingsPath()", () => {
    const writer = new ConfigWriter(TEST_SETTINGS_PATH);
    expect(writer.getSettingsPath()).toBe(TEST_SETTINGS_PATH);
  });

  it("should merge partial updates on existing file via updateSettings", async () => {
    const writer = new ConfigWriter(TEST_SETTINGS_PATH);
    await writer.writeSettings(FULL_SETTINGS);

    // Update only repository branch
    await writer.updateSettings({ repository: { url: "git@github.com:team/config.git", branch: "develop", auth: "ssh" } });

    const raw = await fs.readFile(TEST_SETTINGS_PATH, "utf-8");
    const parsed = parseYaml(raw);
    expect(parsed.repository.branch).toBe("develop");
    // Sync section should be preserved
    expect(parsed.sync.intervalMinutes).toBe(30);
    expect(parsed.sync.tools).toEqual(["cursor", "claude"]);
  });

  it("should create file on updateSettings when file does not exist", async () => {
    const writer = new ConfigWriter(TEST_SETTINGS_PATH);
    await writer.updateSettings({ repository: { url: "git@example.com:repo.git", branch: "main", auth: "https" } });

    expect(await fs.pathExists(TEST_SETTINGS_PATH)).toBe(true);
    const raw = await fs.readFile(TEST_SETTINGS_PATH, "utf-8");
    const parsed = parseYaml(raw);
    expect(parsed.repository.url).toBe("git@example.com:repo.git");
  });

  it("should handle corrupted existing YAML gracefully", async () => {
    await fs.ensureDir(TEST_DIR);
    await fs.writeFile(TEST_SETTINGS_PATH, "{{invalid yaml::", "utf-8");

    const writer = new ConfigWriter(TEST_SETTINGS_PATH);
    await writer.updateSettings({ log: { level: "debug" } });

    const raw = await fs.readFile(TEST_SETTINGS_PATH, "utf-8");
    const parsed = parseYaml(raw);
    expect(parsed.log.level).toBe("debug");
  });

  it("should include YAML header comment with actual path", async () => {
    const writer = new ConfigWriter(TEST_SETTINGS_PATH);
    await writer.writeSettings(FULL_SETTINGS);

    const raw = await fs.readFile(TEST_SETTINGS_PATH, "utf-8");
    expect(raw.startsWith("# DotAI configuration")).toBe(true);
    expect(raw).toContain(TEST_SETTINGS_PATH);
  });
});