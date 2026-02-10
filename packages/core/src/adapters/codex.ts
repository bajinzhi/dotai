import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import { PlatformPaths } from "../utils/platform-paths.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class CodexAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "codex",
      displayName: "Codex CLI",
      supportedScopes: ["user", "project"],
      repoDirName: "codex",
      scopeConfigs: {
        user: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.userHome,
          filePattern: "{AGENTS.md,AGENTS.override.md}",
        },
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern: "{AGENTS.md,AGENTS.override.md}",
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
        "AGENTS.md",
        "AGENTS.override.md",
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
    const location = await PlatformPaths.whichCommand("codex");
    return {
      installed: location !== null,
      location: location ?? undefined,
      reason: location ? undefined : "codex CLI not installed or not in PATH",
    };
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    const base = scope === "user" ? context.userHome : context.projectPath;
    const codexBase = path.join(base, ".codex");

    if (relPath === "AGENTS.md" || relPath === "AGENTS.override.md") {
      return scope === "project"
        ? path.join(base, relPath)
        : path.join(codexBase, relPath);
    }

    return path.join(codexBase, relPath);
  }
}
