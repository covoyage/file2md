import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import { decodeText } from "../utils.js";

const ACCEPTED_MIME_TYPE_PREFIXES = ["text/csv", "application/csv"];
const ACCEPTED_FILE_EXTENSIONS = [".csv"];

function rowsToMarkdownTableRaw(rows: string[][]): string {
  if (rows.length === 0) return "";

  const header = rows[0]!;
  const colCount = header.length;
  const lines: string[] = [];

  lines.push("| " + header.join(" | ") + " |");
  lines.push("| " + Array(colCount).fill("---").join(" | ") + " |");

  for (const row of rows.slice(1)) {
    const cells = [...row];
    while (cells.length < colCount) cells.push("");
    lines.push("| " + cells.slice(0, colCount).join(" | ") + " |");
  }

  return lines.join("\n");
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i]!;
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r") i++;
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export class CsvConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_FILE_EXTENSIONS.includes(extension)) return true;

    return ACCEPTED_MIME_TYPE_PREFIXES.some((prefix) =>
      mimetype.startsWith(prefix),
    );
  }

  convert(data: Uint8Array, streamInfo: StreamInfo): DocumentConverterResult {
    const hasUtf8Bom =
      data.length >= 3 &&
      data[0] === 0xef &&
      data[1] === 0xbb &&
      data[2] === 0xbf;
    const content = decodeText(data, streamInfo.charset);
    const rows = parseCsv(content);
    if (rows.length === 0) {
      return new DocumentConverterResult("");
    }
    if (hasUtf8Bom && rows[0]?.[0] === "") {
      rows[0][0] = "\uFEFF";
    }
    return new DocumentConverterResult(rowsToMarkdownTableRaw(rows));
  }
}
