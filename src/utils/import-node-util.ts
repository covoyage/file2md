import { access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { currentModuleDir } from "./module-ref.js";

/** Resolve dist/utils or src/utils helpers from bundled or split builds. */
export async function importNodeUtil<T>(filename: string): Promise<T> {
  const dir = currentModuleDir();
  const candidates = [
    join(dir, filename),
    join(dir, "utils", filename),
    join(dir, "..", "utils", filename),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return import(pathToFileURL(candidate).href) as Promise<T>;
    } catch {
      // try next candidate
    }
  }

  throw new Error(`Cannot find util module ${filename}`);
}
