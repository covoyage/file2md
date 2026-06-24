import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import { decodeText } from "../utils.js";

const ACCEPTED_MIME_TYPE_PREFIXES = [
  "text/",
  "application/json",
  "application/markdown",
];

const ACCEPTED_FILE_EXTENSIONS = [
  ".txt",
  ".text",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
];

export class PlainTextConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    if (streamInfo.charset) return true;

    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_FILE_EXTENSIONS.includes(extension)) return true;

    return ACCEPTED_MIME_TYPE_PREFIXES.some((prefix) =>
      mimetype.startsWith(prefix),
    );
  }

  convert(data: Uint8Array, streamInfo: StreamInfo): DocumentConverterResult {
    const text = decodeText(data, streamInfo.charset);
    return new DocumentConverterResult(text);
  }
}
