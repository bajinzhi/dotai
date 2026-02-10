import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class ClineAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "cline",
      displayName: "Cline",
      supportedScopes: ["user", "project"],
      repoDirName: "cline",
      scopeConfigs: {
        user: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.userHome,
          filePattern: ".clinerules/**/*.md",
        },
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern: "{.clinerules,.clinerules/**/*.md}",
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
      scope === "user"
        ? [".clinerules/**/*.md"]
        : [".clinerules", ".clinerules/**/*.md"],
      {
        cwd: repoBase,
        onlyFiles: true,
        dot: true,
      }
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
    const extensionsDir = path.join(os.homedir(), ".vscode", "extensions");
    try {
      const entries = await fs.readdir(extensionsDir);
      const hasCline = entries.some(
        (e) =>
          e.startsWith("saoudrizwan.claude-dev-")
      );
      return {
        installed: hasCline,
        reason: hasCline ? undefined : "Cline extension not installed",
      };
    } catch {
      return { installed: false, reason: "Cannot read VSCode extensions directory" };
    }
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    const scopeBase = scope === "user" ? context.userHome : context.projectPath;

    if (scope === "user") {
      const globalRulesBase = path.join(scopeBase, "Documents", "Cline", "Rules");
      if (relPath.startsWith(".clinerules/")) {
        return path.join(globalRulesBase, relPath.slice(".clinerules/".length));
      }
      return path.join(globalRulesBase, path.basename(relPath));
    }

    if (relPath === ".clinerules") {
      return path.join(scopeBase, ".clinerules");
    }
    if (relPath.startsWith(".clinerules/")) {
      return path.join(scopeBase, ".clinerules", relPath.slice(".clinerules/".length));
    }
    return path.join(scopeBase, relPath);
  }
}
