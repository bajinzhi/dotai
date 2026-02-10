import chalk from "chalk";

const SEPARATOR = "\u2500".repeat(40);

export function formatHeader(text: string): string {
  return `\n${chalk.bold.cyan(text)}\n${chalk.dim(SEPARATOR)}`;
}

export function formatSuccess(text: string): string {
  return chalk.green(`\u2713 ${text}`);
}

export function formatError(text: string): string {
  return chalk.red(`\u2717 ${text}`);
}

export function formatWarning(text: string): string {
  return chalk.yellow(`\u26A0 ${text}`);
}

export function formatSkipped(text: string): string {
  return chalk.dim(`\u2298 ${text}`);
}

export function formatSpinner(text: string): string {
  return chalk.cyan(`\u21BB ${text}`);
}

export function formatToolStatus(tool: {
  toolId: string;
  displayName: string;
  installed: boolean;
  lastSyncTime: Date | null;
  reason?: string;
}, options?: { verbose?: boolean }): string {
  const icon = tool.installed ? chalk.green("\u2713") : chalk.red("\u2717");
  const name = tool.displayName.padEnd(14);
  const reason = summarizeReason(tool.reason, options?.verbose);
  const syncInfo = tool.installed
    ? tool.lastSyncTime
      ? `Last sync: ${formatDate(tool.lastSyncTime)}`
      : "Never synced"
    : reason
      ? `Not installed (${reason})`
      : "Not installed";
  return `  ${icon} ${name} ${chalk.dim(syncInfo)}`;
}

export function summarizeReason(reason: string | undefined, verbose = false): string {
  if (!reason) {
    return "";
  }
  if (verbose) {
    return reason;
  }
  const firstLine = reason.split(/\r?\n/, 1)[0].trim();
  const MAX_LEN = 120;
  if (firstLine.length <= MAX_LEN) {
    return firstLine;
  }
  return `${firstLine.slice(0, MAX_LEN - 3)}...`;
}

export function formatDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function formatDiffStatus(status: "added" | "modified"): string {
  switch (status) {
    case "added":
      return chalk.green("CREATE");
    case "modified":
      return chalk.yellow("OVERWRITE");
  }
}
