import type { BinaryInput } from "./types.js";
import { detectTextCharset } from "./utils/charset.js";

export async function toUint8Array(input: BinaryInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    return new Uint8Array(input);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  throw new TypeError(
    "Expected Uint8Array, ArrayBuffer, or Blob.",
  );
}

export function getExtension(pathOrName: string): string | null {
  const base = pathOrName.split(/[/\\]/).pop() ?? pathOrName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return base.slice(dot).toLowerCase();
}

export function getBasename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

export function guessMimeTypeFromExtension(extension: string): string | null {
  const ext = extension.startsWith(".") ? extension.slice(1) : extension;
  const map: Record<string, string> = {
    txt: "text/plain",
    text: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    html: "text/html",
    htm: "text/html",
    csv: "text/csv",
    json: "application/json",
    jsonl: "application/json",
    xml: "text/xml",
    pdf: "application/pdf",
    docx:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pptx:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    ipynb: "application/json",
    epub: "application/epub+zip",
  };
  return map[ext.toLowerCase()] ?? null;
}

export function normalizeMarkdown(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, ""));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function escapeTableCell(value: string): string {
  // markdownify convert_td does not escape pipe characters inside cells.
  return value.replace(/\n/g, " ");
}

export interface MarkdownTableCell {
  text: string;
  colspan: number;
}

function isStringTableRows(
  rows: string[][] | MarkdownTableCell[][],
): rows is string[][] {
  const firstRow = rows[0];
  if (!firstRow || firstRow.length === 0) return true;
  return typeof firstRow[0] === "string";
}

function normalizeMarkdownTableRows(
  rows: string[][] | MarkdownTableCell[][],
): MarkdownTableCell[][] {
  if (isStringTableRows(rows)) {
    return rows.map((row) =>
      row.map((text) => ({ text, colspan: 1 })),
    );
  }
  return rows;
}

/** Match markdownify convert_td row assembly: `|` + Σ(` text |` × colspan). */
export function formatMarkdownTableDataRow(
  cells: MarkdownTableCell[],
): string {
  return (
    "|" +
    cells
      .map((cell) => {
        const colspan = Math.max(1, cell.colspan);
        return " " + escapeTableCell(cell.text) + " |".repeat(colspan);
      })
      .join("")
  );
}

export function rowsToMarkdownTable(
  rows: string[][] | MarkdownTableCell[][],
): string {
  const normalizedRows = normalizeMarkdownTableRows(rows);
  if (normalizedRows.length === 0) return "";

  const lines: string[] = [];
  const header = normalizedRows[0]!;
  const headerColCount = header.reduce(
    (count, cell) => count + Math.max(1, cell.colspan),
    0,
  );
  lines.push(formatMarkdownTableDataRow(header));
  lines.push("| " + Array(headerColCount).fill("---").join(" | ") + " |");

  for (const row of normalizedRows.slice(1)) {
    lines.push(formatMarkdownTableDataRow(row));
  }

  return lines.join("\n");
}

export function decodeText(
  data: Uint8Array,
  charset?: string | null,
): string {
  const encoding = resolveTextDecoderLabel(charset ?? detectTextCharset(data));
  return new TextDecoder(encoding, { fatal: false }).decode(data);
}

function resolveTextDecoderLabel(charset: string): string {
  const normalized = charset.trim().toLowerCase().replace(/_/g, "-");
  const aliases: Record<string, string> = {
    cp932: "shift_jis",
    "shift-jis": "shift_jis",
    shiftjis: "shift_jis",
    gb2312: "gb18030",
    gbk: "gb18030",
  };
  return aliases[normalized] ?? charset;
}

export function parseDataUri(uri: string): {
  mimetype: string;
  charset: string | null;
  data: Uint8Array;
} {
  const match = /^data:([^;,]+)?(?:;charset=([^;,]+))?(?:;base64)?,(.*)$/i.exec(
    uri.trim(),
  );
  if (!match) {
    throw new Error(`Invalid data URI: ${uri.slice(0, 64)}...`);
  }

  const mimetype = match[1] || "text/plain";
  const charset = match[2] ?? null;
  const payload = match[3] ?? "";
  const isBase64 = uri.includes(";base64,");

  let data: Uint8Array;
  if (isBase64) {
    const binary = atob(payload);
    data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }
  } else {
    data = new TextEncoder().encode(decodeURIComponent(payload));
  }

  return { mimetype, charset, data };
}

export function fileUriToPath(uri: string): string {
  const parsed = new URL(uri);
  if (parsed.protocol !== "file:") {
    throw new Error(`Not a file URI: ${uri}`);
  }
  if (parsed.hostname && parsed.hostname !== "localhost") {
    throw new Error(
      `Unsupported file URI: ${uri}. Host must be empty or localhost.`,
    );
  }
  let path = decodeURIComponent(parsed.pathname);
  if (/^\/[A-Za-z]:/.test(path)) {
    path = path.slice(1);
  }
  return path;
}
