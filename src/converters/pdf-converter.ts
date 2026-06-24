import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import {
  MissingDependencyException,
  MISSING_DEPENDENCY_MESSAGE,
} from "../exceptions.js";
import type { StreamInfo } from "../stream-info.js";
import {
  extractFormContentFromWords,
  extractProseTextFromWords,
  extractWordsFromTextItems,
  postProcessPdfText,
} from "../utils/pdf-extract.js";
import { getPdfDocumentOptions, loadPdfJs } from "../utils/pdfjs-node.js";
import { importNodeUtil } from "../utils/import-node-util.js";

const ACCEPTED_MIME_TYPE_PREFIXES = [
  "application/pdf",
  "application/x-pdf",
];
const ACCEPTED_FILE_EXTENSIONS = [".pdf"];

const PARTIAL_NUMBERING_PATTERN = /^\.\d+$/;

interface PageExtraction {
  isFormPage: boolean;
  text: string;
}

function isLowQualityFormMarkdown(markdown: string): boolean {
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return true;

  const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (tableLines.length < 2) return false;

  const cells = tableLines.flatMap((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim())
      .filter(Boolean),
  );
  if (cells.length === 0) return false;

  const averageLength =
    cells.reduce((sum, cell) => sum + cell.length, 0) / cells.length;
  if (averageLength <= 2.5) return true;

  const singleCharRatio =
    cells.filter((cell) => cell.length === 1).length / cells.length;
  return singleCharRatio > 0.35;
}

function mergePartialNumberingLines(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const stripped = line.trim();

    if (PARTIAL_NUMBERING_PATTERN.test(stripped)) {
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim()) j++;

      if (j < lines.length) {
        result.push(`${stripped} ${lines[j]!.trim()}`);
        i = j + 1;
      } else {
        result.push(line);
        i++;
      }
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join("\n");
}

async function loadPdfJsOrThrow() {
  try {
    return await loadPdfJs();
  } catch {
    throw new MissingDependencyException(
      MISSING_DEPENDENCY_MESSAGE.replace("{converter}", "PdfConverter")
        .replace("{extension}", ".pdf")
        .replace("{feature}", "pdfjs-dist"),
    );
  }
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions?.node === "string"
  );
}

async function extractWithPdftotext(data: Uint8Array): Promise<string | null> {
  if (!isNodeRuntime()) return null;
  const { extractTextWithPdftotext } = await import(
    "../utils/pdf-pdftotext-node.js"
  );
  return extractTextWithPdftotext(data);
}

async function extractWithPdfplumber(data: Uint8Array): Promise<string | null> {
  if (!isNodeRuntime()) return null;
  try {
    const { extractMarkdownWithPdfplumber } = await importNodeUtil<
      typeof import("../utils/pdf-plumber-node.js")
    >("pdf-plumber-node.js");
    return extractMarkdownWithPdfplumber(data);
  } catch {
    return null;
  }
}

async function extractWithPdfminer(data: Uint8Array): Promise<string | null> {
  if (!isNodeRuntime()) return null;
  const { extractTextWithPdfminer } = await import(
    "../utils/pdf-pdfminer-node.js"
  );
  return extractTextWithPdfminer(data);
}

async function extractPageWithPdftotext(
  data: Uint8Array,
  pageNumber: number,
): Promise<string | null> {
  if (!isNodeRuntime()) return null;
  const { extractPageTextWithPdftotext } = await import(
    "../utils/pdf-pdftotext-node.js"
  );
  return extractPageTextWithPdftotext(data, pageNumber);
}

export class PdfConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_FILE_EXTENSIONS.includes(extension)) return true;

    return ACCEPTED_MIME_TYPE_PREFIXES.some((prefix) =>
      mimetype.startsWith(prefix),
    );
  }

  async convert(data: Uint8Array): Promise<DocumentConverterResult> {
    if (isNodeRuntime()) {
      const pdfplumberResult = await extractWithPdfplumber(data);
      if (pdfplumberResult != null) {
        return new DocumentConverterResult(
          mergePartialNumberingLines(postProcessPdfText(pdfplumberResult)),
        );
      }
    }

    const pdfjs = await loadPdfJsOrThrow();
    const sourceBytes = new Uint8Array(data);

    const loadingTask = pdfjs.getDocument(getPdfDocumentOptions(sourceBytes));
    const pdf = await loadingTask.promise;

    const pages: PageExtraction[] = [];
    let formPageCount = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const items = textContent.items as Array<{
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      }>;

      const words = extractWordsFromTextItems(items, viewport.height);
      const formContent = extractFormContentFromWords(words, viewport.width);

      if (formContent != null) {
        formPageCount++;
        pages.push({
          isFormPage: true,
          text: formContent.trim(),
        });
      } else {
        const proseText = extractProseTextFromWords(words).trim();
        pages.push({
          isFormPage: false,
          text: proseText,
        });
      }
    }

    let markdown: string;

    if (formPageCount === 0) {
      const proseResult =
        (await extractWithPdfminer(sourceBytes)) ??
        (await extractWithPdftotext(sourceBytes));
      markdown =
        proseResult ??
        pages
          .map((page) => page.text)
          .filter(Boolean)
          .join("\n\n")
          .trim();
    } else {
      if (isNodeRuntime()) {
        for (let index = 0; index < pages.length; index++) {
          const page = pages[index]!;
          if (page.isFormPage || page.text) continue;

          const improved = await extractPageWithPdftotext(sourceBytes, index + 1);
          if (improved?.trim()) {
            page.text = improved.trim();
          }
        }
      }

      markdown = pages
        .map((page) => page.text)
        .filter(Boolean)
        .join("\n\n")
        .trim();

      if (isNodeRuntime() && isLowQualityFormMarkdown(markdown)) {
        const proseResult =
          (await extractWithPdfminer(sourceBytes)) ??
          (await extractWithPdftotext(sourceBytes));
        if (proseResult?.trim()) {
          markdown = proseResult.trim();
        }
      }
    }

    markdown = postProcessPdfText(markdown);
    markdown = mergePartialNumberingLines(markdown);
    return new DocumentConverterResult(markdown);
  }
}
