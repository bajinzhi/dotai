import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import { PlatformPaths } from "../utils/platform-paths.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class ClaudeAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "claude",
      displayName: "Claude Code",
      supportedScopes: ["user", "project"],
      repoDirName: "claude",
      scopeConfigs: {
        user: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.userHome,
          filePattern:
            "{CLAUDE.md,.claude/commands/**/*}",
        },
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern:
            "{CLAUDE.md,.claude/commands/**/*}",
        },
      },
      allowedExtensions: [],
    });
  }

  async getPathMappings(
    scope: "user" | "project",
    context: DeployContext
  ): Promise<PathMapping[]> {
    const repoBase = path.join(this.repoLocalPath, this.adapterConfig.repoDirName, scope);
    if (!(await fs.pathExists(repoBase))) {
      return [];
    }

    const relPaths = await fg(
      [
        "CLAUDE.md",
        ".claude/commands/**/*",
      ],
      { cwd: repoBase, onlyFiles: true, dot: true }
    );

    return Promise.all(
      relPaths.map(async (relPath) => {
        const targetPath = this.resolveTargetPath(scope, context, relPath);
        return {
          sourcePath: path.join(repoBase, relPath),
          targetPath,
          scope,
          action: await this.determineAction(targetPath, context.overrideMode),
        };
      })
    );
  }

  async detect(): Promise<ToolDetectResult> {
    const location = await PlatformPaths.whichCommand("claude");
    if (location) {
      return { installed: true, location };
    }
    const claudeDir = path.join(os.homedir(), ".claude");
    const exists = await fs.pathExists(claudeDir);
    return {
      installed: exists,
      location: exists ? claudeDir : undefined,
      reason: exists ? undefined : "claude CLI not installed and ~/.claude/ not found",
    };
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    const base = scope === "user" ? context.userHome : context.projectPath;
    const claudeBase = path.join(base, ".claude");

    if (relPath === "CLAUDE.md") {
      return scope === "user"
        ? path.join(claudeBase, relPath)
        : path.join(base, relPath);
    }
    if (relPath.startsWith(".claude/commands/")) {
      return path.join(claudeBase, "commands", relPath.slice(".claude/commands/".length));
    }
    return path.join(claudeBase, relPath);
  }
}
