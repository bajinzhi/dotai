import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class LingmaAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "lingma",
      displayName: "Lingma",
      supportedScopes: ["user", "project"],
      repoDirName: "lingma",
      scopeConfigs: {
        user: {
          repoSubPath: "",
          targetResolver: (ctx) => path.join(ctx.userHome, ".lingma"),
          filePattern:
            "{rules/**/*.md,commands/**/*,skills/**/*,agents/**/*}",
        },
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern:
            "{rules/**/*.md,commands/**/*,skills/**/*,agents/**/*}",
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
      ["rules/**/*.md", "commands/**/*", "skills/**/*", "agents/**/*"],
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
    const toolDir = path.join(os.homedir(), ".lingma");
    const exists = await fs.pathExists(toolDir);
    return {
      installed: exists,
      location: exists ? toolDir : undefined,
      reason: exists ? undefined : "~/.lingma/ directory not found",
    };
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    if (scope === "user") {
      if (relPath.startsWith("rules/")) {
        return path.join(context.userHome, ".lingma", "rules", relPath.slice("rules/".length));
      }
      if (relPath.startsWith("commands/")) {
        return path.join(
          context.userHome,
          ".lingma",
          "commands",
          relPath.slice("commands/".length)
        );
      }
      if (relPath.startsWith("skills/")) {
        return path.join(
          context.userHome,
          ".lingma",
          "skills",
          relPath.slice("skills/".length)
        );
      }
      if (relPath.startsWith("agents/")) {
        return path.join(
          context.userHome,
          ".lingma",
          "agents",
          relPath.slice("agents/".length)
        );
      }
      return path.join(context.userHome, ".lingma", relPath);
    }

    if (relPath.startsWith("rules/")) {
      return path.join(context.projectPath, ".lingma", "rules", relPath.slice("rules/".length));
    }
    if (relPath.startsWith("commands/")) {
      return path.join(
        context.projectPath,
        ".lingma",
        "commands",
        relPath.slice("commands/".length)
      );
    }
    if (relPath.startsWith("skills/")) {
      return path.join(
        context.projectPath,
        ".lingma",
        "skills",
        relPath.slice("skills/".length)
      );
    }
    if (relPath.startsWith("agents/")) {
      return path.join(
        context.projectPath,
        ".lingma",
        "agents",
        relPath.slice("agents/".length)
      );
    }
    return path.join(context.projectPath, ".lingma", relPath);
  }
}
