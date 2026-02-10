import { describe, it, expect } from "vitest";
import { ToolAdapterRegistry } from "../src/adapters/registry.js";
import type { ToolAdapter } from "../src/adapters/base.js";
import type {
  ToolDetectResult,
  DeployContext,
  PathMapping,
  ValidationResult,
  DeployResult,
  PreviewItem,
} from "../src/types.js";
import type { AtomicFileWriter } from "../src/io/atomic-writer.js";

class MockAdapter implements ToolAdapter {
  readonly toolId: string;
  readonly displayName: string;
  readonly supportedScopes: ("user" | "project")[] = ["user", "project"];

  constructor(id: string, name: string) {
    this.toolId = id;
    this.displayName = name;
  }

  async detect(): Promise<ToolDetectResult> {
    return { installed: true };
  }

  async getPathMappings(): Promise<PathMapping[]> {
    return [];
  }

  async validate(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async deploy(_mappings: PathMapping[], _writer: AtomicFileWriter): Promise<DeployResult> {
    return { filesWritten: 0, filesSkipped: 0, errors: [] };
  }

  async preview(): Promise<PreviewItem[]> {
    return [];
  }
}

describe("ToolAdapterRegistry", () => {
  it("should register and retrieve an adapter", () => {
    const registry = new ToolAdapterRegistry();
    const adapter = new MockAdapter("test", "Test Tool");

    registry.register(adapter);
    const result = registry.get("test");

    expect(result).toBe(adapter);
    expect(result?.toolId).toBe("test");
  });

  it("should return undefined for unregistered tool", () => {
    const registry = new ToolAdapterRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("should return all registered adapters", () => {
    const registry = new ToolAdapterRegistry();
    registry.register(new MockAdapter("a", "Tool A"));
    registry.register(new MockAdapter("b", "Tool B"));

    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it("should return all tool IDs", () => {
    const registry = new ToolAdapterRegistry();
    registry.register(new MockAdapter("cursor", "Cursor"));
    registry.register(new MockAdapter("claude", "Claude"));

    const ids = registry.getToolIds();
    expect(ids).toEqual(["cursor", "claude"]);
  });

  it("should overwrite adapter with same toolId", () => {
    const registry = new ToolAdapterRegistry();
    const first = new MockAdapter("cursor", "Cursor v1");
    const second = new MockAdapter("cursor", "Cursor v2");

    registry.register(first);
    registry.register(second);

    expect(registry.get("cursor")?.displayName).toBe("Cursor v2");
    expect(registry.getAll()).toHaveLength(1);
  });
});
