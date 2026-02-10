import type { Command } from "commander";
import chalk from "chalk";
import { createDotAIEngine } from "@dotai/core";
import { formatHeader, formatToolStatus } from "../formatters/console.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show current DotAI configuration status")
    .action(async () => {
      try {
        const configPath = program.opts().config as string | undefined;
        const verbose = Boolean(program.opts().verbose);

        const engine = createDotAIEngine({
          configPath,
          projectPath: process.cwd(),
        });

        const report = await engine.status({ projectPath: process.cwd() });

        console.log(formatHeader("DotAI Configuration Status"));

        // Repository info
        const repoUrl = engine.config.settings.repository.url || "(not configured)";
        const branch = engine.config.settings.repository.branch;
        console.log(`Repository: ${chalk.bold(repoUrl)}`);
        console.log(`Branch:     ${chalk.bold(branch)}`);
        console.log(`Local:      ${report.repo.localCommit || "(no local clone)"}`);

        if (report.repo.isOffline) {
          console.log(`Remote:     ${chalk.yellow("offline")}`);
        } else if (report.repo.remoteCommit) {
          console.log(`Remote:     ${report.repo.remoteCommit}`);
          if (report.repo.localCommit !== report.repo.remoteCommit) {
            console.log(chalk.yellow("  Updates available"));
          }
        }

        // Tool status
        console.log(`\n${chalk.bold("Installed tools:")}`);
        for (const tool of report.tools) {
          console.log(formatToolStatus(tool, { verbose }));
        }
      } catch (err) {
        console.error(
          chalk.red(`Status failed: ${err instanceof Error ? err.message : String(err)}`)
        );
        process.exit(1);
      }
    });
}
