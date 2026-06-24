import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const localOfficeDir = join(projectRoot, "tests/fixtures/vectors/office");

export async function resolvePythonTestFile(
  filename: string,
  options?: { skipLocal?: boolean },
): Promise<string | null> {
  const candidates = [
    ...(options?.skipLocal ? [] : [join(localOfficeDir, filename)]),
    ...(process.env.FILE2MD_TEST_FILES
      ? [join(resolve(process.env.FILE2MD_TEST_FILES), filename)]
      : []),
  ];

  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      continue;
    }
  }

  return null;
}

export function getPythonTestFileSearchPaths(): string[] {
  return [
    localOfficeDir,
    ...(process.env.FILE2MD_TEST_FILES
      ? [resolve(process.env.FILE2MD_TEST_FILES)]
      : []),
  ];
}
