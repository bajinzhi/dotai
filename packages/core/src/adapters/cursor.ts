import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class CursorAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "cursor",
      displayName: "Cursor",
      supportedScopes: ["user", "project"],
      repoDirName: "cursor",
      scopeConfigs: {
        user: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.userHome,
          filePattern:
            "{rules/**/*.mdc,commands/**/*,skills/**/*,agents/**/*}",
        },
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern: "{rules/**/*.mdc,commands/**/*,skills/**/*,agents/**/*}",
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
      ["rules/**/*.mdc", "commands/**/*", "skills/**/*", "agents/**/*"],
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
    const cursorDir = path.join(os.homedir(), ".cursor");
    const exists = await fs.pathExists(cursorDir);
    return {
      installed: exists,
      location: exists ? cursorDir : undefined,
      reason: exists ? undefined : "~/.cursor/ directory not found",
    };
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    const scopeBase = scope === "user" ? context.userHome : context.projectPath;
    const cursorBase = path.join(scopeBase, ".cursor");

    if (relPath.startsWith("rules/")) {
      return path.join(cursorBase, "rules", relPath.slice("rules/".length));
    }
    if (relPath.startsWith("commands/")) {
      return path.join(cursorBase, "commands", relPath.slice("commands/".length));
    }
    if (relPath.startsWith("skills/")) {
      return path.join(cursorBase, "skills", relPath.slice("skills/".length));
    }
    if (relPath.startsWith("agents/")) {
      return path.join(cursorBase, "agents", relPath.slice("agents/".length));
    }
    return path.join(cursorBase, relPath);
  }
}
