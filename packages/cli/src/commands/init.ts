import type { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import { spawn } from "node:child_process";
import { ConfigWriter, createDotAIEngine, BUILT_IN_TOOL_IDS } from "@dotai/core";
import type { DotAISettings } from "@dotai/core";
import { formatSuccess, formatError, formatHeader } from "../formatters/console.js";

interface InitOptions {
  repo?: string;
  branch?: string;
  auth?: string;
  tools?: string;
}

const VALID_AUTH_METHODS: ReadonlySet<string> = new Set(["ssh", "https"]);

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize DotAI configuration")
    .option("--repo <url>", "Git repository URL")
    .option("--branch <branch>", "Git branch", "main")
    .option("--auth <method>", "Authentication method (ssh|https)", "ssh")
    .option("--tools <tools>", "Comma-separated list of tools")
    .action(async (opts: InitOptions) => {
      try {
        const configPath = program.opts().config as string | undefined;
        const writer = new ConfigWriter(configPath);

        const settings = opts.repo
          ? buildFromFlags(opts)
          : await buildInteractively();

        console.log(formatHeader("DotAI Initialization"));

        await writer.writeSettings(settings);
        console.log(formatSuccess(`Configuration written to ${writer.getSettingsPath()}`));

        if (canPromptForGitAuth()) {
          console.log("Checking repository access (may require authentication)...");
          await verifyRepositoryAccess(settings);
        }

        // Clone the configuration repository
        const spinner = ora("Cloning configuration repository...").start();
        try {
          const engine = createDotAIEngine({ configPath });
          await engine.sync({ projectPath: process.cwd() });
          spinner.succeed("Repository cloned and ready");
        } catch (err) {
          const authHint = settings.repository.auth === "https"
            ? "Hint: run `gh auth login` or configure Git Credential Manager first."
            : "Hint: verify SSH key with `ssh -T git@github.com`.";
          spinner.warn(
            `Repository clone skipped: ${err instanceof Error ? err.message : String(err)}\n${authHint}`
          );
        }

        console.log(formatSuccess("DotAI initialized successfully"));
      } catch (err) {
        console.error(formatError(`Initialization failed: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function buildFromFlags(opts: InitOptions): DotAISettings {
  if (!opts.repo) {
    throw new Error("--repo is required in non-interactive mode");
  }
  if (opts.auth && !VALID_AUTH_METHODS.has(opts.auth)) {
    throw new Error(`Invalid --auth value "${opts.auth}". Must be one of: ssh, https`);
  }
  const auth = opts.auth === "https" ? "https" as const : "ssh" as const;
  const tools: string[] | "all" = opts.tools
    ? opts.tools.split(",").map((t) => t.trim())
    : "all";

  return {
    repository: { url: opts.repo, branch: opts.branch ?? "main", auth },
    sync: { autoSync: true, intervalMinutes: 0, tools, overrideMode: "ask" },
    log: { level: "info" },
  };
}

async function buildInteractively(): Promise<DotAISettings> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "repoUrl",
      message: "Git repository URL:",
      validate: (v: string) => (v.length > 0 ? true : "Repository URL is required"),
    },
    {
      type: "list",
      name: "auth",
      message: "Authentication method:",
      choices: ["ssh", "https"],
      default: "ssh",
    },
    {
      type: "input",
      name: "branch",
      message: "Default branch:",
      default: "main",
    },
    {
      type: "checkbox",
      name: "tools",
      message: "Select tools to sync:",
      choices: [...BUILT_IN_TOOL_IDS],
      default: [...BUILT_IN_TOOL_IDS],
    },
  ]);

  const tools: string[] | "all" =
    answers.tools.length === BUILT_IN_TOOL_IDS.length ? "all" : answers.tools;

  return {
    repository: { url: answers.repoUrl, branch: answers.branch, auth: answers.auth },
    sync: { autoSync: true, intervalMinutes: 0, tools, overrideMode: "ask" },
    log: { level: "info" },
  };
}

function canPromptForGitAuth(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function verifyRepositoryAccess(settings: DotAISettings): Promise<void> {
  const args = ["ls-remote", "--heads", settings.repository.url, settings.repository.branch];
  await runGitCommand(args, 120_000);
}

async function runGitCommand(args: string[], timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Git authentication timed out"));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`git ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}
