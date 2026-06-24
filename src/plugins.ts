import type { File2MD } from "./file2md.js";
import type { File2MDOptions } from "./types.js";

export const PLUGIN_INTERFACE_VERSION = 1;

export interface File2MDPlugin {
  registerConverters(
    file2md: File2MD,
    options?: File2MDOptions,
  ): void;
}

const manualPlugins: File2MDPlugin[] = [];
let cachedDiscoveredPlugins: File2MDPlugin[] = [];
let discoveryCompleted = false;

export function registerPlugin(plugin: File2MDPlugin): void {
  manualPlugins.push(plugin);
}

export function getRegisteredPlugins(): readonly File2MDPlugin[] {
  return [...manualPlugins, ...cachedDiscoveredPlugins];
}

export function clearRegisteredPlugins(): void {
  manualPlugins.length = 0;
  cachedDiscoveredPlugins = [];
  discoveryCompleted = false;
}

export async function ensureDiscoveredPlugins(
  startDir?: string,
): Promise<{ errors: string[] }> {
  if (discoveryCompleted) {
    return { errors: [] };
  }

  if (
    typeof process === "undefined" ||
    typeof process.versions?.node !== "string"
  ) {
    discoveryCompleted = true;
    return { errors: [] };
  }

  const { loadDiscoveredPlugins } = await import("./plugin-discovery-node.js");
  const result = await loadDiscoveredPlugins(startDir ?? process.cwd());
  cachedDiscoveredPlugins = result.loaded.map((item) => item.plugin);
  discoveryCompleted = true;
  return { errors: result.errors };
}
