import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { ConfigResolver } from "../src/config/resolver.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-test-config");
const SETTINGS_PATH = path.join(TEST_DIR, "settings.yaml");
const PROJECT_DIR = path.join(TEST_DIR, "project");

beforeEach(async () => {
  await fs.ensureDir(TEST_DIR);
  await fs.ensureDir(PROJECT_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("ConfigResolver", () => {
  it("should return defaults when settings file does not exist", () => {
    const resolver = new ConfigResolver(path.join(TEST_DIR, "nonexistent.yaml"));
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.settings.repository.branch).toBe("main");
    expect(config.settings.sync.autoSync).toBe(true);
    expect(config.settings.log.level).toBe("info");
    expect(config.projectProfile).toBeNull();
  });

  it("should load settings from yaml file", async () => {
    const settingsContent = [
      "repository:",
      '  url: "git@github.com:team/config.git"',
      '  branch: "develop"',
      '  auth: "https"',
      "sync:",
      "  autoSync: false",
      "  intervalMinutes: 30",
      "  tools:",
      "    - cursor",
      "    - claude",
      "log:",
      '  level: "debug"',
    ].join("\n");
    await fs.writeFile(SETTINGS_PATH, settingsContent);

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.settings.repository.url).toBe("git@github.com:team/config.git");
    expect(config.settings.repository.branch).toBe("develop");
    expect(config.settings.repository.auth).toBe("https");
    expect(config.settings.sync.autoSync).toBe(false);
    expect(config.settings.sync.intervalMinutes).toBe(30);
    expect(config.settings.log.level).toBe("debug");
  });

  it("should load project profile when present", async () => {
    const profileDir = path.join(PROJECT_DIR, ".dotai");
    await fs.ensureDir(profileDir);
    const profileContent = [
      'profile: "backend-java"',
      "tools:",
      "  - cursor",
      "  - claude",
    ].join("\n");
    await fs.writeFile(path.join(profileDir, "profile.yaml"), profileContent);

    const resolver = new ConfigResolver(path.join(TEST_DIR, "nonexistent.yaml"));
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.projectProfile).not.toBeNull();
    expect(config.projectProfile?.profile).toBe("backend-java");
    expect(config.effectiveTools).toEqual(["cursor", "claude"]);
  });

  it("should compute repoLocalPath from repository url hash", async () => {
    const settingsContent = [
      "repository:",
      '  url: "git@github.com:team/config.git"',
    ].join("\n");
    await fs.writeFile(SETTINGS_PATH, settingsContent);

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolve(PROJECT_DIR);

    expect(config.repoLocalPath).toContain(".dotai");
    expect(config.repoLocalPath).toContain("cache");
  });

  it("should apply overrides from external settings", async () => {
    const settingsContent = [
      "repository:",
      '  url: "git@github.com:team/config.git"',
      '  branch: "main"',
      '  auth: "ssh"',
      "sync:",
      "  autoSync: true",
      "  intervalMinutes: 0",
      '  tools: "all"',
      '  overrideMode: "overwrite"',
    ].join("\n");
    await fs.writeFile(SETTINGS_PATH, settingsContent);

    const resolver = new ConfigResolver(SETTINGS_PATH);
    const config = resolver.resolveWithOverrides(PROJECT_DIR, {
      repository: {
        url: "git@github.com:team/override.git",
        branch: "develop",
        auth: "https",
      },
      sync: {
        autoSync: false,
        intervalMinutes: 30,
        tools: ["cursor", "claude"],
        overrideMode: "ask",
      },
    });

    expect(config.settings.repository.url).toBe("git@github.com:team/override.git");
    expect(config.settings.repository.branch).toBe("develop");
    expect(config.settings.repository.auth).toBe("https");
    expect(config.settings.sync.autoSync).toBe(false);
    expect(config.settings.sync.intervalMinutes).toBe(30);
    expect(config.settings.sync.overrideMode).toBe("ask");
    expect(config.effectiveTools).toEqual(["cursor", "claude"]);
    // repoLocalPath should use the overridden URL hash
    expect(config.repoLocalPath).toContain("cache");
  });

  it("should merge partial overrides keeping other defaults", async () => {
    const resolver = new ConfigResolver(path.join(TEST_DIR, "nonexistent.yaml"));
    const config = resolver.resolveWithOverrides(PROJECT_DIR, {
      sync: {
        autoSync: false,
        intervalMinutes: 15,
        tools: "all",
        overrideMode: "skip",
      },
    });

    // Repository should keep defaults
    expect(config.settings.repository.branch).toBe("main");
    expect(config.settings.repository.auth).toBe("ssh");
    // Sync should use overrides
    expect(config.settings.sync.autoSync).toBe(false);
    expect(config.settings.sync.intervalMinutes).toBe(15);
    expect(config.settings.sync.overrideMode).toBe("skip");
  });
});
