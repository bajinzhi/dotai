import * as vscode from "vscode";
import path from "node:path";
import fs from "fs-extra";
import { stringify as stringifyYaml } from "yaml";
import { BUILT_IN_TOOL_IDS } from "@dotai/core";
import type { DotAIEngine } from "@dotai/core";

export function registerProfileCommand(
  context: vscode.ExtensionContext,
  engine: DotAIEngine
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dotai.selectProfile", async () => {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) {
        vscode.window.showWarningMessage("DotAI: No workspace folder open.");
        return;
      }

      const input = await vscode.window.showInputBox({
        prompt: "Enter profile name",
        placeHolder: "e.g., backend-java, frontend-react",
        value: engine.config.projectProfile?.profile ?? "",
      });

      if (!input) {
        return;
      }

      // Select tools for this profile
      const allTools = [...BUILT_IN_TOOL_IDS];
      const selectedTools = await vscode.window.showQuickPick(allTools, {
        placeHolder: "Select tool(s) for this profile (optional)",
        canPickMany: true,
      });

      // Build profile object
      const profileData: Record<string, unknown> = {
        profile: input,
      };
      if (selectedTools && selectedTools.length > 0) {
        profileData.tools = selectedTools;
      }

      // Ask for optional repository override
      const repoOverride = await vscode.window.showInputBox({
        prompt: "Override repository URL for this project? (leave empty to use global)",
        placeHolder: "git@github.com:team/ai-config.git",
      });
      if (repoOverride) {
        const branchOverride = await vscode.window.showInputBox({
          prompt: "Branch for this project?",
          placeHolder: "main",
          value: "main",
        });
        profileData.repository = {
          url: repoOverride,
          branch: branchOverride ?? "main",
        };
      }

      // Write profile.yaml
      const dotaiDir = path.join(workspacePath, ".dotai");
      const profilePath = path.join(dotaiDir, "profile.yaml");
      try {
        await fs.ensureDir(dotaiDir);
        const yamlContent = stringifyYaml(profileData);
        await fs.writeFile(profilePath, yamlContent, "utf-8");

        vscode.window.showInformationMessage(
          `DotAI: Profile "${input}" saved to .dotai/profile.yaml. Run DotAI: Sync to apply.`
        );

        // Open the file for review
        const uri = vscode.Uri.file(profilePath);
        await vscode.window.showTextDocument(uri);
      } catch (err) {
        vscode.window.showErrorMessage(
          `DotAI: Failed to write profile: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
}
