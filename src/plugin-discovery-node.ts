import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { File2MDPlugin } from "./plugins.js";
import { currentModuleRef } from "./utils/module-ref.js";

export interface DiscoveredPluginEntry {
  name: string;
  packageName: string;
  modulePath: string;
}

export interface LoadedDiscoveredPlugin {
  name: string;
  packageName: string;
  plugin: File2MDPlugin;
}

type PackageJson = Record<string, unknown>;

function findNodeModulesRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, "node_modules");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function readPackageJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function collectPluginPaths(
  value: unknown,
  packageDir: string,
  entries: DiscoveredPluginEntry[],
  packageName: string,
  pluginName: string,
): void {
  if (typeof value === "string") {
    entries.push({
      name: pluginName,
      packageName,
      modulePath: resolve(packageDir, value),
    });
    return;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [name, modulePath] of Object.entries(value)) {
      if (typeof modulePath === "string") {
        entries.push({
          name,
          packageName,
          modulePath: resolve(packageDir, modulePath),
        });
      }
    }
  }
}

function extractPluginEntries(
  pkg: PackageJson,
  packageDir: string,
): DiscoveredPluginEntry[] {
  const entries: DiscoveredPluginEntry[] = [];
  const packageName =
    typeof pkg.name === "string" ? pkg.name : packageDir.split(/[/\\]/).pop()!;

  for (const key of ["file2md"] as const) {
    const section = pkg[key];
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      continue;
    }

    const pluginSection = section as Record<string, unknown>;
    if (typeof pluginSection.plugin === "string") {
      collectPluginPaths(
        pluginSection.plugin,
        packageDir,
        entries,
        packageName,
        packageName,
      );
    }
    if (pluginSection.plugins) {
      collectPluginPaths(
        pluginSection.plugins,
        packageDir,
        entries,
        packageName,
        packageName,
      );
    }
  }

  if (typeof pkg.file2mdPlugin === "string") {
    collectPluginPaths(
      pkg.file2mdPlugin,
      packageDir,
      entries,
      packageName,
      packageName,
    );
  }
  return entries;
}

function listPackageDirs(nodeModulesRoot: string): string[] {
  const packageDirs: string[] = [];

  for (const entry of readdirSync(nodeModulesRoot, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = join(nodeModulesRoot, entry.name);
      for (const scopedEntry of readdirSync(scopeDir, { withFileTypes: true })) {
        if (scopedEntry.isDirectory()) {
          packageDirs.push(join(scopeDir, scopedEntry.name));
        }
      }
      continue;
    }

    if (entry.isDirectory() || entry.isSymbolicLink()) {
      packageDirs.push(join(nodeModulesRoot, entry.name));
    }
  }

  return packageDirs;
}

export function discoverPluginEntries(
  startDir = process.cwd(),
): DiscoveredPluginEntry[] {
  const nodeModulesRoot = findNodeModulesRoot(startDir);
  if (!nodeModulesRoot) {
    return [];
  }

  const discovered: DiscoveredPluginEntry[] = [];
  const seen = new Set<string>();

  for (const packageDir of listPackageDirs(nodeModulesRoot)) {
    const pkgPath = join(packageDir, "package.json");
    if (!existsSync(pkgPath)) continue;

    const pkg = readPackageJson(pkgPath);
    if (!pkg) continue;

    for (const entry of extractPluginEntries(pkg, packageDir)) {
      const key = `${entry.packageName}:${entry.modulePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      discovered.push(entry);
    }
  }

  return discovered.sort((a, b) =>
    `${a.packageName}:${a.name}`.localeCompare(`${b.packageName}:${b.name}`),
  );
}

function createPluginFromModule(
  mod: Record<string, unknown>,
): File2MDPlugin | null {
  const registerConverters = mod.registerConverters ?? mod.register_converters;
  if (typeof registerConverters === "function") {
    return {
      registerConverters: registerConverters as File2MDPlugin["registerConverters"],
    };
  }

  const defaultExport = mod.default;
  if (
    defaultExport &&
    typeof defaultExport === "object" &&
    typeof (defaultExport as File2MDPlugin).registerConverters === "function"
  ) {
    return defaultExport as File2MDPlugin;
  }

  return null;
}

async function importPluginModule(modulePath: string): Promise<Record<string, unknown>> {
  if (modulePath.endsWith(".cjs")) {
    const require = createRequire(currentModuleRef());
    return require(modulePath) as Record<string, unknown>;
  }

  return (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
}

export async function loadDiscoveredPlugins(
  startDir = process.cwd(),
): Promise<{ loaded: LoadedDiscoveredPlugin[]; errors: string[] }> {
  const entries = discoverPluginEntries(startDir);
  const loaded: LoadedDiscoveredPlugin[] = [];
  const errors: string[] = [];

  for (const entry of entries) {
    if (!existsSync(entry.modulePath)) {
      errors.push(
        `Plugin '${entry.name}' (${entry.packageName}): module not found at ${entry.modulePath}`,
      );
      continue;
    }

    try {
      const mod = await importPluginModule(entry.modulePath);
      const plugin = createPluginFromModule(mod);
      if (!plugin) {
        errors.push(
          `Plugin '${entry.name}' (${entry.packageName}): missing registerConverters export`,
        );
        continue;
      }
      loaded.push({
        name: entry.name,
        packageName: entry.packageName,
        plugin,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push(
        `Plugin '${entry.name}' (${entry.packageName}): failed to load — ${message}`,
      );
    }
  }

  return { loaded, errors };
}

export async function discoverAndRegisterPlugins(
  register: (plugin: File2MDPlugin) => void,
  startDir = process.cwd(),
): Promise<{ loaded: LoadedDiscoveredPlugin[]; errors: string[] }> {
  const result = await loadDiscoveredPlugins(startDir);
  for (const item of result.loaded) {
    register(item.plugin);
  }
  return result;
}
