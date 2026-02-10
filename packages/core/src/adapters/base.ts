import fs from "fs-extra";
import path from "node:path";
import fg from "fast-glob";
import type {
  AdapterConfig,
  AdapterScopeConfig,
  DeployContext,
  DeployResult,
  OverrideMode,
  PathMapping,
  PreviewItem,
  ToolDetectResult,
  ValidationResult,
} from "../types.js";
import type { AtomicFileWriter } from "../io/atomic-writer.js";

export interface ToolAdapter {
  readonly toolId: string;
  readonly displayName: string;
  readonly supportedScopes: ("user" | "project")[];
  detect(): Promise<ToolDetectResult>;
  getPathMappings(
    scope: "user" | "project",
    context: DeployContext
  ): Promise<PathMapping[]>;
  validate(files: string[]): Promise<ValidationResult>;
  deploy(mappings: PathMapping[], writer: AtomicFileWriter): Promise<DeployResult>;
  preview(mappings: PathMapping[]): Promise<PreviewItem[]>;
}

export abstract class AbstractToolAdapter implements ToolAdapter {
  readonly toolId: string;
  readonly displayName: string;
  readonly supportedScopes: ("user" | "project")[];
  protected readonly repoLocalPath: string;
  protected readonly adapterConfig: AdapterConfig;

  constructor(repoLocalPath: string, config: AdapterConfig) {
    this.repoLocalPath = repoLocalPath;
    this.toolId = config.toolId;
    this.displayName = config.displayName;
    this.supportedScopes = config.supportedScopes;
    this.adapterConfig = config;
  }

  abstract detect(): Promise<ToolDetectResult>;

  async getPathMappings(
    scope: "user" | "project",
    context: DeployContext
  ): Promise<PathMapping[]> {
    const scopeConfig = this.adapterConfig.scopeConfigs[scope];
    if (!scopeConfig) {
      return [];
    }

    const repoBase = path.join(
      this.repoLocalPath,
      this.adapterConfig.repoDirName,
      scope,
      scopeConfig.repoSubPath
    );

    if (!(await fs.pathExists(repoBase))) {
      return [];
    }

    const targetBase = scopeConfig.targetResolver(context);
    const sourceFiles = await fg(scopeConfig.filePattern, {
      cwd: repoBase,
      onlyFiles: true,
    });

    return Promise.all(
      sourceFiles.map(async (relPath) => ({
        sourcePath: path.join(repoBase, relPath),
        targetPath: path.join(targetBase, relPath),
        scope,
        action: await this.determineAction(
          path.join(targetBase, relPath),
          context.overrideMode
        ),
      }))
    );
  }

  async validate(files: string[]): Promise<ValidationResult> {
    if (this.adapterConfig.allowedExtensions.length === 0) {
      return { valid: true, errors: [] };
    }
    const errors = files
      .filter(
        (f) =>
          !this.adapterConfig.allowedExtensions.some((ext) => f.endsWith(ext))
      )
      .map((f) => ({
        file: f,
        message: `File extension not allowed. Allowed: ${this.adapterConfig.allowedExtensions.join(", ")}`,
      }));
    return { valid: errors.length === 0, errors };
  }

  async deploy(
    mappings: PathMapping[],
    writer: AtomicFileWriter
  ): Promise<DeployResult> {
    let filesWritten = 0;
    let filesSkipped = 0;
    const errors: Array<{ file: string; error: string }> = [];

    for (const mapping of mappings) {
      if (mapping.action === "skip") {
        filesSkipped++;
        continue;
      }
      try {
        await writer.ensureDir(path.dirname(mapping.targetPath));
        await writer.copy(mapping.sourcePath, mapping.targetPath);
        filesWritten++;
      } catch (err) {
        errors.push({
          file: mapping.targetPath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { filesWritten, filesSkipped, errors };
  }

  async preview(mappings: PathMapping[]): Promise<PreviewItem[]> {
    return mappings.map((m) => ({
      sourcePath: m.sourcePath,
      targetPath: m.targetPath,
      action: m.action,
    }));
  }

  protected async determineAction(
    targetPath: string,
    overrideMode: OverrideMode = "overwrite"
  ): Promise<"create" | "overwrite" | "skip"> {
    const exists = await fs.pathExists(targetPath);
    if (!exists) {
      return "create";
    }
    // "skip" mode: never overwrite existing files
    if (overrideMode === "skip") {
      return "skip";
    }
    // "overwrite" and "ask" modes: mark as overwrite
    // ("ask" is handled at UI layer -- core treats it the same as overwrite)
    return "overwrite";
  }
}
