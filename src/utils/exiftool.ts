const MIN_EXIFTOOL_VERSION = [12, 24] as const;

function parseVersion(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

function isVersionAtLeast(version: string, minimum: readonly number[]): boolean {
  const parts = parseVersion(version);
  for (let i = 0; i < minimum.length; i++) {
    const current = parts[i] ?? 0;
    const min = minimum[i] ?? 0;
    if (current > min) return true;
    if (current < min) return false;
  }
  return true;
}

export async function exiftoolMetadata(
  data: Uint8Array,
  exiftoolPath?: string | null,
): Promise<Record<string, string> | null> {
  if (!exiftoolPath) return null;
  if (typeof process === "undefined" || !process.versions?.node) return null;

  const { spawn } = await import("node:child_process");

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(exiftoolPath, ["-ver"]);
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Failed to verify ExifTool version."));
        return;
      }
      const version = stdout.trim();
      if (!isVersionAtLeast(version, MIN_EXIFTOOL_VERSION)) {
        reject(
          new Error(
            `ExifTool version ${version} is vulnerable to CVE-2021-22204. Please upgrade to version 12.24 or later.`,
          ),
        );
        return;
      }
      resolve();
    });
  });

  const output = await new Promise<Buffer>((resolve, reject) => {
    const proc = spawn(exiftoolPath, ["-json", "-"]);
    const chunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(stderr || `exiftool exited with code ${code}`));
    });
    proc.stdin.write(data);
    proc.stdin.end();
  });

  try {
    const parsed = JSON.parse(output.toString()) as Array<Record<string, string>>;
    return parsed[0] ?? null;
  } catch {
    return null;
  }
}
