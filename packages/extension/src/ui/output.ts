import * as vscode from "vscode";
import type { SyncEvent } from "@dotai/core";

export interface LogEntry {
  timestamp: string;
  level: "INFO" | "OK" | "WARN" | "ERR";
  category: string;
  message: string;
}

export class OutputChannelManager {
  private readonly channel: vscode.LogOutputChannel;
  private readonly onDidLogEmitter = new vscode.EventEmitter<LogEntry>();
  private readonly onDidClearEmitter = new vscode.EventEmitter<void>();
  private readonly history: LogEntry[] = [];
  private readonly maxHistory = 500;

  readonly onDidLog = this.onDidLogEmitter.event;
  readonly onDidClear = this.onDidClearEmitter.event;

  constructor() {
    this.channel = vscode.window.createOutputChannel("DotAI", { log: true });
  }

  show(): void {
    this.channel.show(false);
  }

  appendEvent(event: SyncEvent): void {
    const { level, category, message } = this.formatEvent(event);
    this.write(level, category, message, event.timestamp);
  }

  appendLine(message: string): void {
    this.write("INFO", "APP", message);
  }

  info(message: string, category = "APP"): void {
    this.write("INFO", category, message);
  }

  success(message: string, category = "APP"): void {
    this.write("OK", category, message);
  }

  warn(message: string, category = "APP"): void {
    this.write("WARN", category, message);
  }

  error(message: string, category = "APP"): void {
    this.write("ERR", category, message);
  }

  clear(): void {
    this.channel.clear();
    this.history.length = 0;
    this.onDidClearEmitter.fire();
  }

  dispose(): void {
    this.onDidLogEmitter.dispose();
    this.onDidClearEmitter.dispose();
    this.channel.dispose();
  }

  getHistory(): LogEntry[] {
    return [...this.history];
  }

  private formatEvent(event: SyncEvent): { level: "INFO" | "OK" | "WARN" | "ERR"; category: string; message: string } {
    switch (event.type) {
      case "sync:start":
        return { level: "INFO", category: "SYNC", message: "Sync started..." };
      case "sync:complete":
        return { level: "OK", category: "SYNC", message: "Sync completed." };
      case "sync:error":
        return {
          level: "ERR",
          category: "SYNC",
          message: `Sync error: ${event.data["error"] ?? "unknown"}`,
        };
      case "git:pull:start":
        return {
          level: "INFO",
          category: "GIT",
          message: `Pulling from ${event.data["repoUrl"] ?? "repo"} (${event.data["branch"] ?? "main"})...`,
        };
      case "git:pull:complete":
        return {
          level: "OK",
          category: "GIT",
          message: `Git pull complete. Updated: ${event.data["updated"] ?? false}`,
        };
      case "git:offline":
        return {
          level: "WARN",
          category: "GIT",
          message: `Offline mode: ${event.data["error"] ?? "network unavailable"}`,
        };
      case "tool:deploy:start":
        return {
          level: "INFO",
          category: "DEPLOY",
          message: `Deploying ${event.data["tool"] ?? "tool"}...`,
        };
      case "tool:deploy:complete":
        return {
          level: "OK",
          category: "DEPLOY",
          message: `Deployed ${event.data["tool"] ?? "tool"}: ${event.data["filesDeployed"] ?? 0} files written`,
        };
      case "tool:deploy:skip":
        return {
          level: "WARN",
          category: "DEPLOY",
          message: `Skipped ${event.data["tool"] ?? "tool"}: ${event.data["reason"] ?? "not installed"}`,
        };
      case "tool:deploy:error":
        return {
          level: "ERR",
          category: "DEPLOY",
          message: `Error deploying ${event.data["tool"] ?? "tool"}`,
        };
      case "tool:validate:error":
        return {
          level: "ERR",
          category: "VALIDATE",
          message: `Validation error [${event.data["tool"] ?? "tool"}]: ${event.data["message"] ?? ""}`,
        };
      case "conflict:detected":
        return {
          level: "WARN",
          category: "CONFLICT",
          message: `Conflict detected: ${event.data["file"] ?? ""}`,
        };
      case "lock:acquired":
        return { level: "INFO", category: "LOCK", message: "Sync lock acquired." };
      case "lock:released":
        return { level: "INFO", category: "LOCK", message: "Sync lock released." };
      default:
        return {
          level: "INFO",
          category: "EVENT",
          message: `${event.type}: ${JSON.stringify(event.data)}`,
        };
    }
  }

  private write(
    level: "INFO" | "OK" | "WARN" | "ERR",
    category: string,
    message: string,
    timestamp = new Date()
  ): void {
    const time = timestamp.toLocaleTimeString();
    const entry: LogEntry = {
      timestamp: time,
      level,
      category: category.toUpperCase(),
      message,
    };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.onDidLogEmitter.fire(entry);

    const catPad = category.toUpperCase().padEnd(8, " ");
    const line = `[${time}] [${catPad}] ${message}`;
    switch (level) {
      case "WARN":
        this.channel.warn(line);
        break;
      case "ERR":
        this.channel.error(line);
        break;
      case "OK":
        this.channel.info(`[OK] ${line}`);
        break;
      case "INFO":
      default:
        this.channel.info(line);
        break;
    }
  }
}
