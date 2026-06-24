import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePythonTestFile } from "../helpers/python-test-files.js";

const officeDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "vectors/office",
);
const OFFICE_FILES = [
  "test.docx",
  "test.pptx",
  "test.xlsx",
  "test.xls",
  "test.pdf",
  "test.epub",
  "test_outlook_msg.msg",
  "movie-theater-booking-2024.pdf",
];

describe("Python vector sync", () => {
  it("copies office vectors when SYNC_PYTHON_VECTORS=1", async () => {
    if (process.env.SYNC_PYTHON_VECTORS !== "1") return;

    await mkdir(officeDir, { recursive: true });

    let copied = 0;
    for (const name of OFFICE_FILES) {
      const source = await resolvePythonTestFile(name, { skipLocal: true });
      if (!source) continue;
      await copyFile(source, join(officeDir, name));
      copied++;
    }

    expect(copied).toBeGreaterThan(0);
  });
});
