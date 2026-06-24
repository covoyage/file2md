# file2md

[![CI](https://github.com/covoyage/file2md/actions/workflows/ci.yml/badge.svg)](https://github.com/covoyage/file2md/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@covoyage/file2md.svg)](https://www.npmjs.com/package/@covoyage/file2md)

**npm:** [`@covoyage/file2md`](https://www.npmjs.com/package/@covoyage/file2md) · **repo:** [github.com/covoyage/file2md](https://github.com/covoyage/file2md)

Convert documents and media to Markdown for LLMs and text analysis pipelines.

Works in **Node.js 18+** and **browsers** (including Svelte / Vite apps).

## Quick start

```bash
npm install @covoyage/file2md
```

```typescript
import { File2MD } from "@covoyage/file2md";

const md = new File2MD();
const result = await md.convertLocal("./report.docx");
console.log(result.markdown);
```

## CLI

With `npx` (no global install):

```bash
npx @covoyage/file2md document.docx
npx @covoyage/file2md document.pdf -o document.md
cat document.pdf | npx @covoyage/file2md -x pdf
```

After global install (`npm install -g @covoyage/file2md`), the command is `file2md`:

```bash
file2md document.pdf -o document.md
file2md -p custom.rtf                    # -p alias for --use-plugins
file2md report.pdf --cu-file-types pdf,docx
```

CLI flags include `-p` for plugins, `--cu-analyzer` alias, mutual exclusion of DocIntel and CU, cloud modes require a file path (not stdin), and `-x`/`-c` hints are normalized/validated.

## Library usage

### Node.js

```typescript
import { File2MD } from "@covoyage/file2md";

const md = new File2MD({
  llmClient,
  llmModel: "gpt-4o",
  exiftoolPath: "/usr/local/bin/exiftool",
  docintelEndpoint: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
  docintelCredential: process.env.AZURE_API_KEY,
});

const result = await md.convertLocal("./document.docx");
console.log(result.markdown);
```

### Browser / Svelte

```typescript
import { File2MD } from "@covoyage/file2md";

const md = new File2MD();
const result = await md.convertStream(file, {
  streamInfo: { extension: ".pdf", filename: file.name },
});
```

**Browser notes:** use `convertStream()` with file bytes from an `<input type="file">` or drag-and-drop. `convertLocal()` is Node-only. Features that need subprocesses (exiftool, ffmpeg, Python PDF backends) are not available in the browser; PDF falls back to pdfjs.

## Supported formats

| Category | Formats |
|----------|---------|
| Documents | `.txt`, `.md`, `.json`, `.html`, `.csv`, `.docx`, `.xlsx`, `.xls`, `.pptx`, `.pdf`, `.ipynb`, `.epub`, `.zip` |
| Email | `.msg` (Outlook) |
| Media | `.jpg`, `.png`, `.gif`, `.webp`, `.wav`, `.mp3`, `.m4a`, `.mp4` |
| Feeds / Web | RSS, Atom, Wikipedia URLs, YouTube URLs, Bing SERP URLs |
| Cloud (optional) | Azure Document Intelligence, Azure Content Understanding |

## API overview

- `File2MD.convert()` / `convertLocal()` / `convertStream()` / `convertUri()` / `convertUrl()` (alias) / `convertResponse()`
- `DocumentConverterResult.markdown` and legacy alias `text_content`
- `registerConverter()` / deprecated `registerPageConverter()`
- `enableBuiltins()` / `enablePlugins()`
- Plugin registry via `registerPlugin()` and npm package discovery (`file2md.plugin`)
- Global options: `llmClient`, `llmModel`, `llmPrompt`, `exiftoolPath`, `styleMap`, `azureCredentialProvider`
- Azure: `docintelEndpoint`, `cuEndpoint`, subscription key or `DefaultAzureCredential`
- YouTube: transcript via `youtube-transcript-plus` when installed
- Audio: metadata via exiftool; transcription via ffmpeg (Node) or custom `transcribeAudio`

Advanced helpers: `loadPdfJs`, `getPdfDocumentOptions`, `preProcessDocx`, `htmlToMarkdown`, charset utilities.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `FILE2MD_PYTHON` | Python executable for pdfminer / pandas backends |
| `FILE2MD_PDF_FORM_MODULE` | Python module with PDF form-table helpers (optional) |
| `EXIFTOOL_PATH` | Path to exiftool binary |
| `AZURE_API_KEY` | Azure subscription key for DocIntel / CU |
| `DOCUMENT_INTELLIGENCE_ENDPOINT` | Azure Document Intelligence endpoint (CLI) |
| `AZURE_CONTENT_UNDERSTANDING_ENDPOINT` | Azure Content Understanding endpoint (CLI) |

## Plugins

Third-party plugins are discovered from installed npm packages when `enablePlugins: true`.

Add to your package's `package.json`:

```json
{
  "name": "my-file2md-plugin",
  "file2md": {
    "plugin": "./dist/plugin.js"
  }
}
```

The plugin module must export `registerConverters(file2md, options?)` (or snake_case `register_converters`).

```typescript
import { File2MD, registerPlugin } from "@covoyage/file2md";

registerPlugin({
  registerConverters(file2md) {
    file2md.registerConverter(myCustomConverter);
  },
});

const md = new File2MD({ enablePlugins: true });
```

## Behavior notes

- **PDF (Node):** Python pdfplumber pipeline first (when available). Otherwise pdf.js scans each page for form-style layouts vs prose. Pure prose documents then try pdfminer → `pdftotext` → pdf.js text; mixed PDFs use word-position table extraction on form pages, with per-page `pdftotext` for empty prose pages when available.
- **PDF (browser):** pdf.js only (form detection + prose line grouping).
- **Charset:** BOM detection, UTF-8 validation, CJK byte heuristics (GB18030, Shift_JIS, EUC-KR); optional `jschardet` in async detection.
- **CU output:** uses `@azure/ai-content-understanding` `toLlmInput` when installed; otherwise built-in `cuResultToLlmInput()`.

## License

[MIT](LICENSE)
