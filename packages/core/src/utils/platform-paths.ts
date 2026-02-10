import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DeployContext, OverrideMode } from "../types.js";

const execFileAsync = promisify(execFile);

export class PlatformPaths {

  static userHome(): string {
    return os.homedir();
  }

  static buildDeployContext(
    projectPath: string,
    overrideMode: OverrideMode = "overwrite"
  ): DeployContext {
    return {
      projectPath: path.resolve(projectPath),
      userHome: PlatformPaths.userHome(),
      platform: process.platform as "win32" | "darwin" | "linux",
      overrideMode,
    };
  }

  static async whichCommand(executable: string): Promise<string | null> {
    // Validate executable name to prevent path traversal and injection
    if (!/^[a-zA-Z0-9_-]+$/.test(executable)) {
      return null;
    }

    try {
      const command = process.platform === "win32" ? "where" : "which";
      const { stdout } = await execFileAsync(command, [executable], {
        timeout: 5000,
        windowsHide: true, // Hide console window on Windows
      });
      return stdout.trim().split("\n")[0] ?? null;
    } catch {
      return null;
    }
  }
}
