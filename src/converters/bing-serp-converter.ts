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
const BING_SERP_URL = /^https:\/\/www\.bing\.com\/search\?q=/;

function decodeBingRedirect(href: string): string {
  try {
    const parsed = new URL(href);
    const u = parsed.searchParams.get("u");
    if (!u) return href;

    const padded = u.slice(2).trim() + "==";
    const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return binary;
  } catch {
    return href;
  }
}

export class BingSerpConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const url = streamInfo.url ?? "";
    if (!BING_SERP_URL.test(url)) return false;

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
    const url = streamInfo.url!;
    const query = new URL(url).searchParams.get("q") ?? "";

    const html = decodeText(data, streamInfo.charset ?? "utf-8");
    const doc = parseHtmlDocument(html);

    for (const el of Array.from(doc.querySelectorAll(".tptt"))) {
      if (el.textContent) el.textContent += " ";
    }
    for (const el of Array.from(doc.querySelectorAll(".algoSlug_icon"))) {
      el.remove();
    }

    const results: string[] = [];

    for (const result of Array.from(doc.querySelectorAll(".b_algo"))) {
      for (const anchor of Array.from(result.querySelectorAll("a[href]"))) {
        const href = anchor.getAttribute("href");
        if (href) {
          if (/bing\.com\/ck\/a/i.test(href)) {
            anchor.replaceWith(anchor.textContent ?? "");
            continue;
          }
          anchor.setAttribute("href", decodeBingRedirect(href));
        }
      }

      const md = htmlToMarkdown(result, options).trim();
      const lines = md
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length > 0) results.push(lines.join("\n"));
    }

    const markdown =
      `## A Bing search for '${query}' found the following results:\n\n` +
      results.join("\n\n");

    const title = doc.querySelector("title")?.textContent?.trim() ?? null;

    return new DocumentConverterResult(markdown, { title });
  }
}
