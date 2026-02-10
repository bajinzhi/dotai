import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { CodexAdapter } from "../src/adapters/codex.js";
import type { DeployContext } from "../src/types.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-codex-adapter");
const REPO_DIR = path.join(TEST_DIR, "repo");
const HOME_DIR = path.join(TEST_DIR, "home");
const PROJECT_DIR = path.join(TEST_DIR, "project");

const context: DeployContext = {
  projectPath: PROJECT_DIR,
  userHome: HOME_DIR,
  platform: process.platform as "win32" | "darwin" | "linux",
  overrideMode: "overwrite",
};

describe("CodexAdapter mappings", () => {
  beforeEach(async () => {
    await fs.remove(TEST_DIR);
    await fs.ensureDir(REPO_DIR);
    await fs.ensureDir(HOME_DIR);
    await fs.ensureDir(PROJECT_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it("maps user-level AGENTS files to ~/.codex", async () => {
    const userBase = path.join(REPO_DIR, "codex", "user");
    await fs.ensureDir(userBase);
    await fs.writeFile(path.join(userBase, "AGENTS.md"), "# user agents");
    await fs.writeFile(path.join(userBase, "AGENTS.override.md"), "# user override");

    const adapter = new CodexAdapter(REPO_DIR);
    const mappings = await adapter.getPathMappings("user", context);
    const targets = mappings.map((m) => m.targetPath).sort();

    expect(targets).toContain(path.join(HOME_DIR, ".codex", "AGENTS.md"));
    expect(targets).toContain(path.join(HOME_DIR, ".codex", "AGENTS.override.md"));
  });

  it("maps project-level AGENTS files to project root", async () => {
    const projectBase = path.join(REPO_DIR, "codex", "project");
    await fs.ensureDir(projectBase);
    await fs.writeFile(path.join(projectBase, "AGENTS.md"), "# project agents");
    await fs.writeFile(path.join(projectBase, "AGENTS.override.md"), "# project override");

    const adapter = new CodexAdapter(REPO_DIR);
    const mappings = await adapter.getPathMappings("project", context);
    const targets = mappings.map((m) => m.targetPath).sort();

    expect(targets).toContain(path.join(PROJECT_DIR, "AGENTS.md"));
    expect(targets).toContain(path.join(PROJECT_DIR, "AGENTS.override.md"));
  });
});
