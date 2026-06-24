import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname } from "node:path";

const TRUSTED_DIRS = [
  "/usr/bin",
  "/usr/local/bin",
  "/opt",
  "/opt/bin",
  "/opt/local/bin",
  "/opt/homebrew/bin",
  "C:\\Windows\\System32",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
];

function findOnPath(command: string): string | null {
  try {
    return execFileSync("which", [command], { encoding: "utf8" }).trim() || null;
  } catch {
    try {
      const output = execFileSync("where", [command], { encoding: "utf8" }).trim();
      return output.split(/\r?\n/)[0]?.trim() || null;
    } catch {
      return null;
    }
  }
}

function isTrustedPath(absolutePath: string): boolean {
  const dir = dirname(absolutePath);
  return TRUSTED_DIRS.some(
    (trusted) => dir === trusted || dir.startsWith(`${trusted}/`) || dir.startsWith(`${trusted}\\`),
  );
}

export function resolveExiftoolPath(configured?: string | null): string | undefined {
  if (configured) return configured;

  const fromEnv = process.env.EXIFTOOL_PATH;
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const candidate = findOnPath("exiftool");
  if (!candidate || !existsSync(candidate)) {
    return undefined;
  }

  const absolute = realpathSync(candidate);
  if (!isTrustedPath(absolute)) {
    return undefined;
  }

  return absolute;
}
