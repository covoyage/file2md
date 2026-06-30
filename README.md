# file2md

[![CI](https://github.com/covoyage/file2md/actions/workflows/ci.yml/badge.svg)](https://github.com/covoyage/file2md/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@covoyage/file2md.svg)](https://www.npmjs.com/package/@covoyage/file2md)

**npm:** [`@covoyage/file2md`](https://www.npmjs.com/package/@covoyage/file2md) · **repo:** [github.com/covoyage/file2md](https://github.com/covoyage/file2md)

TypeScript library and CLI for converting files and office documents to Markdown.

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

The CLI is the recommended way for **AI agents and other automation** to convert files: run `file2md` as an external command and read Markdown from stdout—no in-process library import required.

### Installing the CLI

The package registers a `file2md` command. Choose one of:

**1. Run without installing** (good for one-off use):

```bash
npx @covoyage/file2md document.docx
```

**2. Install in a project** (adds `node_modules/.bin/file2md`):

```bash
npm install @covoyage/file2md
npx file2md document.docx
# or: ./node_modules/.bin/file2md document.docx
```

**3. Install globally** — npm automatically links `file2md` into its global bin directory (on your PATH when Node/npm is installed normally):

```bash
npm install -g @covoyage/file2md
file2md document.docx
```

Requires **Node.js 18+**.

### Usage

```bash
npx @covoyage/file2md document.docx
npx @covoyage/file2md document.pdf -o document.md
cat document.pdf | npx @covoyage/file2md -x pdf

file2md document.pdf -o document.md          # after global install
file2md -p custom.rtf                        # -p alias for --use-plugins
file2md report.pdf --cu-file-types pdf,docx
```

CLI flags include `-p` for plugins, `--cu-analyzer` alias, mutual exclusion of DocIntel and CU, cloud modes require a file path (not stdin), and `-x`/`-c` hints are normalized/validated.

### AI agents

Agents and automation tools—coding assistants, MCP servers, workflow runners, CI, or any runtime that can execute external commands—can call the CLI directly:

```bash
# Markdown on stdout — capture subprocess output
file2md /path/to/report.pdf

# Or write to a file the agent can read next
file2md /path/to/report.pdf -o /tmp/report.md

# Pipe file bytes when only a stream is available
cat /path/to/report.pdf | file2md -x pdf
```

- **Success:** exit code `0`; Markdown on stdout (unless `-o` is set).
- **Failure:** non-zero exit code; error message on stderr.
- **Prefer a file path** when possible; stdin works with `-x` / `-m` / `-c` hints. Azure DocIntel and Content Understanding require a path, not stdin.
- **`npx @covoyage/file2md`** works the same when the package is not installed globally.

For in-process use (e.g. a Node.js service), see [Library usage](#library-usage) below.

### Agent skill

An [Agent Skill](skills/file2md/SKILL.md) teaches coding assistants when and how to call the CLI (install steps, flags, exit codes, and CLI vs library boundaries). Install it in one of two ways:

**From [ClawHub](https://clawhub.ai/luduoxin/skills/file2md)** (OpenClaw and other ClawHub-compatible agents):

```bash
npm install -g clawhub
clawhub login
clawhub install file2md
# or: clawhub install @luduoxin/file2md
```

By default this installs into `./skills/file2md` under your agent workspace. Use `clawhub install --help` for `--workdir` and `--dir`.

**Manual install from this repository** — copy or symlink `skills/file2md` (must contain `SKILL.md`) into the directory your agent loads:

| Agent | Project path | Global path |
|-------|--------------|-------------|
| **Any (portable)** | `.agents/skills/file2md/` | `~/.agents/skills/file2md/` |
| **Cursor** | `.cursor/skills/file2md/` | `~/.cursor/skills/file2md/` |
| **Claude Code** | `.claude/skills/file2md/` | `~/.claude/skills/file2md/` |
| **OpenAI Codex** | `.codex/skills/file2md/` | `~/.codex/skills/file2md/` |
| **GitHub Copilot** | `.github/skills/file2md/` | `~/.copilot/skills/file2md/` |
| **Windsurf** | `.windsurf/skills/file2md/` | `~/.codeium/windsurf/skills/file2md/` |
| **OpenCode** | `.opencode/skills/file2md/` | `~/.config/opencode/skills/file2md/` |
| **OpenClaw** | `skills/file2md/` | `~/.openclaw/skills/file2md/` |

Examples after cloning this repo (`REPO=/path/to/file2md`):

```bash
# Cursor (project)
mkdir -p .cursor/skills && cp -r "$REPO/skills/file2md" .cursor/skills/

# Claude Code (global)
mkdir -p ~/.claude/skills && cp -r "$REPO/skills/file2md" ~/.claude/skills/

# Codex (global)
mkdir -p ~/.codex/skills && cp -r "$REPO/skills/file2md" ~/.codex/skills/

# GitHub Copilot (project)
mkdir -p .github/skills && cp -r "$REPO/skills/file2md" .github/skills/

# Windsurf (project)
mkdir -p .windsurf/skills && cp -r "$REPO/skills/file2md" .windsurf/skills/

# OpenClaw (workspace)
mkdir -p skills && cp -r "$REPO/skills/file2md" skills/

# Portable path (recognized by several agents, including Cursor)
mkdir -p .agents/skills && cp -r "$REPO/skills/file2md" .agents/skills/
```

To track this repo while developing the skill, symlink instead of copying:

```bash
ln -s "$REPO/skills/file2md" .cursor/skills/file2md
```

The skill source lives at [`skills/file2md/SKILL.md`](skills/file2md/SKILL.md).

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

- **PDF (Node):** Python pdfplumber pipeline first (when available). Otherwise pdf.js scans each page for form-style layouts vs prose. Pure prose documents then try pdfminer → `pdftotext` → pdf.js text; mixed PDFs use word-position table extraction on form pages, with per-page `pdftotext` for empty prose pages when available. Optional `pdfjs-dist` 6.x requires **Node.js 22.13+** when pdf.js runs in Node.
- **PDF (browser):** pdf.js only (form detection + prose line grouping).
- **Charset:** BOM detection, UTF-8 validation, CJK byte heuristics (GB18030, Shift_JIS, EUC-KR); optional `jschardet` in async detection.
- **CU output:** uses `@azure/ai-content-understanding` `toLlmInput` when installed; otherwise built-in `cuResultToLlmInput()`.

## License

[MIT](LICENSE)
