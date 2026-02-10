// Factory function
export { createDotAIEngine, BUILT_IN_TOOL_IDS } from "./engine.js";
export type { DotAIEngine, CreateEngineOptions } from "./engine.js";

// Shared types
export type {
  OverrideMode,
  EventType,
  SyncEvent,
  Disposable,
  DeployContext,
  PathMapping,
  ToolDetectResult,
  ValidationResult,
  DeployResult,
  PreviewItem,
  SyncOptions,
  SyncReport,
  ToolSyncResult,
  SyncError,
  PullResult,
  RepoStatus,
  DotAISettings,
  ProjectProfile,
  ResolvedConfig,
  AdapterConfig,
  AdapterScopeConfig,
  ManagedDirectorySpec,
  ToolManagedConfigSpec,
  StatusReport,
  ToolInstallStatus,
  DetectReport,
  DiffReport,
  ValidationReport,
  RetryPolicy,
} from "./types.js";

// Event Bus
export type { EventBus } from "./events/event-bus.js";
export { EventBusImpl } from "./events/event-bus.js";

// Adapter base class (for third-party extension)
export { AbstractToolAdapter } from "./adapters/base.js";
export type { ToolAdapter } from "./adapters/base.js";
export { ToolAdapterRegistry } from "./adapters/registry.js";

// Built-in adapters
export { CursorAdapter } from "./adapters/cursor.js";
export { ClaudeAdapter } from "./adapters/claude.js";
export { CopilotAdapter } from "./adapters/copilot.js";
export { WindsurfAdapter } from "./adapters/windsurf.js";
export { ClineAdapter } from "./adapters/cline.js";
export { RooAdapter } from "./adapters/roo.js";
export { CodexAdapter } from "./adapters/codex.js";
export { QoderAdapter } from "./adapters/qoder.js";
export { CodebuddyAdapter } from "./adapters/codebuddy.js";
export { TraeAdapter } from "./adapters/trae.js";
export { LingmaAdapter } from "./adapters/lingma.js";
export { AntigravityAdapter } from "./adapters/antigravity.js";
export { GeminiAdapter } from "./adapters/gemini.js";
export { IflowAdapter } from "./adapters/iflow.js";

// Config writer
export { ConfigWriter } from "./config/writer.js";
export { ConfigResolver } from "./config/resolver.js";

// Sync state persistence
export { SyncStateStore } from "./sync/state-store.js";
export type { SyncState } from "./sync/state-store.js";

// Utilities
export { PlatformPaths } from "./utils/platform-paths.js";

// Managed config catalog
export { TOOL_MANAGED_CONFIG_SPECS } from "./tool-managed-configs.js";
