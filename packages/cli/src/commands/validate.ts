import type { Command } from "commander";
import chalk from "chalk";
import { createDotAIEngine } from "@dotai/core";
import { formatHeader, formatSuccess, formatError } from "../formatters/console.js";

export function registerValidateCommand(program: Command): void {
  program
    .command("validate")
    .description("Validate configuration files in the repository")
    .action(async () => {
      try {
        const configPath = program.opts().config as string | undefined;

        const engine = createDotAIEngine({
          configPath,
          projectPath: process.cwd(),
        });

        const report = await engine.validate({ projectPath: process.cwd() });

        console.log(formatHeader("Configuration Validation"));

        if (report.valid) {
          console.log(formatSuccess("All configuration files are valid"));
          return;
        }

        for (const result of report.results) {
          if (result.errors.length > 0) {
            console.log(formatError(`${result.tool}: ${result.file}`));
            for (const err of result.errors) {
              console.log(chalk.red(`    ${err}`));
            }
          }
        }

        const errorCount = report.results.reduce(
          (sum, r) => sum + r.errors.length, 0
        );
        console.log(
          chalk.dim(`\n  ${errorCount} error(s) found`)
        );
        process.exit(1);
      } catch (err) {
        console.error(
          chalk.red(`Validation failed: ${err instanceof Error ? err.message : String(err)}`)
        );
        process.exit(1);
      }
    });
}
