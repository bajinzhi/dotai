<div align="center">

# DotAI

**One repo. Every AI tool. Zero conversion.**

Centrally manage configurations for Cursor, Claude Code, GitHub Copilot, Windsurf, Cline, Roo Code, Codex CLI, Qoder, and more through a single Git repository — distributed automatically to each tool's native path, in its native format.

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[中文文档](./README.zh-CN.md)

</div>

---

## The Problem

Teams adopting AI-assisted development quickly find themselves managing a growing patchwork of configuration files — `.cursor/rules/`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.windsurf/rules/` — each in its own location, with its own format, for each tool, across every project. There is no standard way to version, share, or keep them in sync.

**DotAI** treats your AI tool configurations as a first-class DevOps artifact: store them once in Git, distribute them everywhere, automatically.

## How It Works

```
┌──────────────┐     git pull      ┌───────────────┐     distribute     ┌──────────────────┐
│  Git Config  │  ──────────────>  │   DotAI Core  │  ────────────────> │  Tool Configs    │
│  Repository  │                   │    Engine      │                    │                  │
│              │                   │                │                    │  ~/.cursor/rules │
│  cursor/     │                   │  - Resolve     │                    │  ./CLAUDE.md     │
│  claude/     │                   │  - Filter      │                    │  ~/.github/      │
│  copilot/    │                   │  - Distribute  │                    │  .windsurf/rules │
│  windsurf/   │                   │  - Verify      │                    │  .clinerules/    │
│  ...         │                   │                │                    │  .codex/         │
└──────────────┘                   └───────────────┘                    └──────────────────┘
```

**Three steps to unified AI tool configuration:**

```bash
dotai init --repo git@github.com:team/ai-config.git   # 1. Point to your config repo
dotai sync                                              # 2. Distribute to all tools
dotai status                                            # 3. Verify everything is in sync
```

## Key Features

| Feature | Description |
|---------|-------------|
| **Native Format, Zero Conversion** | Files are distributed exactly as stored — no intermediate DSL, no schema translation. What you commit is what each tool reads. |
| **Git-Backed Single Source of Truth** | All configurations live in one Git repository. Version history, code review, and branch strategies apply naturally. |
| **CLI + VSCode Extension** | Two interfaces sharing the same core engine and the same `settings.yaml`. The CLI automates; the extension provides a graphical editing experience. |
| **User-Level & Project-Level Scoping** | Global rules go to `~/` directories; project-specific rules go to the working directory. Both scopes are managed independently. |
| **Selective Sync** | Sync all tools at once, or target specific tools with `--tool cursor,claude`. Dry-run mode previews changes before writing. |
| **Offline Resilient** | When the network is unavailable, DotAI falls back to the local Git cache and continues working. |
| **Conflict Management** | Choose `overwrite`, `skip`, or `ask` per-sync to control how existing local configs are handled. |
| **Extensible Adapter Architecture** | Add support for any new tool by implementing a single `ToolAdapter` interface — no core modifications required. |

## Supported Tools

| Tool | Scope | Native Config Paths |
|------|-------|---------------------|
| **Cursor** | User + Project | `~/.cursor/{rules,commands,skills,agents/}` · `./.cursor/{rules,commands,skills,agents/}` |
| **Claude Code** | User + Project | `~/.claude/CLAUDE.md` + `~/.claude/commands/*` · `./CLAUDE.md` + `./.claude/commands/*` |
| **GitHub Copilot** | Project | `./.github/copilot-instructions.md` + `./.github/instructions/*.instructions.md` |
| **Windsurf** | Project | `./.windsurf/rules/*.md` |
| **Cline** | User + Project | `~/Documents/Cline/Rules/*.md` · `./.clinerules` + `./.clinerules/*.md` |
| **Roo Code** | User + Project | `~/.roo/rules*/**/*.md` · `./.roo/rules*/**/*.md` + `./.roorules*` + `./AGENTS.md` |
| **Codex CLI** | User + Project | `~/.codex/{AGENTS.md,AGENTS.override.md}` · `./{AGENTS.md,AGENTS.override.md}` |
| **Qoder** | User + Project | `~/.qoder/{rules,commands,skills,agents/}` · `./.qoder/{rules,commands,skills,agents/}` |
| **CodeBuddy** | User + Project | `~/.codebuddy/{rules,commands,skills,agents/}` · `./.codebuddy/{rules,commands,skills,agents/}` |
| **Trae** | User + Project | `~/.trae/{rules,commands,skills,agents/}` · `./.trae/{rules,commands,skills,agents/}` |
| **Lingma** | User + Project | `~/.lingma/{rules,commands,skills,agents/}` · `./.lingma/{rules,commands,skills,agents/}` |
| **Antigravity** | User + Project | `~/.antigravity/{rules,commands,skills,agents/}` · `./.antigravity/{rules,commands,skills,agents/}` |
| **Gemini** | User + Project | `~/.gemini/GEMINI.md` + `~/.gemini/{rules,commands,skills,agents/}` · `./.gemini/{rules,commands,skills,agents/}` |
| **iFlow** | User + Project | `~/.iflow/IFLOW.md` + `~/.iflow/{rules,commands,skills,agents/}` · `./.iflow/{rules,commands,skills,agents/}` |

## Prerequisites

| Requirement | Version |
|-------------|---------|
| **Node.js** | >= 18.0.0 |
| **pnpm** | >= 8.0.0 |
| **Git** | Any recent version |

## Installation

### Quick Install Scripts

Install from source automatically (clone/build/link CLI), then optionally install extension:

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/bajinzhi/dotai/main/scripts/install.sh | bash
```

```powershell
# Windows PowerShell
iwr -useb https://raw.githubusercontent.com/bajinzhi/dotai/main/scripts/install.ps1 | iex
```

### Build from Source

```bash
git clone <your-dotai-repo-url>
cd dotai
pnpm install
pnpm run build
```

`pnpm run build` performs workspace build only.

For local developer install + extension package:

```bash
pnpm run build:local
```

### Install CLI Globally

```bash
cd packages/cli
pnpm link --global
```

The `dotai` command is now available system-wide.

### Install VSCode Extension

```bash
cd packages/extension
pnpm run package                         # produces dotai-vscode-x.x.x.vsix
code --install-extension ./dotai-vscode-x.x.x.vsix
```

## Screenshots

### 1. Install DotAI extension from the marketplace
![Extension marketplace install](./screenshots/1.png)

### 2. Open DotAI panel and configure repository settings
![DotAI side panel and quick sync](./screenshots/2.png)
![Repository URL and sync settings](./screenshots/3.png)

### 3. Run sync and inspect logs / config paths
![Sync logs and deployment result](./screenshots/4.png)
![Config paths panel](./screenshots/5.png)

### 4. Verify in CLI (`dotai`, `dotai status`, `dotai sync`)
![CLI status output](./screenshots/6.png)
![CLI sync output](./screenshots/7.png)

### 5. Optional: Linux/WSL build-test workflow
![Linux environment build and test](./screenshots/8.png)

## Quick Start

### 1. Initialize

```bash
# Interactive — guided prompts for repo URL, auth, branch, and tool selection
dotai init

# Non-interactive — fully scriptable for CI/CD or dotfiles bootstrap
dotai init \
  --repo git@github.com:team/ai-config.git \
  --branch main \
  --auth ssh \
  --tools cursor,claude,copilot
```

This creates `~/.dotai/settings.yaml` and clones the configuration repository.

### 2. Sync

```bash
dotai sync                      # Sync all tools
dotai sync --tool cursor,claude # Sync specific tools only
dotai sync --dry-run            # Preview changes without writing
dotai sync --force              # Force overwrite, skip conflict detection
dotai sync --verbose            # Full event stream output
```

### 3. Inspect

```bash
dotai status      # Repository state + per-tool sync status
dotai diff        # File-level diff between repo and local configs
dotai validate    # Verify configuration file integrity
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--config <path>` | Use a custom `settings.yaml` path instead of `~/.dotai/settings.yaml` |
| `--verbose` | Enable verbose output for any command |

## Configuration

### Global Settings (`~/.dotai/settings.yaml`)

```yaml
repository:
  url: git@github.com:team/ai-config.git
  branch: main
  auth: ssh                  # ssh | https

sync:
  autoSync: true             # Auto-sync on VSCode workspace open
  intervalMinutes: 0         # Periodic sync interval (0 = disabled)
  tools: all                 # "all" or list: [cursor, claude, copilot, ..., iflow]
  overrideMode: ask          # overwrite | skip | ask

log:
  level: info                # debug | info | warn | error
```

### Project-Level Override (`.dotai/profile.yaml`)

```yaml
profile: backend-team
repository:
  branch: backend
tools:
  - cursor
  - claude
  - gemini
```

Project-level settings merge on top of global settings for the current workspace.

### Configuration Sharing — SSOT Architecture

`~/.dotai/settings.yaml` serves as the **Single Source of Truth**. Both the CLI and the VSCode extension read from and write to this same file:

```
                   ┌─────────────────────────┐
  dotai init/sync  │  ~/.dotai/settings.yaml  │  VSCode Settings UI
  ───────────────> │      (SSOT — YAML)       │ <───────────────────
                   └────────────┬─────────────┘
                                │
                    FileSystemWatcher (bidirectional)
                                │
                   ┌────────────┴─────────────┐
                   │  DotAI Core Engine        │
                   │  (shared by CLI & ext.)   │
                   └───────────────────────────┘
```

- **CLI** reads/writes `settings.yaml` directly via `ConfigWriter`.
- **VSCode Extension** uses VSCode's Settings UI as a graphical editor; changes propagate bidirectionally through a `FileSystemWatcher` + re-entrancy guard.
- **External edits** (e.g., editing the YAML in a text editor) are detected and reflected in both interfaces automatically.

### Configuration Repository Layout

Your Git configuration repository should follow this directory convention:

```
ai-config-repo/
├── cursor/
│   ├── user/          → ~/.cursor/{rules,commands,skills,agents/}
│   └── project/       → ./.cursor/{rules,commands,skills,agents/}
├── claude/
│   ├── user/          → ~/.claude/CLAUDE.md + ~/.claude/commands/*
│   └── project/       → ./CLAUDE.md + ./.claude/commands/*
├── copilot/
│   └── project/       → ./.github/copilot-instructions.md + ./.github/instructions/*.instructions.md
├── windsurf/
│   └── project/       → ./.windsurf/rules/*.md
├── cline/
│   ├── user/          → ~/Documents/Cline/Rules/*.md
│   └── project/       → ./.clinerules + ./.clinerules/*.md
├── roo/
│   ├── user/          → ~/.roo/rules*/**/*.md
│   └── project/       → ./.roo/rules*/**/*.md + ./.roorules* + ./AGENTS.md
├── codex/
│   ├── user/          → ~/.codex/{AGENTS.md,AGENTS.override.md}
│   └── project/       → ./{AGENTS.md,AGENTS.override.md}
├── qoder/
│   ├── user/          → ~/.qoder/{rules,commands,skills,agents/}
│   └── project/       → ./.qoder/{rules,commands,skills,agents/}
├── codebuddy/
│   ├── user/          → ~/.codebuddy/{rules,commands,skills,agents/}
│   └── project/       → ./.codebuddy/{rules,commands,skills,agents/}
├── trae/
│   ├── user/          → ~/.trae/{rules,commands,skills,agents/}
│   └── project/       → ./.trae/{rules,commands,skills,agents/}
├── lingma/
│   ├── user/          → ~/.lingma/{rules,commands,skills,agents/}
│   └── project/       → ./.lingma/{rules,commands,skills,agents/}
├── antigravity/
│   ├── user/          → ~/.antigravity/{rules,commands,skills,agents/}
│   └── project/       → ./.antigravity/{rules,commands,skills,agents/}
├── gemini/
│   ├── user/          → ~/.gemini/GEMINI.md + ~/.gemini/{rules,commands,skills,agents/}
│   └── project/       → ./.gemini/{rules,commands,skills,agents/}
└── iflow/
    ├── user/          → ~/.iflow/IFLOW.md + ~/.iflow/{rules,commands,skills,agents/}
    └── project/       → ./.iflow/{rules,commands,skills,agents/}
```

Each `user/` directory contains files distributed to the user's home directory (global scope). Each `project/` directory contains files distributed to the current working directory (project scope).

## VSCode Extension

### Commands

| Command | Description |
|---------|-------------|
| `DotAI: Sync All` | Sync all tool configurations from the repository |
| `DotAI: Sync Tool...` | Select specific tools and sync only those |
| `DotAI: Status` | Display current configuration status in Output Channel |
| `DotAI: Show Diff` | Show file-level differences between local and repository |
| `DotAI: Select Profile` | Switch the active project profile |
| `DotAI: Open Settings` | Open `settings.yaml` directly in the editor |

### Settings

All settings are accessible via **File > Preferences > Settings** and searchable under the `dotai` namespace:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `dotai.repository.url` | string | `""` | Git repository URL |
| `dotai.repository.branch` | string | `"main"` | Default branch |
| `dotai.repository.auth` | enum | `"ssh"` | Authentication method |
| `dotai.sync.autoSync` | boolean | `true` | Auto-sync on activation |
| `dotai.sync.intervalMinutes` | number | `0` | Periodic sync interval |
| `dotai.sync.overrideMode` | enum | `"ask"` | Conflict handling strategy |
| `dotai.sync.tools` | array | `[]` | Tools to sync (empty = all) |
| `dotai.logLevel` | enum | `"info"` | Log verbosity |

## Architecture

```
┌───────────────────────────────────────────────────────┐
│                  Presentation Layer                     │
│   ┌─────────────────┐       ┌───────────────────────┐ │
│   │ VSCode Extension │       │      CLI (dotai)      │ │
│   │  (Settings UI,   │       │  (commander, chalk,   │ │
│   │   status bar,    │       │   ora, inquirer)      │ │
│   │   output panel)  │       │                       │ │
│   └────────┬─────────┘       └──────────┬────────────┘ │
├────────────┴────────────────────────────┴──────────────┤
│                Core Engine (@dotai/core)                │
│                                                        │
│   ┌──────────────┐  ┌────────────┐  ┌───────────────┐ │
│   │    Sync      │  │    Git     │  │    Config     │ │
│   │ Orchestrator │  │  Provider  │  │   Resolver    │ │
│   └──────┬───────┘  └─────┬──────┘  └──────┬────────┘ │
│   ┌──────┴────────────────┴────────────────┴────────┐ │
│   │            Tool Adapter Registry                 │ │
│   │                                                  │ │
│   │  Cursor · Claude · Copilot · Windsurf            │ │
│   │  Cline  · Roo · Codex · Qoder · [Your Adapter]  │ │
│   └──────────────────────────────────────────────────┘ │
│                                                        │
│   Infrastructure: EventBus · AtomicWriter · LockMgr    │
└────────────────────────────────────────────────────────┘
```

**Design principles:**

- **Monorepo** — `@dotai/core`, `@dotai/cli`, `dotai-vscode` in a pnpm workspace. Core has zero UI dependencies.
- **Adapter Pattern** — each tool implements `ToolAdapter` (detect → deploy → verify). Open for extension, closed for modification.
- **Event Bus** — decouples engine from presentation. CLI subscribes with console formatters; the extension subscribes with Output Channel handlers.
- **Atomic File Writes** — temp file + `rename()` guarantees no half-written configurations reach the target path.
- **File-Based Locking** — cross-process safe sync prevents concurrent `dotai sync` executions from corrupting state.
- **Exponential Backoff** — Git operations retry with configurable backoff on transient network failures.

## Development

```bash
pnpm install          # Install all dependencies
pnpm run build        # Build all packages
pnpm run build:local  # Build + relink local CLI + package extension VSIX
pnpm run test         # Run all test suites
pnpm run build:core   # Build core package only
pnpm run lint         # ESLint across all packages
```

### Project Structure

```
dotai/
├── packages/
│   ├── core/                  # @dotai/core — shared engine
│   │   ├── src/
│   │   │   ├── adapters/      # 14 built-in tool adapters + registry
│   │   │   ├── config/        # ConfigResolver + ConfigWriter (YAML ↔ typed settings)
│   │   │   ├── events/        # EventBus (typed pub/sub)
│   │   │   ├── git/           # Git provider (simple-git, retry, offline fallback)
│   │   │   ├── io/            # AtomicFileWriter + LockManager
│   │   │   ├── sync/          # SyncOrchestrator + SyncStateStore
│   │   │   ├── utils/         # Cross-platform path resolution
│   │   │   ├── engine.ts      # createDotAIEngine() factory
│   │   │   ├── index.ts       # Public API surface
│   │   │   └── types.ts       # Shared type definitions
│   │   └── test/              # 36 unit tests (vitest)
│   ├── cli/                   # @dotai/cli — terminal interface
│   │   └── src/
│   │       ├── commands/      # init · sync · status · diff · validate
│   │       ├── formatters/    # Chalk-based colored output
│   │       └── index.ts       # Commander entry point
│   └── extension/             # dotai-vscode — VSCode / Cursor extension
│       └── src/
│           ├── commands/      # sync · status · diff · profile · settings
│           ├── ui/            # StatusBar · OutputChannel · Notifications
│           ├── extension.ts   # Activation + bidirectional YAML ↔ Settings sync
│           └── event-handler.ts
├── package.json               # Root workspace scripts
├── pnpm-workspace.yaml        # Workspace package declarations
└── tsconfig.base.json         # Shared TypeScript compiler options
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-tool-adapter`)
3. Make your changes with tests
4. Ensure all checks pass (`pnpm run build && pnpm run test && pnpm run lint`)
5. Submit a Pull Request

### Adding a New Tool Adapter

Implement the `ToolAdapter` interface in `packages/core/src/adapters/`:

```typescript
import { AbstractToolAdapter } from "./base.js";

export class MyToolAdapter extends AbstractToolAdapter {
  readonly id = "mytool";
  readonly displayName = "My Tool";

  protected getUserPaths()    { return ["~/.mytool/config/"]; }
  protected getProjectPaths() { return [".mytool/"]; }
  protected detect()          { /* return true if tool is installed */ }
}
```

Register it in `engine.ts` or via `engine.registerAdapter(new MyToolAdapter(repoPath))`.

## License

[MIT](./LICENSE)
