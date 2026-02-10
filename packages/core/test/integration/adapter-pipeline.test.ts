import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { AbstractToolAdapter } from "../../src/adapters/base.js";
import { AtomicFileWriterImpl } from "../../src/io/atomic-writer.js";
import type { ToolDetectResult, DeployContext } from "../../src/types.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-integ-adapter-pipeline");
const REPO_DIR = path.join(TEST_DIR, "repo");
const TARGET_DIR = path.join(TEST_DIR, "target");
const PROJECT_DIR = path.join(TEST_DIR, "project");

/**
 * Test adapter with controlled detection and configurable scopes.
 * Uses TestTool directory structure: test-tool/user/config/** and test-tool/project/rules/**
 */
class TestToolAdapter extends AbstractToolAdapter {
  private readonly _installed: boolean;

  constructor(repoPath: string, installed = true) {
    super(repoPath, {
      toolId: "test-tool",
      displayName: "Test Tool",
      supportedScopes: ["user", "project"],
      repoDirName: "test-tool",
      scopeConfigs: {
        user: {
          repoSubPath: "config",
          targetResolver: () => path.join(TARGET_DIR, "user"),
          filePattern: "**/*",
        },
        project: {
          repoSubPath: "rules",
          targetResolver: (ctx) => path.join(ctx.projectPath, ".test-tool"),
          filePattern: "**/*.md",
        },
      },
      allowedExtensions: [".md", ".txt", ".json"],
    });
    this._installed = installed;
  }

  async detect(): Promise<ToolDetectResult> {
    return {
      installed: this._installed,
      location: this._installed ? TARGET_DIR : undefined,
      reason: this._installed ? undefined : "Test tool not installed",
    };
  }
}

beforeEach(async () => {
  await fs.remove(TEST_DIR);
  await fs.ensureDir(REPO_DIR);
  await fs.ensureDir(TARGET_DIR);
  await fs.ensureDir(PROJECT_DIR);
});

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("Integration: Adapter Full Pipeline (detect -> map -> validate -> deploy)", () => {
  const writer = new AtomicFileWriterImpl();

  const context: DeployContext = {
    projectPath: PROJECT_DIR,
    userHome: TARGET_DIR,
    platform: process.platform as "win32" | "darwin" | "linux",
    overrideMode: "overwrite",
  };

  it("should execute complete user-scope pipeline: detect -> map -> validate -> deploy -> verify", async () => {
    // Set up repo structure: test-tool/user/config/setting.txt + config.json
    const userConfigDir = path.join(REPO_DIR, "test-tool", "user", "config");
    await fs.ensureDir(userConfigDir);
    await fs.writeFile(path.join(userConfigDir, "setting.txt"), "key = value");
    await fs.writeFile(path.join(userConfigDir, "config.json"), '{"theme": "dark"}');

    const adapter = new TestToolAdapter(REPO_DIR);

    // 1. Detect
    const detectResult = await adapter.detect();
    expect(detectResult.installed).toBe(true);

    // 2. Get path mappings
    const mappings = await adapter.getPathMappings("user", context);
    expect(mappings.length).toBe(2);
    for (const m of mappings) {
      expect(m.action).toBe("create");
      expect(m.scope).toBe("user");
      expect(m.sourcePath).toContain(path.join("test-tool", "user", "config"));
      expect(m.targetPath).toContain(path.join("target", "user"));
    }

    // 3. Validate
    const sourceFiles = mappings.map((m) => m.sourcePath);
    const validation = await adapter.validate(sourceFiles);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // 4. Deploy
    const deployResult = await adapter.deploy(mappings, writer);
    expect(deployResult.filesWritten).toBe(2);
    expect(deployResult.filesSkipped).toBe(0);
    expect(deployResult.errors).toHaveLength(0);

    // 5. Verify files at target
    for (const m of mappings) {
      expect(await fs.pathExists(m.targetPath)).toBe(true);
    }
    const settingContent = await fs.readFile(
      path.join(TARGET_DIR, "user", "setting.txt"), "utf-8"
    );
    expect(settingContent).toBe("key = value");
  });

  it("should execute project-scope pipeline with .md file pattern", async () => {
    const projectRulesDir = path.join(REPO_DIR, "test-tool", "project", "rules");
    await fs.ensureDir(projectRulesDir);
    await fs.writeFile(path.join(projectRulesDir, "guide.md"), "# Project Guide");
    await fs.writeFile(path.join(projectRulesDir, "notes.txt"), "should be excluded");

    const adapter = new TestToolAdapter(REPO_DIR);

    const mappings = await adapter.getPathMappings("project", context);
    // Only .md files should match the project scope pattern
    expect(mappings.length).toBe(1);
    expect(mappings[0].scope).toBe("project");

    const deployResult = await adapter.deploy(mappings, writer);
    expect(deployResult.filesWritten).toBe(1);

    const targetPath = path.join(PROJECT_DIR, ".test-tool", "guide.md");
    expect(await fs.pathExists(targetPath)).toBe(true);
    const content = await fs.readFile(targetPath, "utf-8");
    expect(content).toBe("# Project Guide");
  });

  it("should skip deployment when tool is not installed", async () => {
    const adapter = new TestToolAdapter(REPO_DIR, false);
    const detectResult = await adapter.detect();
    expect(detectResult.installed).toBe(false);
    expect(detectResult.reason).toBe("Test tool not installed");
  });

  it("should reject files with disallowed extensions", async () => {
    const adapter = new TestToolAdapter(REPO_DIR);
    const validation = await adapter.validate([
      "/fake/path/valid.md",
      "/fake/path/valid.txt",
      "/fake/path/valid.json",
      "/fake/path/invalid.exe",
      "/fake/path/invalid.bat",
    ]);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toHaveLength(2);
    expect(validation.errors[0].file).toContain("invalid.exe");
    expect(validation.errors[1].file).toContain("invalid.bat");
  });

  it("should skip existing files in 'skip' override mode", async () => {
    const userConfigDir = path.join(REPO_DIR, "test-tool", "user", "config");
    await fs.ensureDir(userConfigDir);
    await fs.writeFile(path.join(userConfigDir, "existing.txt"), "new content");

    // Pre-create target file with old content
    const targetUserDir = path.join(TARGET_DIR, "user");
    await fs.ensureDir(targetUserDir);
    await fs.writeFile(path.join(targetUserDir, "existing.txt"), "old content");

    const skipContext: DeployContext = { ...context, overrideMode: "skip" };
    const adapter = new TestToolAdapter(REPO_DIR);

    const mappings = await adapter.getPathMappings("user", skipContext);
    expect(mappings[0].action).toBe("skip");

    const deployResult = await adapter.deploy(mappings, writer);
    expect(deployResult.filesSkipped).toBe(1);
    expect(deployResult.filesWritten).toBe(0);

    // Verify old content preserved
    const content = await fs.readFile(path.join(targetUserDir, "existing.txt"), "utf-8");
    expect(content).toBe("old content");
  });

  it("should overwrite existing files in 'overwrite' mode", async () => {
    const userConfigDir = path.join(REPO_DIR, "test-tool", "user", "config");
    await fs.ensureDir(userConfigDir);
    await fs.writeFile(path.join(userConfigDir, "existing.txt"), "new content");

    const targetUserDir = path.join(TARGET_DIR, "user");
    await fs.ensureDir(targetUserDir);
    await fs.writeFile(path.join(targetUserDir, "existing.txt"), "old content");

    const adapter = new TestToolAdapter(REPO_DIR);

    const mappings = await adapter.getPathMappings("user", context); // overwrite mode
    expect(mappings[0].action).toBe("overwrite");

    const deployResult = await adapter.deploy(mappings, writer);
    expect(deployResult.filesWritten).toBe(1);

    const content = await fs.readFile(path.join(targetUserDir, "existing.txt"), "utf-8");
    expect(content).toBe("new content");
  });

  it("should generate correct preview without writing files", async () => {
    const userConfigDir = path.join(REPO_DIR, "test-tool", "user", "config");
    await fs.ensureDir(userConfigDir);
    await fs.writeFile(path.join(userConfigDir, "a.txt"), "content a");
    await fs.writeFile(path.join(userConfigDir, "b.json"), '{"b": true}');

    const adapter = new TestToolAdapter(REPO_DIR);
    const mappings = await adapter.getPathMappings("user", context);
    const preview = await adapter.preview(mappings);

    expect(preview).toHaveLength(2);
    for (const item of preview) {
      expect(item.action).toBe("create");
      expect(item.sourcePath).toBeTruthy();
      expect(item.targetPath).toBeTruthy();
    }
  });

  it("should return empty mappings when repo directory does not exist", async () => {
    const adapter = new TestToolAdapter(REPO_DIR); // no files in repo
    const mappings = await adapter.getPathMappings("user", context);
    expect(mappings).toHaveLength(0);
  });

  it("should handle nested directory structures", async () => {
    const userConfigDir = path.join(REPO_DIR, "test-tool", "user", "config");
    await fs.ensureDir(path.join(userConfigDir, "sub", "deep"));
    await fs.writeFile(path.join(userConfigDir, "top.txt"), "top");
    await fs.writeFile(path.join(userConfigDir, "sub", "mid.txt"), "mid");
    await fs.writeFile(path.join(userConfigDir, "sub", "deep", "bottom.json"), '{"level":"deep"}');

    const adapter = new TestToolAdapter(REPO_DIR);
    const mappings = await adapter.getPathMappings("user", context);
    expect(mappings.length).toBe(3);

    const deployResult = await adapter.deploy(mappings, writer);
    expect(deployResult.filesWritten).toBe(3);

    // Verify nested structure preserved at target
    expect(await fs.pathExists(path.join(TARGET_DIR, "user", "top.txt"))).toBe(true);
    expect(await fs.pathExists(path.join(TARGET_DIR, "user", "sub", "mid.txt"))).toBe(true);
    expect(await fs.pathExists(path.join(TARGET_DIR, "user", "sub", "deep", "bottom.json"))).toBe(true);
  });
});
