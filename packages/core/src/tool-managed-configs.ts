import type { ToolManagedConfigSpec } from "./types.js";

const DEFAULT_RULES_SPEC: Pick<ToolManagedConfigSpec, "rootFiles" | "managedDirectories"> = {
  rootFiles: [],
  managedDirectories: [
    { name: "rules", filePattern: "\\.md$" },
    { name: "commands" },
    { name: "skills" },
    { name: "agents" },
  ],
};

export const TOOL_MANAGED_CONFIG_SPECS: ToolManagedConfigSpec[] = [
  {
    toolId: "cursor",
    displayName: "Cursor",
    configDirName: ".cursor",
    rootFiles: [],
    managedDirectories: [
      { name: "rules", filePattern: "\\.mdc$" },
      { name: "commands" },
      { name: "skills" },
      { name: "agents" },
    ],
  },
  {
    toolId: "claude",
    displayName: "Claude Code",
    configDirName: ".claude",
    rootFiles: ["CLAUDE.md"],
    managedDirectories: [
      { name: "commands" },
    ],
  },
  {
    toolId: "copilot",
    displayName: "GitHub Copilot",
    configDirName: ".github",
    rootFiles: ["copilot-instructions.md"],
    managedDirectories: [
      { name: "instructions", filePattern: "\\.instructions\\.md$" },
    ],
  },
  {
    toolId: "windsurf",
    displayName: "Windsurf",
    configDirName: ".windsurf",
    rootFiles: [],
    managedDirectories: [{ name: "rules", filePattern: "\\.md$" }],
  },
  {
    toolId: "cline",
    displayName: "Cline",
    configDirName: ".clinerules",
    rootFiles: [".clinerules"],
    managedDirectories: [
      { name: ".clinerules", filePattern: "\\.md$" },
    ],
  },
  {
    toolId: "roo",
    displayName: "Roo Code",
    configDirName: ".roo",
    rootFiles: [],
    managedDirectories: [
      { name: "rules", filePattern: "\\.md$" },
    ],
  },
  {
    toolId: "codex",
    displayName: "Codex CLI",
    configDirName: ".codex",
    rootFiles: ["AGENTS.md", "AGENTS.override.md"],
    managedDirectories: [],
    includeRootEntries: true,
  },
  {
    toolId: "qoder",
    displayName: "Qoder",
    configDirName: ".qoder",
    rootFiles: [],
    managedDirectories: [
      { name: "rules", filePattern: "\\.md$" },
      { name: "commands" },
      { name: "skills" },
      { name: "agents" },
    ],
  },
  {
    toolId: "codebuddy",
    displayName: "CodeBuddy",
    configDirName: ".codebuddy",
    ...DEFAULT_RULES_SPEC,
  },
  {
    toolId: "trae",
    displayName: "Trae",
    configDirName: ".trae",
    ...DEFAULT_RULES_SPEC,
  },
  {
    toolId: "lingma",
    displayName: "Lingma",
    configDirName: ".lingma",
    ...DEFAULT_RULES_SPEC,
  },
  {
    toolId: "antigravity",
    displayName: "Antigravity",
    configDirName: ".antigravity",
    ...DEFAULT_RULES_SPEC,
  },
  {
    toolId: "gemini",
    displayName: "Gemini",
    configDirName: ".gemini",
    rootFiles: [],
    rootFilesByScope: {
      user: ["GEMINI.md"],
    },
    managedDirectories: DEFAULT_RULES_SPEC.managedDirectories,
  },
  {
    toolId: "iflow",
    displayName: "iFlow",
    configDirName: ".iflow",
    rootFiles: [],
    rootFilesByScope: {
      user: ["IFLOW.md"],
    },
    managedDirectories: DEFAULT_RULES_SPEC.managedDirectories,
  },
];
