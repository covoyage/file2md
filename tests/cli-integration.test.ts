import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(root, "dist/cli.cjs");
const fixturesDir = join(root, "tests/fixtures");

function runCli(
  args: string[],
  options: { input?: string } = {},
): { stdout: string; stderr: string; status: number | null } {
  const spawnOptions: Parameters<typeof spawnSync>[2] = {
    cwd: root,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (options.input !== undefined) {
    spawnOptions.input = options.input;
  }

  const result = spawnSync("node", [cliPath, ...args], spawnOptions);

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status,
  };
}

beforeAll(() => {
  if (!existsSync(cliPath)) {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "pipe" });
  }
}, 120_000);

describe("CLI integration", () => {
  it("prints version", () => {
    const { stdout, status } = runCli(["--version"]);
    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^file2md 0\.1\.0$/);
  });

  it("prints help", () => {
    const { stdout, status } = runCli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("file2md - Convert various file formats to Markdown");
    expect(stdout).toContain("-p, --use-plugins");
  });

  it(
    "converts a local docx file to stdout",
    () => {
      const docx = join(fixturesDir, "minimal.docx");
      const { stdout, status } = runCli([docx]);
      expect(status).toBe(0);
      expect(stdout).toContain("Hello DOCX fixture");
    },
    30_000,
  );

  it(
    "normalizes extension hints for stdin input",
    () => {
      const { stdout, status } = runCli(["-x", "txt"], {
        input: "plain stdin text\n",
      });
      expect(status).toBe(0);
      expect(stdout.trim()).toBe("plain stdin text");
    },
    60_000,
  );

  it("rejects cloud conversion without a filename", () => {
    const { stderr, status } = runCli(["-e", "https://docintel.example"], {
      input: "%PDF-1.4",
    });
    expect(status).toBe(1);
    expect(stderr).toMatch(/filename is required/i);
  });
});
