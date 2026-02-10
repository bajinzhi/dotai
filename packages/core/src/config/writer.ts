import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";
import type { DotAISettings } from "../types.js";

/**
 * Writes DotAI settings to the YAML configuration file.
 * Supports full replacement and partial merge updates.
 */
export class ConfigWriter {
  private readonly settingsPath: string;

  constructor(settingsPath?: string) {
    this.settingsPath =
      settingsPath ?? path.join(os.homedir(), ".dotai", "settings.yaml");
  }

  getSettingsPath(): string {
    return this.settingsPath;
  }

  /**
   * Write a complete DotAISettings object to settings.yaml.
   * Creates the parent directory and file if they do not exist.
   */
  async writeSettings(settings: DotAISettings): Promise<void> {
    const yamlContent = this.toYaml(settings);
    await this.atomicWrite(yamlContent);
  }

  /**
   * Read the existing YAML, deep-merge the partial overrides, and write back.
   * If the file does not exist, creates it with the partial values merged
   * over a minimal default structure.
   */
  async updateSettings(partial: Partial<DotAISettings>): Promise<void> {
    const existing = await this.readExisting();
    const merged = this.mergeSettings(existing, partial);
    const yamlContent = this.toYaml(merged);
    await this.atomicWrite(yamlContent);
  }

  // ---- Internal helpers ----

  private async readExisting(): Promise<Record<string, unknown>> {
    if (!(await fs.pathExists(this.settingsPath))) {
      return {};
    }
    try {
      const raw = await fs.readFile(this.settingsPath, "utf-8");
      const parsed = parseYaml(raw);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private mergeSettings(
    base: Record<string, unknown>,
    overrides: Partial<DotAISettings>
  ): Record<string, unknown> {
    const result = { ...base };
    if (overrides.repository) {
      result.repository = {
        ...(typeof base.repository === "object" && base.repository !== null
          ? base.repository
          : {}),
        ...overrides.repository,
      };
    }
    if (overrides.sync) {
      result.sync = {
        ...(typeof base.sync === "object" && base.sync !== null
          ? base.sync
          : {}),
        ...overrides.sync,
      };
    }
    if (overrides.log) {
      result.log = {
        ...(typeof base.log === "object" && base.log !== null
          ? base.log
          : {}),
        ...overrides.log,
      };
    }
    return result;
  }

  private toYaml(obj: Record<string, unknown> | DotAISettings): string {
    const header = `# DotAI configuration — ${this.settingsPath}`;
    return header + "\n\n" + stringifyYaml(obj, { indent: 2, lineWidth: 120 });
  }

  private async atomicWrite(content: string): Promise<void> {
    const dir = path.dirname(this.settingsPath);
    await fs.ensureDir(dir);
    const tmpPath = this.settingsPath + ".tmp";
    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, this.settingsPath);
  }
}