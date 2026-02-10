import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import fg from "fast-glob";
import { AbstractToolAdapter } from "./base.js";
import type { DeployContext, PathMapping, ToolDetectResult } from "../types.js";

export class RooAdapter extends AbstractToolAdapter {
  constructor(repoLocalPath: string) {
    super(repoLocalPath, {
      toolId: "roo",
      displayName: "Roo Code",
      supportedScopes: ["user", "project"],
      repoDirName: "roo",
      scopeConfigs: {
        user: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.userHome,
          filePattern: "{.roo/rules/**/*,.roo/rules-*/**/*}",
        },
        project: {
          repoSubPath: "",
          targetResolver: (ctx) => ctx.projectPath,
          filePattern:
            "{.roo/rules/**/*,.roo/rules-*/**/*,.roorules,.roorules-*,AGENTS.md,AGENT.md}",
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

    const patterns = scope === "user"
      ? [".roo/rules/**/*", ".roo/rules-*/**/*"]
      : [
          ".roo/rules/**/*",
          ".roo/rules-*/**/*",
          ".roorules",
          ".roorules-*",
          "AGENTS.md",
          "AGENT.md",
        ];

    const relPaths = await fg(patterns, {
      cwd: repoBase,
      onlyFiles: true,
      dot: true,
    });

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
      const hasRoo = entries.some((e) => e.startsWith("rooveterinaryinc.roo-code-"));
      if (hasRoo) {
        return { installed: true, location: extensionsDir };
      }
    } catch {
      // Ignore and try fallback path detection.
    }

    const rooDir = path.join(os.homedir(), ".roo");
    const exists = await fs.pathExists(rooDir);
    return {
      installed: exists,
      location: exists ? rooDir : undefined,
      reason: exists ? undefined : "Roo Code extension not installed and ~/.roo/ not found",
    };
  }

  private resolveTargetPath(
    scope: "user" | "project",
    context: DeployContext,
    relPath: string
  ): string {
    const base = scope === "user" ? context.userHome : context.projectPath;

    if (relPath.startsWith(".roo/")) {
      return path.join(base, relPath);
    }
    if (relPath === ".roorules" || relPath.startsWith(".roorules-")) {
      return path.join(base, relPath);
    }
    if (scope === "project" && (relPath === "AGENTS.md" || relPath === "AGENT.md")) {
      return path.join(base, relPath);
    }

    return path.join(base, relPath);
  }
}
