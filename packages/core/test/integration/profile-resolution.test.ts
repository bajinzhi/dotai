import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { ConfigWriter } from "../../src/config/writer.js";
import { ConfigResolver } from "../../src/config/resolver.js";
import type { DotAISettings } from "../../src/types.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-integ-profile-resolution");
const SETTINGS_PATH = path.join(TEST_DIR, "settings.yaml");
const PROJECT_DIR = path.join(TEST_DIR, "project");

const BASE_SETTINGS: DotAISettings = {
  repository: { url: "git@github.com:team/config.git", branch: "main", auth: "ssh" },
  sync: { autoSync: true, intervalMinutes: 0, tools: "all", overrideMode: "overwrite" },
  log: { level: "info" },
};

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(PROJECT_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("Integration: Profile Resolution E2E", () => {
  it("should resolve config without profile — effectiveTools empty for 'all'", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(BASE_SETTINGS);

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.projectProfile).toBeNull();
    // When tools is "all", computeEffectiveTools returns [] (engine resolves at runtime via registry)
    expect(config.effectiveTools).toEqual([]);
    expect(config.configSources.project).toBeNull();
  });

  it("should override tools from project profile", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(BASE_SETTINGS);

    const profileDir = path.join(PROJECT_DIR, ".dotai");
    await fs.ensureDir(profileDir);
    await fs.writeFile(
      path.join(profileDir, "profile.yaml"),
      ['profile: "backend-java"', "tools:", "  - cursor", "  - claude"].join("\n")
    );

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.projectProfile).not.toBeNull();
    expect(config.projectProfile?.profile).toBe("backend-java");
    expect(config.effectiveTools).toEqual(["cursor", "claude"]);
    expect(config.configSources.project).toBe(profileDir);
  });

  it("should override repository URL from profile", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(BASE_SETTINGS);

    const profileDir = path.join(PROJECT_DIR, ".dotai");
    await fs.ensureDir(profileDir);
    await fs.writeFile(
      path.join(profileDir, "profile.yaml"),
      [
        'profile: "team-overrides"',
        "repository:",
        '  url: "git@github.com:team/special-config.git"',
        '  branch: "develop"',
      ].join("\n")
    );

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    // Cache path should be based on profile's URL (different from global)
    const globalConfig = new ConfigResolver(SETTINGS_PATH).resolve(
      path.join(TEST_DIR, "other-project") // different project without profile
    );
    expect(config.settings.repository.url).toBe("git@github.com:team/special-config.git");
    expect(config.settings.repository.branch).toBe("develop");
    expect(config.repoLocalPath).not.toBe(globalConfig.repoLocalPath);
    expect(config.repoLocalPath).toContain("cache");
  });

  it("should use global tools when profile has no tools", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings({
      ...BASE_SETTINGS,
      sync: { ...BASE_SETTINGS.sync, tools: ["copilot", "windsurf"] },
    });

    const profileDir = path.join(PROJECT_DIR, ".dotai");
    await fs.ensureDir(profileDir);
    await fs.writeFile(
      path.join(profileDir, "profile.yaml"),
      'profile: "minimal"' // No tools specified
    );

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.projectProfile?.profile).toBe("minimal");
    // Should fall back to global tools
    expect(config.effectiveTools).toEqual(["copilot", "windsurf"]);
  });

  it("should handle ConfigWriter + profile round-trip — profile takes precedence", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(BASE_SETTINGS);

    // Create profile with specific tools
    const profileDir = path.join(PROJECT_DIR, ".dotai");
    await fs.ensureDir(profileDir);
    await fs.writeFile(
      path.join(profileDir, "profile.yaml"),
      ['profile: "fullstack"', "tools:", "  - cursor", "  - copilot", "  - cline"].join("\n")
    );

    // Update global settings to have different tools
    await writer.updateSettings({
      sync: { autoSync: false, intervalMinutes: 30, tools: ["cursor"], overrideMode: "skip" },
    });

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    // Profile tools should take precedence over global tools
    expect(config.effectiveTools).toEqual(["cursor", "copilot", "cline"]);
    // Global settings should reflect the writer update
    expect(config.settings.sync.autoSync).toBe(false);
    expect(config.settings.sync.intervalMinutes).toBe(30);
  });

  it("should gracefully handle corrupted profile YAML", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(BASE_SETTINGS);

    const profileDir = path.join(PROJECT_DIR, ".dotai");
    await fs.ensureDir(profileDir);
    await fs.writeFile(path.join(profileDir, "profile.yaml"), "{{invalid yaml::");

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    // Should fall back gracefully
    expect(config.projectProfile).toBeNull();
    // Settings should still be loaded correctly from YAML
    expect(config.settings.repository.url).toBe(BASE_SETTINGS.repository.url);
  });

  it("should handle missing .dotai directory in project", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings({
      ...BASE_SETTINGS,
      sync: { ...BASE_SETTINGS.sync, tools: ["cursor", "claude", "copilot"] },
    });

    // No .dotai directory in project
    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.projectProfile).toBeNull();
    expect(config.configSources.project).toBeNull();
    // Should use global tools
    expect(config.effectiveTools).toEqual(["cursor", "claude", "copilot"]);
  });

  it("should handle profile with overrides field", async () => {
    const writer = new ConfigWriter(SETTINGS_PATH);
    await writer.writeSettings(BASE_SETTINGS);

    const profileDir = path.join(PROJECT_DIR, ".dotai");
    await fs.ensureDir(profileDir);
    await fs.writeFile(
      path.join(profileDir, "profile.yaml"),
      [
        'profile: "with-overrides"',
        "tools:",
        "  - cursor",
        "overrides:",
        '  theme: "dark"',
        '  language: "en"',
      ].join("\n")
    );

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.projectProfile?.profile).toBe("with-overrides");
    expect(config.projectProfile?.overrides).toEqual({ theme: "dark", language: "en" });
    expect(config.effectiveTools).toEqual(["cursor"]);
  });
});
