# DotAI for VS Code

DotAI helps you manage AI coding tool configuration from a single Git repository and sync it into each tool's native directories.

## Why DotAI

- One source of truth for team AI config.
- Supports both user-level and project-level deployment.
- Keeps tool-specific directory structures isolated.
- Works with multiple tools in one workflow.

## Supported Tools

- cursor
- claude
- copilot
- windsurf
- cline
- roo
- codex
- qoder
- codebuddy
- trae
- lingma
- antigravity
- gemini
- iflow

## Features

- Sync all tools or selected tools.
- Detect installed tools on current machine.
- Show deployment diff before sync.
- Profile-based project overrides.
- Conflict handling modes: `overwrite`, `skip`, `ask`.
- Status bar integration:
  - `◉ DotAI` for sync status.
  - `DotAI Config` quick entry to open extension settings.

## Commands

- `DotAI: Sync All`
- `DotAI: Sync Tool...`
- `DotAI: Status`
- `DotAI: Detect Installed Tools`
- `DotAI: Show Diff`
- `DotAI: Select Profile`
- `DotAI: Open Settings`

## Quick Start

1. Open VS Code Settings and search `dotai`.
2. Set `dotai.repository.url` and `dotai.repository.branch`.
3. Run `DotAI: Sync All`.
4. Use `DotAI: Detect Installed Tools` to verify local tool availability.

## Key Settings

- `dotai.repository.url`
- `dotai.repository.branch`
- `dotai.repository.auth`
- `dotai.sync.autoSync`
- `dotai.sync.intervalMinutes`
- `dotai.sync.overrideMode`
- `dotai.sync.tools`
- `dotai.settingsPath`
- `dotai.logLevel`

## Feedback

- Issues: https://github.com/bajinzhi/dotai/issues
- Repository: https://github.com/bajinzhi/dotai

