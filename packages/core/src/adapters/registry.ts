import type { ToolAdapter } from "./base.js";

export class ToolAdapterRegistry {
  private readonly adapters = new Map<string, ToolAdapter>();

  register(adapter: ToolAdapter): void {
    this.adapters.set(adapter.toolId, adapter);
  }

  get(toolId: string): ToolAdapter | undefined {
    return this.adapters.get(toolId);
  }

  getAll(): ToolAdapter[] {
    return Array.from(this.adapters.values());
  }

  getToolIds(): string[] {
    return Array.from(this.adapters.keys());
  }
}
