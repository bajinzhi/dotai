import type { Command } from "commander";
import chalk from "chalk";
import { createDotAIEngine } from "@dotai/core";
import { formatHeader, summarizeReason } from "../formatters/console.js";

export function registerDetectCommand(program: Command): void {
  program
    .command("detect")
    .description("Detect AI tools installed on this machine")
    .action(async () => {
      try {
        const configPath = program.opts().config as string | undefined;
        const verbose = Boolean(program.opts().verbose);
        const engine = createDotAIEngine({
          configPath,
          projectPath: process.cwd(),
        });

        const report = await engine.detectTools();
        const installed = report.tools.filter((t) => t.installed);
        const failedDetections = report.tools.filter(
          (t) => !t.installed && (t.reason?.startsWith("Detection failed:") ?? false)
        );
        const notInstalled = report.tools.filter(
          (t) => !t.installed && !(t.reason?.startsWith("Detection failed:") ?? false)
        );

        console.log(formatHeader("Installed Tool Detection"));
        console.log(
          `Detected: ${chalk.bold(String(installed.length))}/${report.tools.length}`
        );
        if (failedDetections.length > 0) {
          console.log(chalk.yellow(`Probe errors: ${failedDetections.length}`));
        }

        if (installed.length > 0) {
          console.log(`\n${chalk.bold("Installed:")}`);
          for (const tool of installed) {
            const location = tool.location ? ` (${tool.location})` : "";
            console.log(chalk.green(`  ✓ ${tool.displayName}${location}`));
          }
        }

        if (notInstalled.length > 0) {
          console.log(`\n${chalk.bold("Not installed:")}`);
          for (const tool of notInstalled) {
            const reason = summarizeReason(tool.reason, verbose);
            const reasonText = reason ? ` - ${reason}` : "";
            console.log(chalk.red(`  ✗ ${tool.displayName}${reasonText}`));
            if (verbose && tool.reason && reason !== tool.reason) {
              console.log(chalk.dim(`    raw: ${tool.reason}`));
            }
          }
        }

        if (failedDetections.length > 0) {
          console.log(`\n${chalk.bold("Detection failed:")}`);
          for (const tool of failedDetections) {
            const reason = summarizeReason(tool.reason, verbose);
            const reasonText = reason ? ` - ${reason}` : "";
            console.log(chalk.yellow(`  ! ${tool.displayName}${reasonText}`));
            if (verbose && tool.reason && reason !== tool.reason) {
              console.log(chalk.dim(`    raw: ${tool.reason}`));
            }
          }
        }
      } catch (err) {
        console.error(
          chalk.red(`Detect failed: ${err instanceof Error ? err.message : String(err)}`)
        );
        process.exit(1);
      }
    });
}
