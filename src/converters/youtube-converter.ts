import { parseHtmlDocument } from "../html/parse.js";
import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import type { YouTubeTranscriptFetcher } from "../types.js";
import { decodeText } from "../utils.js";
import { getDefaultYouTubeTranscriptFetcher } from "../utils/youtube-transcript.js";

const HTML_MIMES = ["text/html", "application/xhtml"];
const HTML_EXTENSIONS = [".html", ".htm"];

function normalizeYouTubeUrl(url: string): string {
  return url.replace(/\\?\?/g, "?").replace(/\\?=/g, "=");
}

function findKey(json: unknown, key: string): unknown {
  if (Array.isArray(json)) {
    for (const item of json) {
      const found = findKey(item, key);
      if (found !== undefined && found !== null) return found;
    }
  } else if (json && typeof json === "object") {
    for (const [k, v] of Object.entries(json)) {
      if (k === key) return v;
      const found = findKey(v, key);
      if (found !== undefined && found !== null) return found;
    }
  }
  return null;
}

export class YouTubeConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const url = normalizeYouTubeUrl(streamInfo.url ?? "");
    if (!url.startsWith("https://www.youtube.com/watch?")) return false;

    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (HTML_EXTENSIONS.includes(extension)) return true;
    return HTML_MIMES.some((p) => mimetype.startsWith(p));
  }

  async convert(
    data: Uint8Array,
    streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    const html = decodeText(data, streamInfo.charset ?? "utf-8");
    const doc = parseHtmlDocument(html);

    const metadata: Record<string, string> = {};

    const pageTitle = doc.querySelector("title")?.textContent?.trim();
    if (pageTitle) metadata.title = pageTitle;

    for (const meta of Array.from(doc.querySelectorAll("meta"))) {
      for (const attr of ["itemprop", "property", "name"]) {
        const key = meta.getAttribute(attr);
        const content = meta.getAttribute("content");
        if (key && content) {
          metadata[key] = content;
          break;
        }
      }
    }

    for (const script of Array.from(doc.querySelectorAll("script"))) {
      const content = script.textContent;
      if (!content?.includes("ytInitialData")) continue;

      const match = /var ytInitialData = (\{.*?\});/s.exec(content);
      if (!match?.[1]) continue;

      try {
        const initialData = JSON.parse(match[1]) as unknown;
        const attrDesc = findKey(initialData, "attributedDescriptionBodyText");
        if (
          attrDesc &&
          typeof attrDesc === "object" &&
          "content" in attrDesc &&
          typeof (attrDesc as { content: unknown }).content === "string"
        ) {
          metadata.description = (attrDesc as { content: string }).content;
        }
      } catch {
        // ignore JSON parse errors
      }
      break;
    }

    const getMeta = (keys: string[]): string | null => {
      for (const key of keys) {
        if (metadata[key]) return metadata[key]!;
      }
      return null;
    };

    let markdown = "# YouTube\n";

    const title = getMeta(["title", "og:title", "name"]);
    if (title) markdown += `\n## ${title}\n`;

    let stats = "";
    const views = getMeta(["interactionCount"]);
    if (views) stats += `- **Views:** ${views}\n`;

    const keywords = getMeta(["keywords"]);
    if (keywords) stats += `- **Keywords:** ${keywords}\n`;

    const runtime = getMeta(["duration"]);
    if (runtime) stats += `- **Runtime:** ${runtime}\n`;

    if (stats) markdown += `\n### Video Metadata\n${stats}\n`;

    const description = getMeta(["description", "og:description"]);
    if (description) markdown += `\n### Description\n${description}\n`;

    const fetchTranscript = (options.fetchYouTubeTranscript ??
      (await getDefaultYouTubeTranscriptFetcher())) as
      | YouTubeTranscriptFetcher
      | null
      | undefined;

    if (fetchTranscript && streamInfo.url) {
      const videoId = new URL(streamInfo.url).searchParams.get("v");
      if (videoId) {
        const languages =
          (options.youtubeTranscriptLanguages as string[] | undefined) ?? [
            "en",
          ];
        try {
          const transcript = await fetchTranscript(videoId, languages);
          if (transcript) {
            markdown += `\n### Transcript\n${transcript}\n`;
          }
        } catch {
          // transcript unavailable
        }
      }
    }

    return new DocumentConverterResult(markdown.trim(), {
      title: title ?? pageTitle ?? null,
    });
  }
}
