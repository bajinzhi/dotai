import fs from "fs-extra";
import type { ConfigResolver } from "../config/resolver.js";
import type { GitProvider } from "../git/provider.js";
import type { ToolAdapterRegistry } from "../adapters/registry.js";
import type { AtomicFileWriter } from "../io/atomic-writer.js";
import type { LockManager } from "../io/lock.js";
import type { EventBus } from "../events/event-bus.js";
import { PlatformPaths } from "../utils/platform-paths.js";
import { SyncStateStore } from "./state-store.js";
import type {
  SyncOptions,
  SyncReport,
  SyncError,
  ToolSyncResult,
  StatusReport,
  DetectReport,
  DiffReport,
  ValidationReport,
  ResolvedConfig,
  PreviewItem,
  ToolInstallStatus,
} from "../types.js";

export interface SyncOrchestratorOptions {
  configResolver: ConfigResolver;
  gitProvider: GitProvider;
  registry: ToolAdapterRegistry;
  fileWriter: AtomicFileWriter;
  lockManager: LockManager;
  eventBus: EventBus;
  config: ResolvedConfig;
  syncStateStore?: SyncStateStore;
}

export class SyncOrchestrator {
  private readonly configResolver: ConfigResolver;
  private gitProvider: GitProvider;
  private readonly registry: ToolAdapterRegistry;
  private readonly fileWriter: AtomicFileWriter;
  private readonly lockManager: LockManager;
  private readonly eventBus: EventBus;
  private readonly syncStateStore: SyncStateStore;
  private config: ResolvedConfig;

  constructor(options: SyncOrchestratorOptions) {
    this.configResolver = options.configResolver;
    this.gitProvider = options.gitProvider;
    this.registry = options.registry;
    this.fileWriter = options.fileWriter;
    this.lockManager = options.lockManager;
    this.eventBus = options.eventBus;
    this.config = options.config;
    this.syncStateStore = options.syncStateStore ?? new SyncStateStore();
  }

  /**
   * Update the resolved config (e.g. when VSCode settings change).
   */
  updateConfig(config: ResolvedConfig): void {
    this.config = config;
  }

  /**
   * Replace the Git provider (e.g. when repository URL changes).
   */
  updateGitProvider(gitProvider: GitProvider): void {
    this.gitProvider = gitProvider;
  }

  /**
   * Generate a preview of what sync would do, without actually writing.
   * Used by "ask" mode to show confirmation before deploy.
   */
  async preview(options: SyncOptions): Promise<PreviewItem[]> {
    this.assertRepositoryConfigured();

    const allPreviews: PreviewItem[] = [];
    const effectiveTools = this.resolveEffectiveTools(options);
    const projectPath = options.projectPath ?? process.cwd();
    const overrideMode = this.config.settings.sync.overrideMode;
    const context = PlatformPaths.buildDeployContext(projectPath, overrideMode);
    const scopes = this.resolveScopes(options);

    for (const toolId of effectiveTools) {
      const adapter = this.registry.get(toolId);
      if (!adapter) {
        continue;
      }

      const detectResult = await adapter.detect();
      if (!detectResult.installed) {
        continue;
      }

      for (const scope of scopes) {
        if (!adapter.supportedScopes.includes(scope)) {
          continue;
        }
        const mappings = await adapter.getPathMappings(scope, context);
        const preview = await adapter.preview(mappings);
        allPreviews.push(...preview);
      }
    }

    return allPreviews;
  }

  async sync(options: SyncOptions): Promise<SyncReport> {
    this.assertRepositoryConfigured();

    const startTime = new Date();
    const results: ToolSyncResult[] = [];
    const errors: SyncError[] = [];
    let totalFiles = 0;

    this.eventBus.emit({
      type: "sync:start",
      timestamp: startTime,
      data: { options },
    });

    try {
      await this.lockManager.acquire();
      this.eventBus.emit({
        type: "lock:acquired",
        timestamp: new Date(),
        data: {},
      });

      // Pull latest from Git
      await this.gitProvider.pull({
        branch: options.branch,
        tag: options.tag,
        commit: options.commit,
      });

      // Determine effective tools
      const effectiveTools = this.resolveEffectiveTools(options);
      const projectPath = options.projectPath ?? process.cwd();
      const overrideMode = options.force
        ? "overwrite" as const
        : this.config.settings.sync.overrideMode;
      const context = PlatformPaths.buildDeployContext(projectPath, overrideMode);
      const scopes = this.resolveScopes(options);

      // Process each tool
      for (const toolId of effectiveTools) {
        const adapter = this.registry.get(toolId);
        if (!adapter) {
          results.push({
            tool: toolId,
            status: "skipped",
            filesDeployed: 0,
            filesSkipped: 0,
            reason: `No adapter registered for tool: ${toolId}`,
          });
          continue;
        }

        this.eventBus.emit({
          type: "tool:deploy:start",
          timestamp: new Date(),
          data: { tool: toolId },
        });

        // Detect tool installation
        const detectResult = await adapter.detect();
        if (!detectResult.installed) {
          this.eventBus.emit({
            type: "tool:deploy:skip",
            timestamp: new Date(),
            data: { tool: toolId, reason: detectResult.reason },
          });
          results.push({
            tool: toolId,
            status: "skipped",
            filesDeployed: 0,
            filesSkipped: 0,
            reason: detectResult.reason ?? "Tool not installed",
          });
          continue;
        }

        // Collect all mappings for requested scopes
        let toolDeployed = 0;
        let toolSkipped = 0;
        let toolHasError = false;

        for (const scope of scopes) {
          if (!adapter.supportedScopes.includes(scope)) {
            continue;
          }

          const mappings = await adapter.getPathMappings(scope, context);
          if (mappings.length === 0) {
            continue;
          }

          // Validate source files
          const sourceFiles = mappings.map((m) => m.sourcePath);
          const validationResult = await adapter.validate(sourceFiles);

          // Filter out invalid files
          let effectiveMappings = mappings;
          if (!validationResult.valid) {
            for (const err of validationResult.errors) {
              this.eventBus.emit({
                type: "tool:validate:error",
                timestamp: new Date(),
                data: { tool: toolId, file: err.file, message: err.message },
              });
              errors.push({
                tool: toolId,
                file: err.file,
                error: err.message,
                recoverable: true,
              });
            }
            const invalidFiles = new Set(validationResult.errors.map((e) => e.file));
            effectiveMappings = mappings.filter(
              (m) => !invalidFiles.has(m.sourcePath)
            );
            if (effectiveMappings.length === 0) {
              toolHasError = true;
              continue;
            }
          }

          if (options.dryRun) {
            const preview = await adapter.preview(effectiveMappings);
            totalFiles += preview.length;
            toolDeployed += preview.length;
          } else {
            const deployResult = await adapter.deploy(effectiveMappings, this.fileWriter);
            totalFiles += deployResult.filesWritten;
            toolDeployed += deployResult.filesWritten;
            toolSkipped += deployResult.filesSkipped;
            if (deployResult.filesSkipped > 0) {
              this.eventBus.emit({
                type: "conflict:detected",
                timestamp: new Date(),
                data: {
                  tool: toolId,
                  skipped: deployResult.filesSkipped,
                  reason: "local-files-preserved",
                },
              });
            }
            for (const err of deployResult.errors) {
              errors.push({
                tool: toolId,
                file: err.file,
                error: err.error,
                recoverable: true,
              });
              toolHasError = true;
            }
          }
        }

        const toolStatus = toolHasError
          ? (toolDeployed > 0 ? "partial" : "failed")
          : "success";

        this.eventBus.emit({
          type: toolHasError ? "tool:deploy:error" : "tool:deploy:complete",
          timestamp: new Date(),
          data: { tool: toolId, filesDeployed: toolDeployed, filesSkipped: toolSkipped },
        });

        results.push({
          tool: toolId,
          status: toolStatus,
          filesDeployed: toolDeployed,
          filesSkipped: toolSkipped,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.eventBus.emit({
        type: "sync:error",
        timestamp: new Date(),
        data: { error: errorMessage },
      });
      errors.push({
        tool: "*",
        file: "",
        error: errorMessage,
        recoverable: false,
      });
    } finally {
      await this.lockManager.release();
      this.eventBus.emit({
        type: "lock:released",
        timestamp: new Date(),
        data: {},
      });
    }

    const endTime = new Date();
    const hasNonRecoverableError = errors.some((e) => !e.recoverable);
    const hasToolFailures = results.some(
      (r) => r.status === "failed" || r.status === "partial"
    );
    const report: SyncReport = {
      success: !hasNonRecoverableError && !hasToolFailures && errors.length === 0,
      startTime,
      endTime,
      totalFiles,
      results,
      errors,
    };

    this.eventBus.emit({
      type: "sync:complete",
      timestamp: endTime,
      data: { report },
    });

    // Persist sync timestamps for successfully synced tools
    if (!options.dryRun) {
      const toolResults = results.map((r) => ({
        toolId: r.tool,
        success: r.status === "success",
      }));
      await this.syncStateStore.recordGlobalSync(toolResults, endTime).catch(() => {
        // Non-critical: don't fail sync because state persistence failed
      });
    }

    return report;
  }

  async status(options?: { projectPath?: string }): Promise<StatusReport> {
    const repoStatus = await this.gitProvider.getStatus();
    const tools = await this.collectToolInstallStatuses();

    return { repo: repoStatus, tools };
  }

  async detectTools(): Promise<DetectReport> {
    const tools = await this.collectToolInstallStatuses();
    return { tools };
  }

  async diff(options?: { projectPath?: string }): Promise<DiffReport> {
    this.assertRepositoryConfigured();

    const changes: DiffReport["changes"] = [];
    const allAdapters = this.registry.getAll();
    const projectPath = options?.projectPath ?? process.cwd();
    const overrideMode = this.config.settings.sync.overrideMode;
    const context = PlatformPaths.buildDeployContext(projectPath, overrideMode);

    for (const adapter of allAdapters) {
      const detectResult = await adapter.detect();
      if (!detectResult.installed) {
        continue;
      }

      for (const scope of adapter.supportedScopes) {
        const mappings = await adapter.getPathMappings(scope, context);
        for (const mapping of mappings) {
          const targetExists = await fs.pathExists(mapping.targetPath);
          if (!targetExists) {
            // Source exists in repo but not locally -> added
            changes.push({
              tool: adapter.toolId,
              file: mapping.targetPath,
              status: "added",
            });
          } else {
            // Both exist -> compare content hashes
            const sourceHash = await this.fileWriter.hash(mapping.sourcePath).catch(() => "");
            const targetHash = await this.fileWriter.hash(mapping.targetPath).catch(() => "");
            if (sourceHash !== targetHash) {
              changes.push({
                tool: adapter.toolId,
                file: mapping.targetPath,
                status: "modified",
              });
            }
            // If hashes match -> unchanged, don't add to changes
          }
        }
      }
    }

    return { hasChanges: changes.length > 0, changes };
  }

  async validate(options?: { projectPath?: string }): Promise<ValidationReport> {
    this.assertRepositoryConfigured();

    const allAdapters = this.registry.getAll();
    const validationResults: ValidationReport["results"] = [];
    const projectPath = options?.projectPath ?? process.cwd();
    const overrideMode = this.config.settings.sync.overrideMode;
    const context = PlatformPaths.buildDeployContext(projectPath, overrideMode);

    for (const adapter of allAdapters) {
      for (const scope of adapter.supportedScopes) {
        const mappings = await adapter.getPathMappings(scope, context);
        const sourceFiles = mappings.map((m) => m.sourcePath);
        if (sourceFiles.length === 0) {
          continue;
        }
        const result = await adapter.validate(sourceFiles);
        if (!result.valid) {
          for (const err of result.errors) {
            validationResults.push({
              tool: adapter.toolId,
              file: err.file,
              errors: [err.message],
            });
          }
        }
      }
    }

    return {
      valid: validationResults.length === 0,
      results: validationResults,
    };
  }

  private resolveEffectiveTools(options: SyncOptions): string[] {
    if (options.tools && options.tools.length > 0) {
      return options.tools;
    }
    if (this.config.effectiveTools.length > 0) {
      return this.config.effectiveTools;
    }
    return this.registry.getToolIds();
  }

  private resolveScopes(options: SyncOptions): ("user" | "project")[] {
    if (!options.scope || options.scope === "all") {
      return ["user", "project"];
    }
    return [options.scope];
  }

  private assertRepositoryConfigured(): void {
    const repoUrl = this.config.settings.repository.url?.trim();
    if (!repoUrl) {
      throw new Error(
        "DotAI is not initialized: repository URL is empty. Run `dotai init` first."
      );
    }
  }

  private async collectToolInstallStatuses(): Promise<ToolInstallStatus[]> {
    const allAdapters = this.registry.getAll();
    return Promise.all(
      allAdapters.map(async (adapter) => {
        let detectResult: {
          installed: boolean;
          version?: string;
          location?: string;
          reason?: string;
        };
        try {
          detectResult = await adapter.detect();
        } catch (err) {
          detectResult = {
            installed: false,
            reason: `Detection failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        const lastSyncTime = await this.syncStateStore.getToolSyncTime(adapter.toolId)
          .catch(() => null);
        return {
          toolId: adapter.toolId,
          displayName: adapter.displayName,
          installed: detectResult.installed,
          lastSyncTime,
          version: detectResult.version,
          location: detectResult.location,
          reason: detectResult.reason,
        };
      })
    );
  }
}
