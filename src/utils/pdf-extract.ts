/**
 * PDF word-position analysis for form-style table extraction (pdfplumber).
 */

export interface PdfWord {
  text: string;
  x0: number;
  x1: number;
  top: number;
}

const PARTIAL_NUMBERING_PATTERN = /^\.\d+$/;
const COLUMN_GAP_THRESHOLD = 80;

interface ColumnCluster {
  text: string;
  x0: number;
  x1: number;
}

interface RowInfo {
  yKey: number;
  words: PdfWord[];
  text: string;
  columns: ColumnCluster[];
  xGroups: number[];
  isParagraph: boolean;
  numColumns: number;
  hasPartialNumbering: boolean;
  isTableRow?: boolean;
}

function clusterRowWords(
  rowWords: PdfWord[],
  gapThreshold = COLUMN_GAP_THRESHOLD,
): ColumnCluster[] {
  const sorted = [...rowWords].sort((a, b) => a.x0 - b.x0);
  if (sorted.length === 0) return [];

  const columns: ColumnCluster[] = [
    {
      text: sorted[0]!.text,
      x0: sorted[0]!.x0,
      x1: sorted[0]!.x1,
    },
  ];

  for (let i = 1; i < sorted.length; i++) {
    const word = sorted[i]!;
    const current = columns[columns.length - 1]!;
    if (word.x0 - current.x1 > gapThreshold) {
      columns.push({ text: word.text, x0: word.x0, x1: word.x1 });
    } else {
      current.text += " " + word.text;
      current.x1 = word.x1;
    }
  }

  return columns;
}

export function extractWordsFromTextItems(
  items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>,
  pageHeight: number,
): PdfWord[] {
  const words: PdfWord[] = [];

  for (const item of items) {
    const str = item.str;
    if (!str) continue;

    const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
    const x0 = transform[4] ?? 0;
    const y = transform[5] ?? 0;
    const height = item.height ?? 12;
    const top = pageHeight - y - height;
    const totalWidth = item.width ?? str.length * 5;

    const parts = str.match(/\S+|\s+/g) ?? [str];
    if (parts.length === 1) {
      words.push({
        text: parts[0]!,
        x0,
        x1: x0 + totalWidth,
        top,
      });
      continue;
    }

    let offsetX = x0;
    const charWidth = totalWidth / Math.max(str.length, 1);
    for (const part of parts) {
      if (/^\s+$/.test(part)) {
        offsetX += charWidth * part.length;
        continue;
      }
      const partWidth = charWidth * part.length;
      words.push({
        text: part,
        x0: offsetX,
        x1: offsetX + partWidth,
        top,
      });
      offsetX += partWidth;
    }
  }

  return words;
}

/**
 * Distinguish real multi-column table rows from flowing prose or magazine columns.
 */
function hasSpacedLetterColumns(columns: ColumnCluster[]): boolean {
  if (columns.length < 3) return false;
  const shortColumns = columns.filter(
    (column) => column.text.trim().length <= 2,
  ).length;
  return shortColumns / columns.length >= 0.4;
}

function isStructuredTableRow(columns: ColumnCluster[]): boolean {
  if (hasSpacedLetterColumns(columns)) return false;
  if (columns.length < 3) return false;

  const lengths = columns.map((column) => column.text.trim().length);
  if (lengths.some((length) => length > 80)) return false;

  const averageLength =
    lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  if (averageLength > 40) return false;

  return true;
}

function isProseRow(
  columns: ColumnCluster[],
  lineWidth: number,
  pageWidth: number,
): boolean {
  const combinedText = columns.map((column) => column.text).join(" ");
  if (lineWidth > pageWidth * 0.55 && combinedText.length > 60) {
    return true;
  }

  // Magazine/newspaper columns: each column chunk contains sentence-like text.
  if (
    columns.length >= 2 &&
    columns.every((column) => column.text.trim().length > 25)
  ) {
    return true;
  }

  return false;
}

export function extractFormContentFromWords(
  words: PdfWord[],
  pageWidth = 612,
): string | null {
  if (words.length === 0) return null;

  const yTolerance = 5;
  const rowsByY = new Map<number, PdfWord[]>();

  for (const word of words) {
    const yKey = Math.round(word.top / yTolerance) * yTolerance;
    const row = rowsByY.get(yKey) ?? [];
    row.push(word);
    rowsByY.set(yKey, row);
  }

  const sortedYKeys = [...rowsByY.keys()].sort((a, b) => a - b);
  const rowInfo: RowInfo[] = [];

  for (const yKey of sortedYKeys) {
    const rowWords = [...(rowsByY.get(yKey) ?? [])].sort(
      (a, b) => a.x0 - b.x0,
    );
    if (rowWords.length === 0) continue;

    const firstX0 = rowWords[0]!.x0;
    const lastX1 = rowWords[rowWords.length - 1]!.x1;
    const lineWidth = lastX1 - firstX0;
    const columns = clusterRowWords(rowWords);
    const combinedText = columns.map((column) => column.text).join("  ");
    const xGroups = columns.map((column) => column.x0);
    const numColumns = columns.length;

    const isParagraph = isProseRow(columns, lineWidth, pageWidth);
    const firstWord = rowWords[0]!.text.trim();
    const hasPartialNumbering = PARTIAL_NUMBERING_PATTERN.test(firstWord);

    rowInfo.push({
      yKey,
      words: rowWords,
      text: combinedText,
      columns,
      xGroups,
      isParagraph,
      numColumns,
      hasPartialNumbering,
    });
  }

  const allTableXPositions: number[] = [];
  for (const info of rowInfo) {
    if (
      info.numColumns >= 3 &&
      !info.isParagraph &&
      !hasSpacedLetterColumns(info.columns) &&
      isStructuredTableRow(info.columns)
    ) {
      allTableXPositions.push(...info.xGroups);
    }
  }

  if (allTableXPositions.length === 0) return null;

  allTableXPositions.sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let i = 0; i < allTableXPositions.length - 1; i++) {
    const gap = allTableXPositions[i + 1]! - allTableXPositions[i]!;
    if (gap > 5) gaps.push(gap);
  }

  let adaptiveTolerance = 35;
  if (gaps.length >= 3) {
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const percentile70Idx = Math.floor(sortedGaps.length * 0.7);
    adaptiveTolerance = sortedGaps[percentile70Idx]!;
    adaptiveTolerance = Math.max(25, Math.min(50, adaptiveTolerance));
  }

  const globalColumns: number[] = [];
  for (const x of allTableXPositions) {
    if (
      globalColumns.length === 0 ||
      x - globalColumns[globalColumns.length - 1]! > adaptiveTolerance
    ) {
      globalColumns.push(x);
    }
  }

  if (globalColumns.length > 1) {
    const contentWidth =
      globalColumns[globalColumns.length - 1]! - globalColumns[0]!;
    const avgColWidth = contentWidth / globalColumns.length;

    if (avgColWidth < 30) return null;

    const columnsPerInch = globalColumns.length / (contentWidth / 72);
    if (columnsPerInch > 10) return null;

    const adaptiveMaxColumns = Math.max(
      15,
      Math.floor(20 * (pageWidth / 612)),
    );
    if (globalColumns.length > adaptiveMaxColumns) return null;
  } else {
    return null;
  }

  for (const info of rowInfo) {
    if (info.isParagraph) {
      info.isTableRow = false;
      continue;
    }
    if (info.hasPartialNumbering) {
      info.isTableRow = false;
      continue;
    }

    const alignedColumns = new Set<number>();
    for (const word of info.words) {
      for (let colIdx = 0; colIdx < globalColumns.length; colIdx++) {
        if (Math.abs(word.x0 - globalColumns[colIdx]!) < 40) {
          alignedColumns.add(colIdx);
          break;
        }
      }
    }
    info.isTableRow = alignedColumns.size >= 2;
  }

  const tableRegions: Array<[number, number]> = [];
  let i = 0;
  while (i < rowInfo.length) {
    if (rowInfo[i]!.isTableRow) {
      const startIdx = i;
      while (i < rowInfo.length && rowInfo[i]!.isTableRow) i++;
      tableRegions.push([startIdx, i]);
    } else {
      i++;
    }
  }

  const totalTableRows = tableRegions.reduce(
    (sum, [start, end]) => sum + (end - start),
    0,
  );
  if (rowInfo.length > 0 && totalTableRows / rowInfo.length < 0.2) {
    return null;
  }

  const resultLines: string[] = [];
  const numCols = globalColumns.length;

  function extractCells(info: RowInfo): string[] {
    const cells = Array.from({ length: numCols }, () => "");
    for (const word of info.words) {
      let assignedCol = numCols - 1;
      for (let colIdx = 0; colIdx < numCols - 1; colIdx++) {
        const colEnd = globalColumns[colIdx + 1]!;
        if (word.x0 < colEnd - 20) {
          assignedCol = colIdx;
          break;
        }
      }
      if (cells[assignedCol]) {
        cells[assignedCol] += " " + word.text;
      } else {
        cells[assignedCol] = word.text;
      }
    }
    return cells;
  }

  let idx = 0;
  while (idx < rowInfo.length) {
    const info = rowInfo[idx]!;
    const tableRegion = tableRegions.find(([start]) => start === idx);

    if (tableRegion) {
      const [start, end] = tableRegion;
      const tableData: string[][] = [];
      for (let tableIdx = start; tableIdx < end; tableIdx++) {
        tableData.push(extractCells(rowInfo[tableIdx]!));
      }

      if (tableData.length > 0) {
        const colWidths = Array.from({ length: numCols }, (_, col) =>
          Math.max(
            3,
            ...tableData.map((row) => row[col]?.length ?? 0),
          ),
        );

        const header = tableData[0]!;
        resultLines.push(
          "| " +
            header.map((cell, i) => cell.padEnd(colWidths[i]!)).join(" | ") +
            " |",
        );
        resultLines.push(
          "| " +
            colWidths.map((w) => "-".repeat(w)).join(" | ") +
            " |",
        );
        for (const row of tableData.slice(1)) {
          resultLines.push(
            "| " +
              row.map((cell, i) => cell.padEnd(colWidths[i]!)).join(" | ") +
              " |",
          );
        }
      }

      idx = end;
    } else {
      const inTable = tableRegions.some(
        ([start, end]) => start < idx && idx < end,
      );
      if (!inTable) {
        resultLines.push(info.text);
      }
      idx++;
    }
  }

  return resultLines.join("\n");
}

export function extractProseTextFromWords(words: PdfWord[]): string {
  if (words.length === 0) return "";

  const yTolerance = 3;
  const rowsByY = new Map<number, PdfWord[]>();

  for (const word of words) {
    const yKey = Math.round(word.top / yTolerance) * yTolerance;
    const row = rowsByY.get(yKey) ?? [];
    row.push(word);
    rowsByY.set(yKey, row);
  }

  const lines: string[] = [];
  for (const yKey of [...rowsByY.keys()].sort((a, b) => a - b)) {
    const rowWords = [...(rowsByY.get(yKey) ?? [])].sort(
      (a, b) => a.x0 - b.x0,
    );
    const columns = clusterRowWords(rowWords);
    const line =
      columns.length >= 3 &&
      columns.every((column) => column.text.trim().length === 1)
        ? columns.map((column) => column.text.trim()).join("")
        : columns
            .map((column) => column.text.trim())
            .filter(Boolean)
            .join("  ");

    if (line) lines.push(line);
  }

  return lines.join("\n");
}

export function mergeHyphenatedLines(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? "";
    while (
      line.endsWith("-") &&
      i + 1 < lines.length &&
      /^[a-z]/.test(lines[i + 1]!.trimStart())
    ) {
      line = line.slice(0, -1) + lines[i + 1]!.trimStart();
      i++;
    }
    result.push(line);
  }

  return result.join("\n");
}

export function postProcessPdfText(text: string): string {
  return text;
}

export function extractPlainTextFromItems(
  items: Array<{ str?: string }>,
): string {
  return items
    .map((item) => item.str ?? "")
    .join(" ")
    .trim();
}
