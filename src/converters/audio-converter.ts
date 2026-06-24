import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import { MissingDependencyException } from "../exceptions.js";
import type { StreamInfo } from "../stream-info.js";
import { exiftoolMetadata } from "../utils/exiftool.js";
import {
  detectAudioFormat,
  transcribeAudio,
  type TranscribeAudioFn,
} from "../utils/transcribe-audio.js";

const ACCEPTED_MIMES = ["audio/x-wav", "audio/wav", "audio/mpeg", "video/mp4", "audio/mp4"];
const ACCEPTED_EXTENSIONS = [".wav", ".mp3", ".m4a", ".mp4"];

const METADATA_FIELDS = [
  "Title",
  "Artist",
  "Author",
  "Band",
  "Album",
  "Genre",
  "Track",
  "DateTimeOriginal",
  "CreateDate",
  "NumChannels",
  "SampleRate",
  "AvgBytesPerSec",
  "BitsPerSample",
];

export class AudioConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_EXTENSIONS.includes(extension)) return true;
    return ACCEPTED_MIMES.some((prefix) => mimetype.startsWith(prefix));
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

    const audioFormat = detectAudioFormat(
      streamInfo.extension,
      streamInfo.mimetype,
    );

    if (audioFormat) {
      try {
        const transcribeFn = options.transcribeAudio as TranscribeAudioFn | undefined;
        const transcript = await transcribeAudio(data, audioFormat, transcribeFn);
        if (transcript) {
          md += "\n\n### Audio Transcript:\n" + transcript;
        }
      } catch (error) {
        if (!(error instanceof MissingDependencyException)) {
          throw error;
        }
      }
    }

    return new DocumentConverterResult(md.trim());
  }
}
