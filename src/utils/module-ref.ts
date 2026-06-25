import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Current module directory (ESM, native CJS, and tsup CJS bundles). */
export function currentModuleDir(): string {
  if (typeof __filename !== "undefined") {
    return dirname(__filename);
  }
  return dirname(fileURLToPath(import.meta.url));
}

/** Path or URL suitable for `createRequire()`. */
export function currentModuleRef(): string {
  if (typeof __filename !== "undefined") {
    return __filename;
  }
  return import.meta.url;
}
