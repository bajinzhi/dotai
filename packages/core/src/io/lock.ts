import lockfile from "proper-lockfile";
import fs from "fs-extra";
import path from "node:path";

export interface LockManagerOptions {
  lockFile: string;
  staleTimeout: number;
}

export interface LockManager {
  acquire(timeout?: number): Promise<void>;
  release(): Promise<void>;
  isLocked(): Promise<boolean>;
}

export class LockManagerImpl implements LockManager {
  private readonly lockFile: string;
  private readonly staleTimeout: number;
  private releaseFn: (() => Promise<void>) | null = null;

  constructor(options: LockManagerOptions) {
    this.lockFile = options.lockFile;
    this.staleTimeout = options.staleTimeout;
  }

  async acquire(timeout = 30_000): Promise<void> {
    await fs.ensureDir(path.dirname(this.lockFile));
    await fs.ensureFile(this.lockFile);

    const startTime = Date.now();
    const retryDelay = 500;

    while (true) {
      try {
        this.releaseFn = await lockfile.lock(this.lockFile, {
          stale: this.staleTimeout,
          retries: 0,
        });
        return;
      } catch (err: unknown) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeout) {
          throw new Error(
            `Failed to acquire sync lock after ${timeout}ms. ` +
            `Another sync process may be running.`
          );
        }
        await this.delay(retryDelay);
      }
    }
  }

  async release(): Promise<void> {
    if (this.releaseFn) {
      await this.releaseFn();
      this.releaseFn = null;
    }
  }

  async isLocked(): Promise<boolean> {
    try {
      await fs.ensureFile(this.lockFile);
      return lockfile.check(this.lockFile, { stale: this.staleTimeout });
    } catch {
      return false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
