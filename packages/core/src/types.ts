// ---- Override Mode ----

export type OverrideMode = "overwrite" | "skip" | "ask";

// ---- Event Types ----

export type EventType =
  | "sync:start"
  | "sync:complete"
  | "sync:error"
  | "git:pull:start"
  | "git:pull:complete"
  | "git:offline"
  | "tool:deploy:start"
  | "tool:deploy:complete"
  | "tool:deploy:skip"
  | "tool:deploy:error"
  | "tool:validate:error"
  | "conflict:detected"
  | "lock:acquired"
  | "lock:released";

export interface SyncEvent {
  type: EventType;
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface Disposable {
  dispose(): void;
}

// ---- Deploy Context ----

export interface DeployContext {
  projectPath: string;
  userHome: string;
  platform: "win32" | "darwin" | "linux";
  overrideMode: OverrideMode;
}

// ---- Path Mapping ----

export interface PathMapping {
  sourcePath: string;
  targetPath: string;
  scope: "user" | "project";
  action: "create" | "overwrite" | "skip";
}

// ---- Tool Detection ----

export interface ToolDetectResult {
  installed: boolean;
  version?: string;
  location?: string;
  reason?: string;
}

// ---- Validation ----

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    file: string;
    message: string;
    line?: number;
  }>;
}

// ---- Deploy Result ----

export interface DeployResult {
  filesWritten: number;
  filesSkipped: number;
  errors: Array<{
    file: string;
    error: string;
  }>;
}

// ---- Preview ----

export interface PreviewItem {
  sourcePath: string;
  targetPath: string;
  action: "create" | "overwrite" | "skip";
  reason?: string;
}

// ---- Sync Options & Report ----

export interface SyncOptions {
  tools?: string[];
  scope?: "all" | "user" | "project";
  dryRun?: boolean;
  force?: boolean;
  branch?: string;
  tag?: string;
  commit?: string;
  projectPath?: string;
}

export interface SyncReport {
  success: boolean;
  startTime: Date;
  endTime: Date;
  totalFiles: number;
  results: ToolSyncResult[];
  errors: SyncError[];
}

export interface ToolSyncResult {
  tool: string;
  status: "success" | "skipped" | "partial" | "failed";
  filesDeployed: number;
  filesSkipped: number;
  reason?: string;
}

export interface SyncError {
  tool: string;
  file: string;
  error: string;
  recoverable: boolean;
}

// ---- Git Types ----

export interface PullResult {
  updated: boolean;
  commitHash: string;
  previousHash: string | null;
  changedFiles: string[];
  fromCache: boolean;
}

export interface RepoStatus {
  localCommit: string;
  remoteCommit: string | null;
  isOffline: boolean;
  lastSyncTime: Date;
  cachePath: string;
}

// ---- Config Types ----

export interface DotAISettings {
  repository: {
    url: string;
    branch: string;
    auth: "ssh" | "https";
  };
  sync: {
    autoSync: boolean;
    intervalMinutes: number;
    tools: string[] | "all";
    overrideMode: OverrideMode;
  };
  log: {
    level: "debug" | "info" | "warn" | "error";
  };
}

export interface ProjectProfile {
  profile: string;
  repository?: {
    url: string;
    branch: string;
  };
  tools?: string[];
  overrides?: Record<string, string>;
}

export interface ResolvedConfig {
  settings: DotAISettings;
  projectProfile: ProjectProfile | null;
  effectiveTools: string[];
  repoLocalPath: string;
  configSources: {
    user: string;
    project: string | null;
  };
}

// ---- Adapter Config ----

export interface AdapterScopeConfig {
  repoSubPath: string;
  targetResolver: (context: DeployContext) => string;
  filePattern: string;
}

export interface AdapterConfig {
  toolId: string;
  displayName: string;
  supportedScopes: ("user" | "project")[];
  repoDirName: string;
  scopeConfigs: Record<"user" | "project", AdapterScopeConfig | undefined>;
  allowedExtensions: string[];
}

// ---- Managed Config Catalog ----

export interface ManagedDirectorySpec {
  name: string;
  filePattern?: string;
}

export interface ToolManagedConfigSpec {
  toolId: string;
  displayName: string;
  configDirName: string;
  rootFiles: string[];
  rootFilesByScope?: Partial<Record<"user" | "project", string[]>>;
  managedDirectories: ManagedDirectorySpec[];
  includeRootEntries?: boolean;
}

// ---- Status & Diff Reports ----

export interface StatusReport {
  repo: RepoStatus;
  tools: ToolInstallStatus[];
}

export interface ToolInstallStatus {
  toolId: string;
  displayName: string;
  installed: boolean;
  lastSyncTime: Date | null;
  version?: string;
  location?: string;
  reason?: string;
}

export interface DetectReport {
  tools: ToolInstallStatus[];
}

export interface DiffReport {
  hasChanges: boolean;
  changes: Array<{
    tool: string;
    file: string;
    status: "added" | "modified";
  }>;
}

export interface ValidationReport {
  valid: boolean;
  results: Array<{
    tool: string;
    file: string;
    errors: string[];
  }>;
}

// ---- Retry Policy ----

export interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  backoffMultiplier: number;
}
