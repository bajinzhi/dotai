import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class CopilotAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "copilot",
      displayName: "GitHub Copilot",
      supportedScopes: ["project"],
      repoDirName: "copilot",
      scopeConfigs: {
        user: undefined,
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern:
            "{copilot-instructions.md,instructions/**/*.instructions.md}",
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
        "copilot-instructions.md",
        "instructions/**/*.instructions.md",
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
    // Check multiple IDE extension directories
    const extensionDirs = [
      path.join(os.homedir(), ".vscode", "extensions"),
      path.join(os.homedir(), ".cursor", "extensions"),
      path.join(os.homedir(), ".windsurf", "extensions"),
    ];

    for (const dir of extensionDirs) {
      try {
        if (await fs.pathExists(dir)) {
          const entries = await fs.readdir(dir);
          const hasCopilot = entries.some((e) => e.startsWith("github.copilot-"));
          if (hasCopilot) {
            return { installed: true, location: dir };
          }
        }
      } catch {
        // Continue to next directory
      }
    }

    return {
      installed: false,
      reason: "GitHub Copilot extension not found in VSCode, Cursor, or Windsurf",
    };
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    const scopeBase = scope === "user" ? context.userHome : context.projectPath;
    const copilotBase = path.join(scopeBase, ".github");

    if (relPath === "copilot-instructions.md") {
      return path.join(copilotBase, "copilot-instructions.md");
    }
    if (relPath.startsWith("instructions/")) {
      return path.join(
        copilotBase,
        "instructions",
        relPath.slice("instructions/".length)
      );
    }
    return path.join(copilotBase, relPath);
  }
}
