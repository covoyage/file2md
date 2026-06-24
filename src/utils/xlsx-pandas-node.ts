import { spawn } from "node:child_process";

const DEFAULT_PYTHON =
  process.env.FILE2MD_PYTHON ??
  process.env.PYTHON ??
  "python3";

export interface PandasXlsxSheet {
  name: string;
  html: string;
}

/**
 * Build per-sheet pandas HTML tables via a Python pandas/openpyxl subprocess.
 */
export async function extractXlsxHtmlWithPandas(
  data: Uint8Array,
  pythonPath = DEFAULT_PYTHON,
): Promise<PandasXlsxSheet[] | null> {
  const script = `
import io, sys, json, warnings
warnings.filterwarnings("ignore")
try:
    import pandas as pd
except ImportError:
    sys.exit(2)

data = sys.stdin.buffer.read()
sheets = pd.read_excel(io.BytesIO(data), sheet_name=None, engine="openpyxl")
result = []
for name, df in sheets.items():
    result.append({"name": name, "html": df.to_html(index=False)})
json.dump(result, sys.stdout)
`;

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: PandasXlsxSheet[] | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const child = spawn(pythonPath, ["-W", "ignore", "-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", () => {
      /* consume to prevent backpressure deadlock */
    });
    child.on("error", () => done(null));
    child.stdin.on("error", () => done(null));
    child.on("close", (code) => {
      if (code !== 0) {
        done(null);
        return;
      }
      try {
        const parsed = JSON.parse(
          Buffer.concat(stdout).toString("utf8"),
        ) as PandasXlsxSheet[];
        done(Array.isArray(parsed) ? parsed : null);
      } catch {
        done(null);
      }
    });

    child.stdin.write(
      typeof Buffer !== "undefined" ? Buffer.from(data) : data,
      () => child.stdin.end(),
    );
  });
}
