import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { CursorAdapter } from "../src/adapters/cursor.js";
import { CopilotAdapter } from "../src/adapters/copilot.js";
import { WindsurfAdapter } from "../src/adapters/windsurf.js";
import { ClineAdapter } from "../src/adapters/cline.js";
import { RooAdapter } from "../src/adapters/roo.js";
import { ClaudeAdapter } from "../src/adapters/claude.js";
import { QoderAdapter } from "../src/adapters/qoder.js";
import { AntigravityAdapter } from "../src/adapters/antigravity.js";
import { GeminiAdapter } from "../src/adapters/gemini.js";
import { IflowAdapter } from "../src/adapters/iflow.js";
import type { DeployContext } from "../src/types.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-multi-ide-capabilities");
const REPO_DIR = path.join(TEST_DIR, "repo");
const HOME_DIR = path.join(TEST_DIR, "home");
const PROJECT_DIR = path.join(TEST_DIR, "project");

const context: DeployContext = {
  projectPath: PROJECT_DIR,
  userHome: HOME_DIR,
  platform: process.platform as "win32" | "darwin" | "linux",
  overrideMode: "overwrite",
};

describe("Multi-IDE capability mappings", () => {
  beforeEach(async () => {
    await fs.remove(TEST_DIR);
    await fs.ensureDir(REPO_DIR);
    await fs.ensureDir(HOME_DIR);
    await fs.ensureDir(PROJECT_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  it("Cursor maps commands, skills, and agents", async () => {
    const base = path.join(REPO_DIR, "cursor", "project");
    await fs.ensureDir(path.join(base, "commands"));
    await fs.ensureDir(path.join(base, "skills"));
    await fs.ensureDir(path.join(base, "agents"));
    await fs.writeFile(path.join(base, "commands", "review.md"), "cmd");
    await fs.writeFile(path.join(base, "skills", "focus.md"), "skill");
    await fs.writeFile(path.join(base, "agents", "qa.md"), "agent");

    const adapter = new CursorAdapter(REPO_DIR);
    const mappings = await adapter.getPathMappings("project", context);
    const targets = mappings.map((m) => m.targetPath);

    expect(targets).toContain(path.join(PROJECT_DIR, ".cursor", "commands", "review.md"));
    expect(targets).toContain(path.join(PROJECT_DIR, ".cursor", "skills", "focus.md"));
    expect(targets).toContain(path.join(PROJECT_DIR, ".cursor", "agents", "qa.md"));
  });

  it("Copilot maps repository instructions", async () => {
    const base = path.join(REPO_DIR, "copilot", "project");
    await fs.ensureDir(path.join(base, "instructions"));
    await fs.writeFile(path.join(base, "copilot-instructions.md"), "copilot");
    await fs.writeFile(path.join(base, "instructions", "go.instructions.md"), "go");

    const adapter = new CopilotAdapter(REPO_DIR);
    const mappings = await adapter.getPathMappings("project", context);
    const targets = mappings.map((m) => m.targetPath);

    expect(targets).toContain(path.join(PROJECT_DIR, ".github", "copilot-instructions.md"));
    expect(targets).toContain(
      path.join(PROJECT_DIR, ".github", "instructions", "go.instructions.md")
    );
  });

  it("Windsurf maps rules", async () => {
    const base = path.join(REPO_DIR, "windsurf", "project");
    await fs.ensureDir(path.join(base, "rules"));
    await fs.writeFile(path.join(base, "rules", "team.md"), "rule");

    const adapter = new WindsurfAdapter(REPO_DIR);
    const mappings = await adapter.getPathMappings("project", context);
    const targets = mappings.map((m) => m.targetPath);
    expect(targets).toContain(path.join(PROJECT_DIR, ".windsurf", "rules", "team.md"));
  });

  it("Cline maps project .clinerules and user global rules", async () => {
    const projectBase = path.join(REPO_DIR, "cline", "project");
    const userBase = path.join(REPO_DIR, "cline", "user");
    await fs.ensureDir(path.join(projectBase, ".clinerules", "frontend"));
    await fs.ensureDir(path.join(userBase, ".clinerules"));
    await fs.writeFile(path.join(projectBase, ".clinerules", "frontend", "style.md"), "rule");
    await fs.writeFile(path.join(userBase, ".clinerules", "global.md"), "global-rule");

    const adapter = new ClineAdapter(REPO_DIR);
    const projectMappings = await adapter.getPathMappings("project", context);
    const userMappings = await adapter.getPathMappings("user", context);
    const projectTargets = projectMappings.map((m) => m.targetPath);
    const userTargets = userMappings.map((m) => m.targetPath);

    expect(projectTargets).toContain(
      path.join(PROJECT_DIR, ".clinerules", "frontend", "style.md")
    );
    expect(userTargets).toContain(
      path.join(HOME_DIR, "Documents", "Cline", "Rules", "global.md")
    );
  });

  it("Roo maps project rules and user global rules", async () => {
    const projectBase = path.join(REPO_DIR, "roo", "project");
    const userBase = path.join(REPO_DIR, "roo", "user");
    await fs.ensureDir(path.join(projectBase, ".roo", "rules"));
    await fs.ensureDir(path.join(userBase, ".roo", "rules-code"));
    await fs.writeFile(path.join(projectBase, ".roo", "rules", "team.md"), "rule");
    await fs.writeFile(path.join(projectBase, ".roorules"), "legacy");
    await fs.writeFile(path.join(projectBase, "AGENTS.md"), "agents");
    await fs.writeFile(path.join(userBase, ".roo", "rules-code", "global.md"), "global");

    const adapter = new RooAdapter(REPO_DIR);
    const projectMappings = await adapter.getPathMappings("project", context);
    const userMappings = await adapter.getPathMappings("user", context);

    expect(projectMappings.map((m) => m.targetPath)).toContain(
      path.join(PROJECT_DIR, ".roo", "rules", "team.md")
    );
    expect(projectMappings.map((m) => m.targetPath)).toContain(
      path.join(PROJECT_DIR, ".roorules")
    );
    expect(projectMappings.map((m) => m.targetPath)).toContain(
      path.join(PROJECT_DIR, "AGENTS.md")
    );
    expect(userMappings.map((m) => m.targetPath)).toContain(
      path.join(HOME_DIR, ".roo", "rules-code", "global.md")
    );
  });

  it("Claude maps CLAUDE.md and slash commands", async () => {
    const userBase = path.join(REPO_DIR, "claude", "user");
    const projectBase = path.join(REPO_DIR, "claude", "project");
    await fs.ensureDir(path.join(userBase, ".claude", "commands"));
    await fs.ensureDir(path.join(projectBase, ".claude", "commands"));
    await fs.ensureDir(projectBase);
    await fs.writeFile(path.join(userBase, "CLAUDE.md"), "user-claude");
    await fs.writeFile(path.join(projectBase, "CLAUDE.md"), "project-claude");
    await fs.writeFile(path.join(userBase, ".claude", "commands", "audit.md"), "cmd");
    await fs.writeFile(path.join(projectBase, ".claude", "commands", "run.md"), "cmd-project");

    const adapter = new ClaudeAdapter(REPO_DIR);
    const userMappings = await adapter.getPathMappings("user", context);
    const projectMappings = await adapter.getPathMappings("project", context);
    const userTargets = userMappings.map((m) => m.targetPath);
    const projectTargets = projectMappings.map((m) => m.targetPath);

    expect(userTargets).toContain(path.join(HOME_DIR, ".claude", "CLAUDE.md"));
    expect(userTargets).toContain(path.join(HOME_DIR, ".claude", "commands", "audit.md"));
    expect(projectTargets).toContain(path.join(PROJECT_DIR, "CLAUDE.md"));
    expect(projectTargets).toContain(path.join(PROJECT_DIR, ".claude", "commands", "run.md"));
  });

  it("Qoder maps rules, commands, skills, and agents for user/project scopes", async () => {
    const userBase = path.join(REPO_DIR, "qoder", "user");
    const projectBase = path.join(REPO_DIR, "qoder", "project");
    await fs.ensureDir(path.join(userBase, "commands"));
    await fs.ensureDir(path.join(userBase, "skills"));
    await fs.ensureDir(path.join(projectBase, "rules"));
    await fs.ensureDir(path.join(projectBase, "agents"));
    await fs.writeFile(path.join(userBase, "commands", "plan.md"), "user-cmd");
    await fs.writeFile(path.join(userBase, "skills", "focus.md"), "user-skill");
    await fs.writeFile(path.join(projectBase, "rules", "policy.md"), "rule");
    await fs.writeFile(path.join(projectBase, "agents", "owner.md"), "agent");

    const adapter = new QoderAdapter(REPO_DIR);
    const userMappings = await adapter.getPathMappings("user", context);
    const projectMappings = await adapter.getPathMappings("project", context);
    const userTargets = userMappings.map((m) => m.targetPath);
    const projectTargets = projectMappings.map((m) => m.targetPath);

    expect(userTargets).toContain(
      path.join(HOME_DIR, ".qoder", "commands", "plan.md")
    );
    expect(userTargets).toContain(
      path.join(HOME_DIR, ".qoder", "skills", "focus.md")
    );
    expect(projectTargets).toContain(
      path.join(PROJECT_DIR, ".qoder", "rules", "policy.md")
    );
    expect(projectTargets).toContain(
      path.join(PROJECT_DIR, ".qoder", "agents", "owner.md")
    );
    expect([...userTargets, ...projectTargets]).not.toContain(
      path.join(PROJECT_DIR, "AGENTS.md")
    );
  });

  it("Qoder-like tools map to .toolName for user/project scopes", async () => {
    const cases = [
      {
        repoDir: "antigravity",
        dotDir: ".antigravity",
        Adapter: AntigravityAdapter,
      },
      {
        repoDir: "gemini",
        dotDir: ".gemini",
        Adapter: GeminiAdapter,
        userRootFile: "GEMINI.md",
      },
      {
        repoDir: "iflow",
        dotDir: ".iflow",
        Adapter: IflowAdapter,
        userRootFile: "IFLOW.md",
      },
    ] as const;

    for (const c of cases) {
      const userBase = path.join(REPO_DIR, c.repoDir, "user");
      const projectBase = path.join(REPO_DIR, c.repoDir, "project");
      await fs.ensureDir(path.join(userBase, "commands"));
      await fs.ensureDir(path.join(projectBase, "agents"));
      await fs.writeFile(path.join(userBase, "commands", "plan.md"), "cmd");
      await fs.writeFile(path.join(projectBase, "agents", "ops.md"), "agent");
      if (c.userRootFile) {
        await fs.writeFile(path.join(userBase, c.userRootFile), "root");
      }

      const adapter = new c.Adapter(REPO_DIR);
      const userMappings = await adapter.getPathMappings("user", context);
      const projectMappings = await adapter.getPathMappings("project", context);

      expect(userMappings.map((m) => m.targetPath)).toContain(
        path.join(HOME_DIR, c.dotDir, "commands", "plan.md")
      );
      if (c.userRootFile) {
        expect(userMappings.map((m) => m.targetPath)).toContain(
          path.join(HOME_DIR, c.dotDir, c.userRootFile)
        );
      }
      expect(projectMappings.map((m) => m.targetPath)).toContain(
        path.join(PROJECT_DIR, c.dotDir, "agents", "ops.md")
      );
    }
  });
});
