import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { parse as parseYaml } from "yaml";
import type { DotAISettings, ProjectProfile, ResolvedConfig } from "../types.js";

const DEFAULT_SETTINGS: DotAISettings = {
  repository: {
    url: "",
    branch: "main",
    auth: "ssh",
  },
  sync: {
    autoSync: true,
    intervalMinutes: 0,
    tools: "all",
    overrideMode: "ask",
  },
  log: {
    level: "info",
  },
};

/**
 * Deep clone the default settings to prevent accidental mutation.
 */
function getDefaultSettings(): DotAISettings {
  return structuredClone(DEFAULT_SETTINGS);
}

export class ConfigResolver {
  private readonly settingsPath: string;

  constructor(settingsPath?: string) {
    this.settingsPath =
      settingsPath ?? path.join(os.homedir(), ".dotai", "settings.yaml");
  }

  getSettingsPath(): string {
    return this.settingsPath;
  }

  resolve(projectPath: string): ResolvedConfig {
    const settings = this.loadSettings();
    const projectProfile = this.loadProjectProfile(projectPath);
    const effectiveSettings = this.applyProjectRepositoryOverride(settings, projectProfile);
    const effectiveTools = this.computeEffectiveTools(effectiveSettings, projectProfile);
    const repoUrl = effectiveSettings.repository.url;
    const repoHash = crypto.createHash("md5").update(repoUrl).digest("hex").substring(0, 8);
    const repoLocalPath = path.join(os.homedir(), ".dotai", "cache", repoHash);

    return {
      settings: effectiveSettings,
      projectProfile,
      effectiveTools,
      repoLocalPath,
      configSources: {
        user: path.dirname(this.settingsPath),
        project: fs.pathExistsSync(path.join(projectPath, ".dotai"))
          ? path.join(projectPath, ".dotai")
          : null,
      },
    };
  }

  /**
   * Apply overrides from external source (e.g. VSCode settings).
   * Returns a new ResolvedConfig with merged settings.
   */
  resolveWithOverrides(
    projectPath: string,
    overrides: Partial<DotAISettings>
  ): ResolvedConfig {
    const base = this.resolve(projectPath);
    const merged = this.mergeSettings(base.settings, overrides);

    // Recompute repoLocalPath if URL changed
    const repoUrl = merged.repository.url;
    const repoHash = crypto.createHash("md5").update(repoUrl).digest("hex").substring(0, 8);
    const repoLocalPath = path.join(os.homedir(), ".dotai", "cache", repoHash);

    return {
      ...base,
      settings: merged,
      repoLocalPath,
      effectiveTools: this.computeEffectiveTools(merged, base.projectProfile),
    };
  }

  loadSettings(): DotAISettings {
    if (!fs.pathExistsSync(this.settingsPath)) {
      return getDefaultSettings();
    }

    try {
      const raw = fs.readFileSync(this.settingsPath, "utf-8");
      const parsed = parseYaml(raw) as Partial<DotAISettings>;
      return this.mergeSettings(getDefaultSettings(), parsed);
    } catch {
      return getDefaultSettings();
    }
  }

  private loadProjectProfile(projectPath: string): ProjectProfile | null {
    const profilePath = path.join(projectPath, ".dotai", "profile.yaml");
    if (!fs.pathExistsSync(profilePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(profilePath, "utf-8");
      return parseYaml(raw) as ProjectProfile;
    } catch {
      return null;
    }
  }

  private computeEffectiveTools(
    settings: DotAISettings,
    profile: ProjectProfile | null
  ): string[] {
    if (profile?.tools && profile.tools.length > 0) {
      return profile.tools;
    }
    if (Array.isArray(settings.sync.tools)) {
      return settings.sync.tools;
    }
    return [];
  }

  private mergeSettings(
    defaults: DotAISettings,
    overrides: Partial<DotAISettings>
  ): DotAISettings {
    return {
      repository: {
        ...defaults.repository,
        ...overrides.repository,
      },
      sync: {
        ...defaults.sync,
        ...overrides.sync,
      },
      log: {
        ...defaults.log,
        ...overrides.log,
      },
    };
  }

  private applyProjectRepositoryOverride(
    settings: DotAISettings,
    profile: ProjectProfile | null
  ): DotAISettings {
    if (!profile?.repository) {
      return settings;
    }

    return {
      ...settings,
      repository: {
        ...settings.repository,
        ...profile.repository,
      },
    };
  }
}
