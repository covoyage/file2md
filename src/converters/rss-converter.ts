import { parseHtmlDocument } from "../html/parse.js";
import { htmlToMarkdown } from "../html/markdownify.js";
import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import { decodeText } from "../utils.js";
import {
  detectFeedType,
  getFirstTextByTagName,
  parseXmlDocument,
} from "../utils/xml.js";

const PRECISE_MIMES = [
  "application/rss",
  "application/rss+xml",
  "application/atom",
  "application/atom+xml",
];
const PRECISE_EXTENSIONS = [".rss", ".atom"];
const CANDIDATE_MIMES = ["text/xml", "application/xml"];
const CANDIDATE_EXTENSIONS = [".xml"];

export class RssConverter extends DocumentConverter {
  accepts(data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (PRECISE_EXTENSIONS.includes(extension)) return true;
    if (PRECISE_MIMES.some((p) => mimetype.startsWith(p))) return true;

    if (
      CANDIDATE_EXTENSIONS.includes(extension) ||
      CANDIDATE_MIMES.some((p) => mimetype.startsWith(p))
    ) {
      const text = decodeText(data, streamInfo.charset ?? "utf-8");
      try {
        const doc = parseXmlDocument(text);
        return detectFeedType(doc) !== null;
      } catch {
        return false;
      }
    }

    return false;
  }

  convert(
    data: Uint8Array,
    streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): DocumentConverterResult {
    const text = decodeText(data, streamInfo.charset ?? "utf-8");
    const doc = parseXmlDocument(text);
    const feedType = detectFeedType(doc);

    if (feedType === "rss") return this.parseRss(doc, options);
    if (feedType === "atom") return this.parseAtom(doc, options);

    throw new Error("Unknown feed type");
  }

  private parseContent(content: string, options: ConvertOptions): string {
    try {
      const decoded = decodeBasicHtmlEntities(content.trim());
      const html = decoded.includes("<")
        ? decoded
        : `<p>${decoded}</p>`;
      const doc = parseHtmlDocument(html);
      return htmlToMarkdown(doc.body ?? doc.documentElement, options);
    } catch {
      return content;
    }
  }

  private parseAtom(
    doc: Document,
    options: ConvertOptions,
  ): DocumentConverterResult {
    const feed = doc.getElementsByTagName("feed")[0];
    if (!feed) throw new Error("Invalid Atom feed");

    const title = getFirstTextByTagName(feed, "title");
    const subtitle = getFirstTextByTagName(feed, "subtitle");

    let md = title ? `# ${title}\n` : "";
    if (subtitle) md += `${subtitle}\n`;

    for (const entry of Array.from(feed.getElementsByTagName("entry"))) {
      const entryTitle = getFirstTextByTagName(entry, "title");
      const entrySummary = getFirstTextByTagName(entry, "summary");
      const entryUpdated = getFirstTextByTagName(entry, "updated");
      const entryContent = getFirstTextByTagName(entry, "content");

      if (entryTitle) md += `\n## ${entryTitle}\n`;
      if (entryUpdated) md += `Updated on: ${entryUpdated}\n`;
      if (entrySummary) md += this.parseContent(entrySummary, options);
      if (entryContent) md += this.parseContent(entryContent, options);
    }

    return new DocumentConverterResult(md.trim(), { title });
  }

  private parseRss(
    doc: Document,
    options: ConvertOptions,
  ): DocumentConverterResult {
    const rss = doc.getElementsByTagName("rss")[0];
    const channel = rss?.getElementsByTagName("channel")[0];
    if (!channel) throw new Error("No channel found in RSS feed");

    const channelTitle = getFirstTextByTagName(channel, "title");
    const channelDescription = getFirstTextByTagName(channel, "description");

    let md = channelTitle ? `# ${channelTitle}\n` : "";
    if (channelDescription) md += `${channelDescription}\n`;

    for (const item of Array.from(channel.getElementsByTagName("item"))) {
      const title = getFirstTextByTagName(item, "title");
      const description = getFirstTextByTagName(item, "description");
      const pubDate = getFirstTextByTagName(item, "pubDate");
      const content =
        getFirstTextByTagName(item, "content:encoded") ??
        getFirstTextByTagName(item, "encoded");

      if (title) md += `\n## ${title}\n`;
      if (pubDate) md += `Published on: ${pubDate}\n`;
      if (description) md += this.parseContent(description, options);
      if (content) md += this.parseContent(content, options);
    }

    return new DocumentConverterResult(md.trim(), { title: channelTitle });
  }
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
