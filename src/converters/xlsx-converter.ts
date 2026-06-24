import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { ConvertOptions } from "../base-converter.js";
import {
  MissingDependencyException,
  MISSING_DEPENDENCY_MESSAGE,
} from "../exceptions.js";
import type { StreamInfo } from "../stream-info.js";
import { HtmlConverter } from "./html-converter.js";
import { importNodeUtil } from "../utils/import-node-util.js";

const ACCEPTED_XLSX_MIME = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const ACCEPTED_XLSX_EXT = [".xlsx"];

const ACCEPTED_XLS_MIME = ["application/vnd.ms-excel", "application/excel"];
const ACCEPTED_XLS_EXT = [".xls"];

async function loadXlsx() {
  try {
    const mod = await import("xlsx");
    return ("default" in mod && mod.default ? mod.default : mod) as typeof import("xlsx");
  } catch {
    throw new MissingDependencyException(
      MISSING_DEPENDENCY_MESSAGE.replace("{converter}", "XlsxConverter")
        .replace("{extension}", ".xlsx")
        .replace("{feature}", "xlsx"),
    );
  }
}

function escapePandasCellSpaces(value: string): string {
  // pandas.DataFrame.to_html() turns consecutive spaces into non-breaking spaces.
  return value.replace(/ {2,}/g, (run) => {
    const paired = Math.floor(run.length / 2) * 2;
    const nbspPart = "\u00a0".repeat(paired);
    const remainder = run.length % 2;
    return nbspPart + (remainder ? " " : "");
  });
}

async function extractWithPandas(
  data: Uint8Array,
): Promise<import("../utils/xlsx-pandas-node.js").PandasXlsxSheet[] | null> {
  if (!isNodeRuntime()) return null;
  try {
    const { extractXlsxHtmlWithPandas } = await importNodeUtil<
      typeof import("../utils/xlsx-pandas-node.js")
    >("xlsx-pandas-node.js");
    return extractXlsxHtmlWithPandas(data);
  } catch {
    return null;
  }
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions?.node === "string"
  );
}

function sheetMarkdownFromHtml(
  converter: HtmlConverter,
  html: string,
  options: ConvertOptions,
): string {
  return html.length === 0
    ? "|\n|  |"
    : converter.convertString(html, options).markdown.trim();
}

function escapeHtml(value: string): string {
  return escapePandasCellSpaces(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatCellText(value: string): string {
  // pandas/openpyxl normalizes line endings; pandas to_html then escapes as \\n.
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n");
}

function formatXlsxCellText(value: string): string {
  // Keep parity with pandas/openpyxl HTML table output.
  return formatCellText(value);
}

function formatNumberValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(rounded);
}

/** pandas.read_excel() default na_values (subset used in spreadsheets). */
const PANDAS_NA_STRINGS = new Set([
  "#N/A",
  "#N/A N/A",
  "#NA",
  "<NA>",
  "N/A",
  "NA",
  "NULL",
  "NaN",
  "n/a",
  "nan",
  "null",
]);

function isPandasNaString(value: string): boolean {
  return PANDAS_NA_STRINGS.has(value.trim());
}

/** pandas.read_excel mangles duplicate header labels as foo, foo.1, foo.2, ... */
function deduplicateColumnNames(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((header) => {
    const seen = counts.get(header) ?? 0;
    counts.set(header, seen + 1);
    if (seen === 0) return header;
    return `${header}.${seen}`;
  });
}

function formatSheetCell(
  cell: import("xlsx").CellObject | undefined,
  isHeader: boolean,
  columnIndex: number,
  formatText: (value: string) => string = formatCellText,
): string {
  if (isHeader) {
    if (
      !cell ||
      cell.v === undefined ||
      cell.v === null ||
      cell.v === ""
    ) {
      return `Unnamed: ${columnIndex}`;
    }
    return formatText(String(cell.w ?? cell.v));
  }

  if (
    !cell ||
    cell.v === undefined ||
    cell.v === null ||
    cell.v === ""
  ) {
    return "NaN";
  }

  if (typeof cell.v === "number" && Number.isNaN(cell.v)) {
    return "NaN";
  }

  if (typeof cell.v === "number") {
    return formatText(formatNumberValue(cell.v));
  }

  if (cell.w !== undefined && cell.w !== null && cell.w !== "") {
    const text = String(cell.w);
    if (isPandasNaString(text)) return "NaN";
    return formatText(text);
  }

  const text = String(cell.v);
  if (typeof cell.v === "string" && isPandasNaString(text)) {
    return "NaN";
  }

  return formatText(text);
}

function normalizeIntegerLikeColumns(rows: string[][]): string[][] {
  if (rows.length < 2) return rows;

  const colCount = rows[0]?.length ?? 0;
  for (let colIndex = 0; colIndex < colCount; colIndex++) {
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const value = rows[rowIndex]![colIndex] ?? "";
      if (/^0\d+$/.test(value)) {
        try {
          rows[rowIndex]![colIndex] = BigInt(value).toString();
        } catch {
          // Keep the original Excel display string.
        }
      }
    }
  }

  return rows;
}

/** Match pandas float64 columns: integers render as N.0 when mixed with NaN or floats. */
function normalizeFloatColumnDisplay(rows: string[][]): string[][] {
  if (rows.length < 2) return rows;

  const colCount = rows[0]?.length ?? 0;
  for (let colIndex = 0; colIndex < colCount; colIndex++) {
    const values = rows.slice(1).map((row) => row[colIndex] ?? "");

    let hasNonNumeric = false;
    let hasNaN = false;
    let hasFractional = false;
    let hasNumeric = false;

    for (const value of values) {
      if (value === "NaN") {
        hasNaN = true;
        continue;
      }
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        hasNonNumeric = true;
        continue;
      }
      hasNumeric = true;
      if (/^-?\d+\.\d*[1-9]\d*$/.test(value)) {
        hasFractional = true;
      }
    }

    if (hasNonNumeric || !hasNumeric) continue;

    const isFloatColumn = hasNaN || hasFractional;
    if (!isFloatColumn) continue;

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const value = rows[rowIndex]![colIndex] ?? "";
      if (/^-?\d+$/.test(value)) {
        rows[rowIndex]![colIndex] = `${value}.0`;
      }
    }
  }

  return rows;
}

function rowsToHtmlTable(rows: string[][]): string {
  if (rows.length === 0) return "<table></table>";

  const [header, ...body] = rows;
  let html =
    '<table border="1" class="dataframe"><thead><tr>';
  for (const cell of header ?? []) {
    html += `<th>${escapeHtml(String(cell ?? ""))}</th>`;
  }
  html += "</tr></thead><tbody>";

  const colCount = header?.length ?? 0;
  for (const row of body) {
    html += "<tr>";
    for (let i = 0; i < colCount; i++) {
      html += `<td>${escapeHtml(String(row[i] ?? ""))}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

function sheetToRows(
  sheet: import("xlsx").WorkSheet,
  XLSX: typeof import("xlsx"),
  formatText: (value: string) => string = formatCellText,
): string[][] {
  const ref = sheet["!ref"];
  if (!ref) return [];

  const decoded = XLSX.utils.decode_range(ref);
  let maxRow = decoded.s.r;
  let maxCol = decoded.s.c;

  for (let rowIndex = decoded.s.r; rowIndex <= decoded.e.r; rowIndex++) {
    for (let colIndex = decoded.s.c; colIndex <= decoded.e.c; colIndex++) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[address];
      if (
        !cell ||
        cell.v === undefined ||
        cell.v === null ||
        cell.v === ""
      ) {
        continue;
      }
      maxRow = Math.max(maxRow, rowIndex);
      maxCol = Math.max(maxCol, colIndex);
    }
  }

  const range = {
    s: { r: decoded.s.r, c: decoded.s.c },
    e: { r: maxRow, c: maxCol },
  };
  const rows: string[][] = [];

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
    const row: string[] = [];
    const isHeader = rowIndex === range.s.r;
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      row.push(formatSheetCell(sheet[address], isHeader, colIndex, formatText));
    }
    rows.push(row);
  }

  if (rows.length > 0) {
    rows[0] = deduplicateColumnNames(rows[0]!);
  }

  const colOffset = range.s.c;
  if (colOffset > 0) {
    return rows.map((row, rowIndex) => {
      const prefix = Array.from({ length: colOffset }, (_, columnIndex) =>
        rowIndex === 0
          ? `Unnamed: ${columnIndex}`
          : "NaN",
      );
      return [...prefix, ...row];
    });
  }

  return rows;
}

export class XlsxConverter extends DocumentConverter {
  private readonly htmlConverter = new HtmlConverter();

  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_XLSX_EXT.includes(extension)) return true;

    return ACCEPTED_XLSX_MIME.some((prefix) => mimetype.startsWith(prefix));
  }

  async convert(
    data: Uint8Array,
    _streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    const pandasSheets = await extractWithPandas(data);
    if (pandasSheets) {
      const parts: string[] = [];
      for (const { name, html } of pandasSheets) {
        const tableMarkdown = sheetMarkdownFromHtml(
          this.htmlConverter,
          html,
          options,
        );
        parts.push(
          tableMarkdown.length > 0
            ? `## ${name}\n${tableMarkdown}`
            : `## ${name}`,
        );
      }
      return new DocumentConverterResult(parts.join("\n\n").trim());
    }

    const XLSX = await loadXlsx();
    const workbook = XLSX.read(data, {
      type: "array",
      cellText: true,
      cellDates: false,
    });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = normalizeFloatColumnDisplay(
        normalizeIntegerLikeColumns(
          sheetToRows(sheet, XLSX, formatXlsxCellText),
        ),
      );

      const tableMarkdown =
        rows.length === 0
          ? "|\n|  |"
          : sheetMarkdownFromHtml(
              this.htmlConverter,
              rowsToHtmlTable(rows),
              options,
            );

      parts.push(
        tableMarkdown.length > 0
          ? `## ${sheetName}\n${tableMarkdown}`
          : `## ${sheetName}`,
      );
    }

    return new DocumentConverterResult(parts.join("\n\n").trim());
  }
}

export class XlsConverter extends DocumentConverter {
  private readonly htmlConverter = new HtmlConverter();

  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_XLS_EXT.includes(extension)) return true;

    return ACCEPTED_XLS_MIME.some((prefix) => mimetype.startsWith(prefix));
  }

  async convert(
    data: Uint8Array,
    _streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    const XLSX = await loadXlsx();
    const workbook = XLSX.read(data, {
      type: "array",
      cellText: true,
      cellDates: false,
    });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      const rows = normalizeFloatColumnDisplay(
        normalizeIntegerLikeColumns(sheetToRows(sheet, XLSX)),
      );

      const tableMarkdown =
        rows.length === 0
          ? "|\n|  |"
          : sheetMarkdownFromHtml(
              this.htmlConverter,
              rowsToHtmlTable(rows),
              options,
            );

      parts.push(
        tableMarkdown.length > 0
          ? `## ${sheetName}\n${tableMarkdown}`
          : `## ${sheetName}`,
      );
    }

    return new DocumentConverterResult(parts.join("\n\n").trim());
  }
}
