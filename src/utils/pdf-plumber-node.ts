import { spawn } from "node:child_process";

const DEFAULT_PYTHON =
  process.env.FILE2MD_PYTHON ??
  process.env.PYTHON ??
  "python3";

/**
 * Extract PDF markdown via pdfplumber/pdfminer (Python subprocess).
 * Optional form-table helpers: set FILE2MD_PDF_FORM_MODULE to a Python module
 * exporting `_extract_form_content_from_words` and `_merge_partial_numbering_lines`.
 */
export async function extractMarkdownWithPdfplumber(
  data: Uint8Array,
  pythonPath = DEFAULT_PYTHON,
): Promise<string | null> {
  const script = `
import io, os, sys, warnings, importlib
warnings.filterwarnings("ignore")
try:
    import pdfplumber
    import pdfminer.high_level
except ImportError:
    sys.exit(2)

form_mod_name = os.environ.get("FILE2MD_PDF_FORM_MODULE", "markitdown.converters._pdf_converter")
try:
    _pdf = importlib.import_module(form_mod_name)
    _extract_form_content_from_words = _pdf._extract_form_content_from_words
    _merge_partial_numbering_lines = _pdf._merge_partial_numbering_lines
except ImportError:
    def _extract_form_content_from_words(page):
        return None
    def _merge_partial_numbering_lines(md):
        return md

data = sys.stdin.buffer.read()
pdf_bytes = io.BytesIO(data)

try:
    markdown_chunks = []
    form_page_count = 0

    with pdfplumber.open(pdf_bytes) as pdf:
        for page in pdf.pages:
            page_content = _extract_form_content_from_words(page)
            if page_content is not None:
                form_page_count += 1
                if page_content.strip():
                    markdown_chunks.append(page_content)
            else:
                text = page.extract_text()
                if text and text.strip():
                    markdown_chunks.append(text.strip())
            page.close()

    if form_page_count == 0:
        pdf_bytes.seek(0)
        markdown = pdfminer.high_level.extract_text(pdf_bytes) or ""
    else:
        markdown = "\\n\\n".join(markdown_chunks).strip()

    markdown = _merge_partial_numbering_lines(markdown)
    sys.stdout.write(markdown)
except Exception:
    sys.exit(1)
`;

  return new Promise((resolve) => {
    const child = spawn(pythonPath, ["-W", "ignore", "-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
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
