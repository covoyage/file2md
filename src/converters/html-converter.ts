import { parseHtmlDocument } from "../html/parse.js";
import { htmlToMarkdown } from "../html/markdownify.js";
import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import { decodeText } from "../utils.js";

const ACCEPTED_MIME_TYPE_PREFIXES = [
  "text/html",
  "application/xhtml",
];

const ACCEPTED_FILE_EXTENSIONS = [".html", ".htm"];

/** linkedom may nest a full XHTML document inside <body> for namespaced EPUB files. */
function resolveHtmlContentRoot(doc: Document): HTMLElement | Element {
  let body = doc.body;
  if (!body) return doc.documentElement;

  const nestedBody = body.querySelector("html body");
  if (nestedBody && nestedBody !== body) {
    body = nestedBody as HTMLElement;
  }

  if (body.childNodes.length > 0 || body.textContent?.trim()) {
    return body;
  }

  return doc.documentElement;
}

export class HtmlConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_FILE_EXTENSIONS.includes(extension)) return true;

    return ACCEPTED_MIME_TYPE_PREFIXES.some((prefix) =>
      mimetype.startsWith(prefix),
    );
  }

  convert(
    data: Uint8Array,
    streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): DocumentConverterResult {
    const strict = options.strict === true;
    const html = decodeText(data, streamInfo.charset ?? "utf-8");
    return this.convertString(html, { url: streamInfo.url, strict, ...options });
  }

  convertString(
    htmlContent: string,
    options: ConvertOptions & { url?: string | null; strict?: boolean } = {},
  ): DocumentConverterResult {
    const { strict = false, url: _url, ...rest } = options;
    const doc = parseHtmlDocument(htmlContent);

    for (const el of Array.from(doc.querySelectorAll("script, style"))) {
      el.remove();
    }

    const title = doc.querySelector("title")?.textContent?.trim() ?? null;
    const contentRoot = resolveHtmlContentRoot(doc);

    let markdown: string;
    try {
      markdown = htmlToMarkdown(contentRoot, rest);
    } catch (error) {
      if (strict) throw error;
      markdown = contentRoot?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      console.warn(
        "HTML document is too complex for markdown conversion; falling back to plain text.",
      );
    }

    return new DocumentConverterResult(markdown.trim(), { title });
  }
}
