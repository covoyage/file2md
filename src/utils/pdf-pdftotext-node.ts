import { spawn } from "node:child_process";

export interface PdftotextOptions {
  firstPage?: number;
  lastPage?: number;
}

export async function extractTextWithPdftotext(
  data: Uint8Array,
  options: PdftotextOptions = {},
): Promise<string | null> {
  const args = ["-layout", "-nopgbrk"];
  if (options.firstPage !== undefined) {
    args.push("-f", String(options.firstPage));
  }
  if (options.lastPage !== undefined) {
    args.push("-l", String(options.lastPage));
  }
  args.push("-", "-");

  return new Promise((resolve) => {
    const child = spawn("pdftotext", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", () => {
      /* consume to prevent backpressure deadlock */
    });
    child.stdin.on("error", () => resolve(null));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const text = Buffer.concat(stdout).toString("utf8").trim();
      resolve(text || null);
    });

    child.stdin.end(
      typeof Buffer !== "undefined" ? Buffer.from(data) : data,
    );
  });
}

export async function extractPageTextWithPdftotext(
  data: Uint8Array,
  pageNumber: number,
): Promise<string | null> {
  return extractTextWithPdftotext(data, {
    firstPage: pageNumber,
    lastPage: pageNumber,
  });
}
