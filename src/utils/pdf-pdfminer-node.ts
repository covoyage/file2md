import { spawn } from "node:child_process";

const DEFAULT_PYTHON =
  process.env.FILE2MD_PYTHON ??
  process.env.PYTHON ??
  "python3";

export async function extractTextWithPdfminer(
  data: Uint8Array,
  pythonPath = DEFAULT_PYTHON,
): Promise<string | null> {
  const script = `
import io, sys
try:
    import pdfminer.high_level
except ImportError:
    sys.exit(2)
data = sys.stdin.buffer.read()
text = pdfminer.high_level.extract_text(io.BytesIO(data)) or ""
sys.stdout.write(text)
`;

  return new Promise((resolve) => {
    const child = spawn(pythonPath, ["-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
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
