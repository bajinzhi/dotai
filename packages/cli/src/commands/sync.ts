import type { Command } from "commander";
import inquirer from "inquirer";
import { createDotAIEngine } from "@dotai/core";
import type { SyncEvent } from "@dotai/core";
import {
  formatSuccess,
  formatError,
  formatWarning,
  formatSkipped,
  formatHeader,
  formatDuration,
} from "../formatters/console.js";

interface SyncCommandOptions {
  all?: boolean;
  tool?: string;
  dryRun?: boolean;
  scope?: string;
  force?: boolean;
  branch?: string;
  tag?: string;
  commit?: string;
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Sync AI tool configurations from Git repository")
    .option("--all", "Sync all tools explicitly")
    .option("--tool <tools>", "Comma-separated list of tools to sync")
    .option("--dry-run", "Preview changes without writing files")
    .option("--scope <scope>", "Sync scope: all, user, project", "all")
    .option("--force", "Force overwrite, skip conflict detection")
    .option("--branch <branch>", "Git branch to sync from")
    .option("--tag <tag>", "Git tag to sync from")
    .option("--commit <hash>", "Git commit to sync from")
    .action(async (opts: SyncCommandOptions) => {
      try {
        if (opts.all && opts.tool) {
          throw new Error("--all and --tool cannot be used together");
        }
        if (opts.tag && opts.commit) {
          throw new Error("--tag and --commit cannot be used together");
        }

        const configPath = program.opts().config as string | undefined;
        const verbose = Boolean(program.opts().verbose);

        const engine = createDotAIEngine({
          configPath,
          projectPath: process.cwd(),
        });

        // Subscribe to events for live output
        engine.eventBus.on("*", (event: SyncEvent) => {
          if (verbose) {
            printVerboseEvent(event);
          } else {
            printKeyEvent(event);
          }
        });

        if (opts.dryRun) {
          console.log(formatHeader("[DRY-RUN] Preview of changes"));
        } else {
          console.log(formatHeader("Syncing configurations"));
        }

        const syncOptions = {
          tools: opts.all ? undefined : opts.tool?.split(",").map((t) => t.trim()),
          dryRun: opts.dryRun,
          scope: (opts.scope as "all" | "user" | "project") ?? "all",
          force: opts.force,
          branch: opts.branch,
          tag: opts.tag,
          commit: opts.commit,
          projectPath: process.cwd(),
        };

        if (
          !opts.dryRun &&
          !opts.force &&
          engine.config.settings.sync.overrideMode === "ask"
        ) {
          const previewItems = await engine.preview(syncOptions);
          const overwriteCount = previewItems.filter((i) => i.action === "overwrite").length;
          const createCount = previewItems.filter((i) => i.action === "create").length;

          if (previewItems.length === 0) {
            console.log(formatSuccess("No changes to deploy"));
            process.exit(0);
          }

          if (overwriteCount > 0) {
            const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
              {
                type: "confirm",
                name: "confirmed",
                default: false,
                message:
                  `Detected ${overwriteCount} overwrite(s) and ${createCount} create(s). ` +
                  "Continue?",
              },
            ]);
            if (!confirmed) {
              console.log(formatSkipped("Sync cancelled by user"));
              process.exit(0);
            }
          }
        }

        const report = await engine.sync(syncOptions);

        // Summary
        const duration = formatDuration(report.endTime.getTime() - report.startTime.getTime());
        const successCount = report.results.filter((r) => r.status === "success" || r.status === "partial").length;
        const skipCount = report.results.filter((r) => r.status === "skipped").length;
        const failCount = report.results.filter((r) => r.status === "failed").length;

        console.log("");
        if (report.success) {
          console.log(
            formatSuccess(
              `Sync complete: ${successCount} tool(s) succeeded, ${skipCount} skipped, ${failCount} failed (${duration})`
            )
          );
        } else {
          console.log(
            formatError(
              `Sync finished with errors: ${successCount} succeeded, ${skipCount} skipped, ${failCount} failed (${duration})`
            )
          );
        }

        // Print per-tool details
        for (const result of report.results) {
          switch (result.status) {
            case "success":
              console.log(formatSuccess(`  ${result.tool}: ${result.filesDeployed} file(s) deployed`));
              break;
            case "skipped":
              console.log(formatSkipped(`  ${result.tool}: skipped${result.reason ? ` - ${result.reason}` : ""}`));
              break;
            case "partial":
              console.log(formatWarning(`  ${result.tool}: ${result.filesDeployed} deployed, ${result.filesSkipped} skipped`));
              break;
            case "failed":
              console.log(formatError(`  ${result.tool}: failed${result.reason ? ` - ${result.reason}` : ""}`));
              break;
          }
        }

        process.exit(report.success ? 0 : 1);
      } catch (err) {
        console.error(formatError(`Sync failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function printKeyEvent(event: SyncEvent): void {
  const msg = typeof event.data.message === "string"
    ? event.data.message
    : typeof event.data.tool === "string"
      ? event.data.tool
      : "";
  switch (event.type) {
    case "git:pull:start":
      process.stdout.write(`\u21BB Pulling configuration repository...\r`);
      break;
    case "git:pull:complete": {
      const changedFiles = Array.isArray(event.data.changedFiles) ? event.data.changedFiles : [];
      if (event.data.updated) {
        console.log(formatSuccess(`Git repository updated (${changedFiles.length} files changed)`));
      } else {
        console.log(formatSuccess("Git repository is up to date"));
      }
      break;
    }
    case "git:offline":
      console.log(formatWarning("Offline mode: using cached repository"));
      break;
    case "tool:deploy:skip":
      console.log(formatSkipped(`Skipping ${msg}: ${typeof event.data.reason === "string" ? event.data.reason : "not installed"}`));
      break;
    case "sync:error":
      console.log(formatError(`Error: ${msg}`));
      break;
  }
}

function printVerboseEvent(event: SyncEvent): void {
  const ts = event.timestamp.toISOString().substring(11, 19);
  console.log(`[${ts}] ${event.type}: ${JSON.stringify(event.data)}`);
}
