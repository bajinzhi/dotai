import { describe, it, expect } from "vitest";
import { TOOL_MANAGED_CONFIG_SPECS } from "../src/tool-managed-configs.js";

describe("TOOL_MANAGED_CONFIG_SPECS", () => {
  it("matches all built-in tools and key managed path rules", () => {
    const byTool = new Map(TOOL_MANAGED_CONFIG_SPECS.map((s) => [s.toolId, s]));
    const toolIds = [...byTool.keys()].sort();

    expect(toolIds).toEqual([
      "antigravity",
      "claude",
      "cline",
      "codebuddy",
      "codex",
      "copilot",
      "cursor",
      "gemini",
      "iflow",
      "lingma",
      "qoder",
      "roo",
      "trae",
      "windsurf",
    ]);

    expect(byTool.get("cursor")?.managedDirectories).toEqual([
      { name: "rules", filePattern: "\\.mdc$" },
      { name: "commands" },
      { name: "skills" },
      { name: "agents" },
    ]);

    expect(byTool.get("claude")?.rootFiles).toEqual(["CLAUDE.md"]);
    expect(byTool.get("claude")?.managedDirectories).toEqual([
      { name: "commands" },
    ]);
    expect(byTool.get("copilot")?.configDirName).toBe(".github");
    expect(byTool.get("copilot")?.managedDirectories).toEqual([
      { name: "instructions", filePattern: "\\.instructions\\.md$" },
    ]);
    expect(byTool.get("qoder")?.rootFiles).toEqual([]);
    expect(byTool.get("qoder")?.managedDirectories).toEqual([
      { name: "rules", filePattern: "\\.md$" },
      { name: "commands" },
      { name: "skills" },
      { name: "agents" },
    ]);
    expect(byTool.get("roo")?.rootFiles).toEqual([]);
    expect(byTool.get("roo")?.managedDirectories).toEqual([
      { name: "rules", filePattern: "\\.md$" },
    ]);
    expect(byTool.get("windsurf")?.managedDirectories).toEqual([
      { name: "rules", filePattern: "\\.md$" },
    ]);
    expect(byTool.get("gemini")?.rootFiles).toEqual([]);
    expect(byTool.get("gemini")?.rootFilesByScope).toEqual({
      user: ["GEMINI.md"],
    });
    expect(byTool.get("iflow")?.rootFiles).toEqual([]);
    expect(byTool.get("iflow")?.rootFilesByScope).toEqual({
      user: ["IFLOW.md"],
    });

    expect(byTool.get("cline")?.managedDirectories).toEqual([
      { name: ".clinerules", filePattern: "\\.md$" },
    ]);
    expect(byTool.get("cline")?.rootFiles).toEqual([".clinerules"]);

    expect(byTool.get("codex")?.includeRootEntries).toBe(true);
    expect(byTool.get("codex")?.rootFiles).toEqual(["AGENTS.md", "AGENTS.override.md"]);
  });
});
