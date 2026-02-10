#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { BUILT_IN_TOOL_IDS } from "@dotai/core";
import { registerInitCommand } from "./commands/init.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerDetectCommand } from "./commands/detect.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerValidateCommand } from "./commands/validate.js";

const program = new Command();
const BRAND_ICON = "◌";
const BRAND_ACCENT = "◉";

program
  .name("dotai")
  .description("One repo. Every AI tool. Zero conversion.")
  .version("0.1.0")
  .option("--config <path>", "Custom settings.yaml path")
  .option("--verbose", "Enable verbose output");

registerInitCommand(program);
registerSyncCommand(program);
registerStatusCommand(program);
registerDetectCommand(program);
registerDiffCommand(program);
registerValidateCommand(program);

if (shouldShowIntro(process.argv.slice(2))) {
  showIntro();
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

function shouldShowIntro(args: string[]): boolean {
  if (!process.stdout.isTTY) {
    return false;
  }
  const skipArgs = new Set(["-h", "--help", "-V", "--version"]);
  return !args.some((arg) => skipArgs.has(arg));
}

function showIntro(): void {
  const mark = `${chalk.cyanBright(BRAND_ICON)}${chalk.blueBright(BRAND_ACCENT)}`;
  const title = `${mark} ${chalk.bold.whiteBright("DotAI")} ${chalk.cyan("Sync Mesh")}`;
  const border = chalk.cyan("┌────────────────────────────────────────┐");
  const line =
    `${chalk.cyan(`│  ${title} `)}${chalk.green("CLI Ready")}${chalk.cyan("   │")}`;
  const bottom = chalk.cyan("└────────────────────────────────────────┘");
  console.log(border);
  console.log(line);
  console.log(bottom);
  console.log(chalk.dim(`Supported tools: ${BUILT_IN_TOOL_IDS.join(", ")}`));
}
