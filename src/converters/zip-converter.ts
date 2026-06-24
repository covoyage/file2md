import JSZip from "jszip";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { ConvertOptions } from "../base-converter.js";
import {
  FileConversionException,
  UnsupportedFormatException,
} from "../exceptions.js";
import { StreamInfo } from "../stream-info.js";
import { getExtension, getBasename } from "../utils.js";

export interface File2MDLike {
  convertStream(
    input: Uint8Array,
    options?: ConvertOptions,
  ): Promise<DocumentConverterResult>;
}

const ACCEPTED_MIME_TYPE_PREFIXES = ["application/zip"];
const ACCEPTED_FILE_EXTENSIONS = [".zip"];

export class ZipConverter extends DocumentConverter {
  constructor(private readonly file2md: File2MDLike) {
    super();
  }

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
    streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    const archiveLabel =
      streamInfo.url ?? streamInfo.localPath ?? streamInfo.filename ?? "archive.zip";

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(data);
    } catch (error) {
      throw new FileConversionException(
        `Failed to read ZIP archive: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const parts: string[] = [
      `Content from the zip file \`${archiveLabel}\`:\n`,
    ];

    const entries = Object.entries(zip.files).filter(
      ([, entry]) => !entry.dir,
    );
    entries.sort(([a], [b]) => a.localeCompare(b));

    const {
      fileExtension: _parentExt,
      streamInfo: _parentStream,
      ...nestedOptions
    } = options;

    for (const [path, entry] of entries) {
      const fileData = await entry.async("uint8array");
      const extension = getExtension(path);

      try {
        const result = await this.file2md.convertStream(fileData, {
          ...nestedOptions,
          streamInfo: new StreamInfo({
            extension,
            filename: getBasename(path),
          }),
        });

        parts.push(`## File: ${path}\n`);
        parts.push(result.markdown.trim());
        parts.push("");
      } catch (error) {
        if (
          error instanceof UnsupportedFormatException ||
          error instanceof FileConversionException
        ) {
          // Skip unsupported archive entries silently.
          continue;
        }
        throw error;
      }
    }

    return new DocumentConverterResult(parts.join("\n").trim());
  }
}
