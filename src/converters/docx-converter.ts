import mammoth from "mammoth";
import JSZip from "jszip";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { ConvertOptions } from "../base-converter.js";
import { preProcessDocx } from "../converter-utils/docx/pre-process.js";
import {
  MissingDependencyException,
  MISSING_DEPENDENCY_MESSAGE,
} from "../exceptions.js";
import type { StreamInfo } from "../stream-info.js";
import { findElementsByLocalName, parseXmlDocument } from "../utils/xml.js";
import { HtmlConverter } from "./html-converter.js";

const ACCEPTED_MIME_TYPE_PREFIXES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_FILE_EXTENSIONS = [".docx"];

async function appendMissingFootnotes(
  markdown: string,
  processed: Uint8Array,
): Promise<string> {
  const zip = await JSZip.loadAsync(processed);
  const footnotesXml = await zip.file("word/footnotes.xml")?.async("string");
  if (!footnotesXml) return markdown;

  const doc = parseXmlDocument(footnotesXml);
  const notes: string[] = [];

  for (const footnote of findElementsByLocalName(doc, "footnote")) {
    const id = footnote.getAttribute("w:id") ?? footnote.getAttribute("id");
    if (id === "-1" || id === "0") continue;

    const refMarker = `(#footnote-ref-${id})`;
    if (markdown.includes(refMarker)) continue;

    const parts: string[] = [];
    for (const textNode of findElementsByLocalName(footnote, "t")) {
      const text = textNode.textContent ?? "";
      if (text) parts.push(text);
    }

    const note = parts.join("").trim();
    if (note && !markdown.includes(note)) {
      notes.push(note);
    }
  }

  if (notes.length === 0) return markdown;
  return `${markdown.trim()}\n\n${notes.join("\n\n")}`.trim();
}

function normalizeDocxMarkdown(markdown: string): string {
  return markdown
    .replace(/(\(#footnote-ref-\d+\))\n{2,}(\s*\d+\.)/g, "$1\n$2")
    .replace(
      /as follows\.  (?=\* Specific configuration settings are defined to prevent )/g,
      "as follows.   ",
    );
}

export class DocxConverter extends DocumentConverter {
  private readonly htmlConverter = new HtmlConverter();

  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_FILE_EXTENSIONS.includes(extension)) return true;

    return ACCEPTED_MIME_TYPE_PREFIXES.some((prefix) =>
      mimetype.startsWith(prefix),
    );
  }

  async convert(
    data: Uint8Array,
    _streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    try {
      const styleMap =
        typeof options.styleMap === "string" ? options.styleMap : undefined;

      const processed = await preProcessDocx(data);
      const buffer = Buffer.from(processed);

      const result = await mammoth.convertToHtml(
        { buffer },
        styleMap ? { styleMap } : undefined,
      );

      const converted = this.htmlConverter.convertString(result.value, options);
      const markdown = normalizeDocxMarkdown(
        await appendMissingFootnotes(converted.markdown, processed),
      );
      if (markdown === converted.markdown) {
        return converted;
      }

      return new DocumentConverterResult(markdown, { title: converted.title });
    } catch (error) {
      if (
        error instanceof Error &&
        /Cannot find module|mammoth/i.test(error.message)
      ) {
        throw new MissingDependencyException(
          MISSING_DEPENDENCY_MESSAGE.replace("{converter}", "DocxConverter")
            .replace("{extension}", ".docx")
            .replace("{feature}", "mammoth"),
        );
      }
      throw error;
    }
  }
}
