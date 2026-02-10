import { simpleGit, type SimpleGit } from "simple-git";
import fs from "fs-extra";
import path from "node:path";
import type { EventBus } from "../events/event-bus.js";
import type { PullResult, RepoStatus, RetryPolicy } from "../types.js";

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelay: 1000,
  backoffMultiplier: 2,
};

export interface GitProviderOptions {
  repoUrl: string;
  branch: string;
  cachePath: string;
  eventBus: EventBus;
  retryPolicy?: RetryPolicy;
}

export interface GitProvider {
  pull(options?: {
    branch?: string;
    tag?: string;
    commit?: string;
  }): Promise<PullResult>;
  getStatus(): Promise<RepoStatus>;
  getLocalPath(): string;
  checkConnectivity(): Promise<boolean>;
}

export class GitProviderImpl implements GitProvider {
  private readonly git: SimpleGit;
  private readonly options: GitProviderOptions;
  private readonly retryPolicy: RetryPolicy;
  private initialized = false;

  constructor(options: GitProviderOptions) {
    this.options = options;
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    // simple-git requires baseDir to exist at initialization time.
    fs.ensureDirSync(options.cachePath);
    this.git = simpleGit({
      baseDir: options.cachePath,
      timeout: { block: 30_000 },
    });
  }

  async pull(pullOptions?: {
    branch?: string;
    tag?: string;
    commit?: string;
  }): Promise<PullResult> {
    const branch = pullOptions?.branch ?? this.options.branch;
    const previousHash = this.initialized ? await this.getLocalCommit() : null;

    this.options.eventBus.emit({
      type: "git:pull:start",
      timestamp: new Date(),
      data: { repoUrl: this.options.repoUrl, branch },
    });

    try {
      await this.executeWithRetry(() => this.pullInternal(branch));

      if (pullOptions?.tag) {
        await this.git.checkout(pullOptions.tag);
      } else if (pullOptions?.commit) {
        await this.git.checkout(pullOptions.commit);
      }

      this.initialized = true;
      const currentHash = await this.getLocalCommit();
      const diffSummary = previousHash
        ? await this.git.diffSummary([previousHash, currentHash])
        : null;

      this.options.eventBus.emit({
        type: "git:pull:complete",
        timestamp: new Date(),
        data: {
          updated: previousHash !== currentHash,
          commitHash: currentHash,
          changedFiles: diffSummary?.files.map((f) => f.file) ?? [],
        },
      });

      return {
        updated: previousHash !== currentHash,
        commitHash: currentHash,
        previousHash,
        changedFiles: diffSummary?.files.map((f) => f.file) ?? [],
        fromCache: false,
      };
    } catch (error) {
      if (this.isAuthError(error)) {
        const authError = new Error(
          `Git authentication failed. Please check your credentials:\n` +
          `1. For SSH: Ensure your SSH key is added to the agent (ssh-add -l)\n` +
          `2. For HTTPS: Check if your token/password is correct\n` +
          `3. Verify repository URL: ${this.options.repoUrl}\n` +
          `Original error: ${(error as Error).message}`
        );
        throw authError;
      }
      if (this.isNetworkError(error)) {
        this.options.eventBus.emit({
          type: "git:offline",
          timestamp: new Date(),
          data: { error: (error as Error).message },
        });
        const cachedHash = await this.getLocalCommit().catch(() => "unknown");
        return {
          updated: false,
          commitHash: cachedHash,
          previousHash: null,
          changedFiles: [],
          fromCache: true,
        };
      }
      throw error;
    }
  }

  async getStatus(): Promise<RepoStatus> {
    const localCommit = await this.getLocalCommit().catch(() => "");
    let remoteCommit: string | null = null;
    let isOffline = false;

    try {
      const remote = await this.git.listRemote(["HEAD"]);
      remoteCommit = remote.split("\t")[0] ?? null;
    } catch {
      isOffline = true;
    }

    return {
      localCommit,
      remoteCommit,
      isOffline,
      lastSyncTime: await this.getLastSyncTime(),
      cachePath: this.options.cachePath,
    };
  }

  getLocalPath(): string {
    return this.options.cachePath;
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      await this.git.listRemote(["HEAD"]);
      return true;
    } catch {
      return false;
    }
  }

  private async pullInternal(branch: string): Promise<void> {
    const gitDir = path.join(this.options.cachePath, ".git");
    if (!this.initialized && !(await fs.pathExists(gitDir))) {
      await fs.ensureDir(path.dirname(this.options.cachePath));
      await simpleGit().clone(this.options.repoUrl, this.options.cachePath, [
        "--branch",
        branch,
        "--single-branch",
      ]);
    } else {
      await this.git.fetch("origin", branch);
      // Force local cache branch to track remote tip and avoid ff-only failures
      // when cache was detached (tag/commit checkout) or locally diverged.
      await this.git.checkout(["-B", branch, `origin/${branch}`]);
      await this.git.reset(["--hard", `origin/${branch}`]);
    }
  }

  /**
   * Execute an async operation with exponential backoff retry.
   * Only retries on network errors; non-network errors are thrown immediately.
   */
  private async executeWithRetry(operation: () => Promise<void>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retryPolicy.maxRetries; attempt++) {
      try {
        await operation();
        return;
      } catch (error) {
        lastError = error;
        if (!this.isNetworkError(error) || attempt === this.retryPolicy.maxRetries) {
          throw error;
        }
        const delay = this.retryPolicy.baseDelay * Math.pow(this.retryPolicy.backoffMultiplier, attempt);
        await this.delay(delay);
      }
    }
    throw lastError;
  }

  private async getLocalCommit(): Promise<string> {
    const log = await this.git.log({ maxCount: 1 });
    return log.latest?.hash ?? "";
  }

  private async getLastSyncTime(): Promise<Date> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      return new Date(log.latest?.date ?? 0);
    } catch {
      return new Date(0);
    }
  }

  private isNetworkError(error: unknown): boolean {
    const message = (error as Error)?.message ?? "";
    return (
      message.includes("Could not resolve host") ||
      message.includes("Connection refused") ||
      message.includes("Network is unreachable") ||
      message.includes("Operation timed out") ||
      message.includes("fatal: unable to access")
    );
  }

  private isAuthError(error: unknown): boolean {
    const message = (error as Error)?.message ?? "";
    return (
      message.includes("Authentication failed") ||
      message.includes("Permission denied") ||
      message.includes("403 Forbidden") ||
      message.includes("401 Unauthorized") ||
      message.includes("could not read Username") ||
      message.includes("could not read Password") ||
      message.includes("invalid username or password") ||
      message.includes("repository not found") || // 可能是权限问题导致的404
      (message.includes("fatal: could not") && message.includes("Authorization failed"))
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
