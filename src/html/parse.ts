import { parseHTML } from "linkedom";

/**
 * linkedom mis-parses HTML fragments that start with block tags (e.g. mammoth
 * docx output). Wrap bare fragments in a document shell before parsing.
 */
export function normalizeHtmlForParsing(html: string): string {
  const trimmed = html.trimStart();
  if (/^<!DOCTYPE\b/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return html;
  }
  return `<!DOCTYPE html><html><head></head><body>${html}</body></html>`;
}

export function parseHtmlDocument(html: string): Document {
  const normalized = normalizeHtmlForParsing(html);

  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(normalized, "text/html");
  }

  const { document } = parseHTML(normalized);
  return document as unknown as Document;
}
