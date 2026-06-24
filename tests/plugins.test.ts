import { describe, expect, it, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  discoverPluginEntries,
  loadDiscoveredPlugins,
} from "../src/plugin-discovery-node.js";
import {
  clearRegisteredPlugins,
  ensureDiscoveredPlugins,
  getRegisteredPlugins,
} from "../src/plugins.js";
import { File2MD } from "../src/file2md.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("plugin discovery", () => {
  beforeEach(() => {
    clearRegisteredPlugins();
  });

  it("discovers plugins from node_modules package.json entries", () => {
    const entries = discoverPluginEntries(fixturesDir);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.packageName === "file2md-sample-plugin")).toBe(
      true,
    );
  });

  it("loads discovered plugins and registers converters", async () => {
    const { loaded, errors } = await loadDiscoveredPlugins(fixturesDir);
    expect(errors).toEqual([]);
    expect(loaded.length).toBeGreaterThan(0);

    await ensureDiscoveredPlugins(fixturesDir);
    expect(getRegisteredPlugins().length).toBeGreaterThan(0);

    const md = new File2MD({
      enablePlugins: true,
      enableMagikaDetection: false,
    });

    await md.enablePluginsAsync();
    const result = await md.convertStream(new TextEncoder().encode("{\\rtf1 test}"), {
      streamInfo: { extension: ".rtf", charset: "utf-8" },
    });
    expect(result.markdown).toContain("RTF:");
  });
});
