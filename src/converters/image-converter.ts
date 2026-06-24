import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import { exiftoolMetadata } from "../utils/exiftool.js";
import { llmCaption, type LlmClient } from "../utils/llm-caption.js";

const ACCEPTED_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

const METADATA_FIELDS = [
  "ImageSize",
  "Title",
  "Caption",
  "Description",
  "Keywords",
  "Artist",
  "Author",
  "DateTimeOriginal",
  "CreateDate",
  "GPSPosition",
];

export class ImageConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_EXTENSIONS.includes(extension)) return true;
    return ACCEPTED_MIMES.some((p) => mimetype.startsWith(p));
  }

  async convert(
    data: Uint8Array,
    streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    let md = "";

    try {
      const metadata = await exiftoolMetadata(
        data,
        options.exiftoolPath as string | undefined,
      );
      if (metadata) {
        for (const field of METADATA_FIELDS) {
          if (metadata[field]) {
            md += `${field}: ${metadata[field]}\n`;
          }
        }
      }
    } catch {
      // exiftool unavailable or failed
    }

    const llmClient = options.llmClient as LlmClient | undefined;
    const llmModel = options.llmModel as string | undefined;

    if (llmClient && llmModel) {
      const description = await llmCaption(data, streamInfo, {
        client: llmClient,
        model: llmModel,
        prompt: options.llmPrompt as string | undefined,
      });

      if (description) {
        md += `\n# Description:\n${description.trim()}\n`;
      }
    }

    return new DocumentConverterResult(md.trim());
  }
}
