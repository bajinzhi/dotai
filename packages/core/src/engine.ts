import path from "node:path";
import os from "node:os";
import { EventBusImpl } from "./events/event-bus.js";
import type { EventBus } from "./events/event-bus.js";
import { ConfigResolver } from "./config/resolver.js";
import { GitProviderImpl } from "./git/provider.js";
import type { GitProvider } from "./git/provider.js";
import { SyncOrchestrator } from "./sync/orchestrator.js";
import { SyncStateStore } from "./sync/state-store.js";
import { ToolAdapterRegistry } from "./adapters/registry.js";
import type { ToolAdapter } from "./adapters/base.js";
import { AtomicFileWriterImpl } from "./io/atomic-writer.js";
import { LockManagerImpl } from "./io/lock.js";
import { CursorAdapter } from "./adapters/cursor.js";
import { ClaudeAdapter } from "./adapters/claude.js";
import { CopilotAdapter } from "./adapters/copilot.js";
import { WindsurfAdapter } from "./adapters/windsurf.js";
import { ClineAdapter } from "./adapters/cline.js";
import { RooAdapter } from "./adapters/roo.js";
import { CodexAdapter } from "./adapters/codex.js";
import { QoderAdapter } from "./adapters/qoder.js";
import { CodebuddyAdapter } from "./adapters/codebuddy.js";
import { TraeAdapter } from "./adapters/trae.js";
import { LingmaAdapter } from "./adapters/lingma.js";
import { AntigravityAdapter } from "./adapters/antigravity.js";
import { GeminiAdapter } from "./adapters/gemini.js";
import { IflowAdapter } from "./adapters/iflow.js";
import type {
  DotAISettings,
  ResolvedConfig,
  SyncOptions,
  SyncReport,
  StatusReport,
  DetectReport,
  DiffReport,
  ValidationReport,
  PreviewItem,
} from "./types.js";

/** IDs of all built-in tool adapters shipped with DotAI. */
export const BUILT_IN_TOOL_IDS: readonly string[] = [
  "cursor", "claude", "copilot", "windsurf", "cline", "roo", "codex", "qoder",
  "codebuddy", "trae", "lingma", "antigravity", "gemini", "iflow",
] as const;

export interface DotAIEngine {
  readonly eventBus: EventBus;
  readonly config: ResolvedConfig;
  sync(options: SyncOptions): Promise<SyncReport>;
  preview(options: SyncOptions): Promise<PreviewItem[]>;
  status(options?: { projectPath?: string }): Promise<StatusReport>;
  detectTools(): Promise<DetectReport>;
  diff(options?: { projectPath?: string }): Promise<DiffReport>;
  validate(options?: { projectPath?: string }): Promise<ValidationReport>;
  registerAdapter(adapter: ToolAdapter): void;
  /**
   * Re-read settings.yaml and refresh all internal modules.
   * Call this after an external change to the YAML file.
   */
  reloadConfig(): void;
  /**
   * Apply overrides on top of the current YAML settings and refresh.
   * @deprecated Prefer writing to settings.yaml via ConfigWriter then calling {@link reloadConfig}.
   */
  applySettings(overrides: Partial<DotAISettings>): void;
}

export interface CreateEngineOptions {
  configPath?: string;
  projectPath?: string;
  /**
   * @deprecated Write to settings.yaml via ConfigWriter and call {@link DotAIEngine.reloadConfig} instead.
   */
  settingsOverrides?: Partial<DotAISettings>;
}

export function createDotAIEngine(options?: CreateEngineOptions): DotAIEngine {
  // 1. Infrastructure layer
  const eventBus = new EventBusImpl();
  const fileWriter = new AtomicFileWriterImpl();
  const lockManager = new LockManagerImpl({
    lockFile: path.join(os.homedir(), ".dotai", ".sync.lock"),
    staleTimeout: 60_000,
  });

  // 2. Config resolution
  const configResolver = new ConfigResolver(
    options?.configPath ?? path.join(os.homedir(), ".dotai", "settings.yaml")
  );
  const projectPath = options?.projectPath ?? process.cwd();
  let config = options?.settingsOverrides
    ? configResolver.resolveWithOverrides(projectPath, options.settingsOverrides)
    : configResolver.resolve(projectPath);

  // 3. Git module
  let gitProvider: GitProvider = new GitProviderImpl({
    repoUrl: config.settings.repository.url,
    branch: config.settings.repository.branch,
    cachePath: config.repoLocalPath,
    eventBus,
  });

  // 4. Register all built-in Adapters
  const registry = new ToolAdapterRegistry();
  const buildAdapters = (repoPath: string): ToolAdapter[] => [
    new CursorAdapter(repoPath),
    new ClaudeAdapter(repoPath),
    new CopilotAdapter(repoPath),
    new WindsurfAdapter(repoPath),
    new ClineAdapter(repoPath),
    new RooAdapter(repoPath),
    new CodexAdapter(repoPath),
    new QoderAdapter(repoPath),
    new CodebuddyAdapter(repoPath),
    new TraeAdapter(repoPath),
    new LingmaAdapter(repoPath),
    new AntigravityAdapter(repoPath),
    new GeminiAdapter(repoPath),
    new IflowAdapter(repoPath),
  ];
  buildAdapters(config.repoLocalPath).forEach((a) => registry.register(a));

  // 5. Sync state persistence
  const syncStateStore = new SyncStateStore();

  // 6. Sync orchestrator
  const orchestrator = new SyncOrchestrator({
    configResolver,
    gitProvider,
    registry,
    fileWriter,
    lockManager,
    eventBus,
    config,
    syncStateStore,
  });

  const refreshEngine = (overrides: Partial<DotAISettings>): void => {
    config = configResolver.resolveWithOverrides(projectPath, overrides);
    orchestrator.updateConfig(config);

    // Rebuild git provider if URL changed
    gitProvider = new GitProviderImpl({
      repoUrl: config.settings.repository.url,
      branch: config.settings.repository.branch,
      cachePath: config.repoLocalPath,
      eventBus,
    });
    orchestrator.updateGitProvider(gitProvider);

    // Re-register adapters with new repo path
    buildAdapters(config.repoLocalPath).forEach((a) => registry.register(a));
  };

  return {
    get eventBus() { return eventBus; },
    get config() { return config; },
    sync: (opts) => orchestrator.sync(opts),
    preview: (opts) => orchestrator.preview(opts),
    status: (opts) => orchestrator.status(opts),
    detectTools: () => orchestrator.detectTools(),
    diff: (opts) => orchestrator.diff(opts),
    validate: (opts) => orchestrator.validate(opts),
    registerAdapter: (adapter) => registry.register(adapter),
    reloadConfig: () => refreshEngine({}),
    applySettings: (overrides) => refreshEngine(overrides),
  };
}
