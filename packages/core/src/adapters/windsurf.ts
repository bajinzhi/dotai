import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class WindsurfAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "windsurf",
      displayName: "Windsurf",
      supportedScopes: ["project"],
      repoDirName: "windsurf",
      scopeConfigs: {
        user: undefined,
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern: "rules/**/*.md",
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
      ["rules/**/*.md"],
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
    const windsurfDir = path.join(os.homedir(), ".windsurf");
    const exists = await fs.pathExists(windsurfDir);
    return {
      installed: exists,
      location: exists ? windsurfDir : undefined,
      reason: exists ? undefined : "~/.windsurf/ directory not found",
    };
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    const scopeBase = scope === "user" ? context.userHome : context.projectPath;
    const windsurfBase = path.join(scopeBase, ".windsurf");

    if (relPath.startsWith("rules/")) {
      return path.join(windsurfBase, "rules", relPath.slice("rules/".length));
    }
    return path.join(windsurfBase, relPath);
  }
}
