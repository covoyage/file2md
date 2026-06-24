import { parseHtmlDocument } from "../html/parse.js";
import { htmlToMarkdown } from "../html/markdownify.js";
import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import { decodeText } from "../utils.js";

const HTML_MIMES = ["text/html", "application/xhtml"];
const HTML_EXTENSIONS = [".html", ".htm"];
const WIKIPEDIA_URL = /^https?:\/\/[a-zA-Z]{2,3}\.wikipedia\.org\//;

export class WikipediaConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const url = streamInfo.url ?? "";
    if (!WIKIPEDIA_URL.test(url)) return false;

    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (HTML_EXTENSIONS.includes(extension)) return true;
    return HTML_MIMES.some((p) => mimetype.startsWith(p));
  }

  convert(
    data: Uint8Array,
    streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): DocumentConverterResult {
    const html = decodeText(data, streamInfo.charset ?? "utf-8");
    const doc = parseHtmlDocument(html);

    for (const el of Array.from(doc.querySelectorAll("script, style"))) {
      el.remove();
    }

    const bodyEl = doc.querySelector("#mw-content-text");
    const titleEl = doc.querySelector(".mw-page-title-main");
    let mainTitle: string | null =
      doc.querySelector("title")?.textContent?.trim() ?? null;

    let markdown: string;

    if (bodyEl) {
      if (titleEl?.textContent) {
        mainTitle = titleEl.textContent.trim();
      }
      markdown = `# ${mainTitle ?? "Wikipedia"}\n\n${htmlToMarkdown(bodyEl, options)}`;
    } else {
      markdown = htmlToMarkdown(doc.documentElement, options);
    }

    return new DocumentConverterResult(markdown.trim(), { title: mainTitle });
  }
}
