import type { Command } from "commander";
import chalk from "chalk";
import { createDotAIEngine } from "@dotai/core";
import { formatHeader, formatDiffStatus, formatSuccess } from "../formatters/console.js";

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Show differences between local and repository configurations")
    .action(async () => {
      try {
        const configPath = program.opts().config as string | undefined;

        const engine = createDotAIEngine({
          configPath,
          projectPath: process.cwd(),
        });

        const report = await engine.diff({ projectPath: process.cwd() });

        console.log(formatHeader("Configuration Diff"));

        if (!report.hasChanges) {
          console.log(formatSuccess("All configurations are up to date"));
          return;
        }

        for (const change of report.changes) {
          const status = formatDiffStatus(change.status);
          const tool = chalk.dim(`[${change.tool}]`);
          console.log(`  ${status} ${change.file} ${tool}`);
        }

        console.log(
          chalk.dim(`\n  ${report.changes.length} change(s) detected`)
        );
      } catch (err) {
        console.error(
          chalk.red(`Diff failed: ${err instanceof Error ? err.message : String(err)}`)
        );
        process.exit(1);
      }
    });
}
