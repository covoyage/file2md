import type { AzureCredentialProvider } from "./utils/azure-auth.js";
import type { StreamInfo, StreamInfoData } from "./stream-info.js";
import type { LlmClient } from "./utils/llm-caption.js";
import type { TranscribeAudioFn } from "./utils/transcribe-audio.js";
import type { ContentUnderstandingFileType } from "./converters/content-understanding-converter.js";
import type { DocumentIntelligenceFileType } from "./converters/doc-intel-converter.js";

export type { AzureCredentialProvider } from "./utils/azure-auth.js";
export type { ContentUnderstandingFileType, DocumentIntelligenceFileType };

export type YouTubeTranscriptFetcher = (
  videoId: string,
  languages?: string[],
) => Promise<string | null>;

export type BinaryInput = Uint8Array | ArrayBuffer | Blob;

export interface SeekableStream {
  read(): Promise<Uint8Array | null>;
  seek(position: number): Promise<void>;
  tell(): Promise<number>;
}

export interface FetchResponseLike {
  url: string;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface File2MDOptions {
  /** Custom fetch implementation (browser or Node 18+). */
  fetch?: typeof fetch;
  /** Enable built-in converters. Default: true */
  enableBuiltins?: boolean;
  /** Enable registered plugins. Default: false */
  enablePlugins?: boolean;
  /** Style map for mammoth DOCX conversion */
  styleMap?: string;
  /** Enable Magika ML file type detection. Default: true (with timeout fallback) */
  enableMagikaDetection?: boolean;
  /** OpenAI-compatible client for image descriptions */
  llmClient?: LlmClient;
  /** Model name for LLM image descriptions */
  llmModel?: string;
  /** Prompt for LLM image descriptions */
  llmPrompt?: string;
  /** Path to exiftool binary for image/audio metadata (Node.js only) */
  exiftoolPath?: string;
  /** Optional YouTube transcript fetcher (uses youtube-transcript-plus when installed) */
  fetchYouTubeTranscript?: YouTubeTranscriptFetcher;
  /** Preferred languages for YouTube transcripts */
  youtubeTranscriptLanguages?: string[];
  /** Optional audio transcription implementation */
  transcribeAudio?: TranscribeAudioFn;
  /**
   * Custom Azure auth headers provider (Bearer token).
   * Used when docintelCredential/cuCredential and AZURE_API_KEY are unset.
   */
  azureCredentialProvider?: AzureCredentialProvider;
  /** Azure Document Intelligence endpoint */
  docintelEndpoint?: string;
  docintelCredential?: string;
  docintelApiVersion?: string;
  docintelFileTypes?: DocumentIntelligenceFileType[];
  /** Azure Content Understanding endpoint */
  cuEndpoint?: string;
  cuCredential?: string;
  cuAnalyzerId?: string;
  cuFileTypes?: ContentUnderstandingFileType[];
}

export interface ConvertLocalOptions {
  streamInfo?: StreamInfo | StreamInfoData;
  /** @deprecated Use streamInfo.extension */
  fileExtension?: string;
  /** @deprecated Use streamInfo.url */
  url?: string;
  /** Truncate data: URI images unless true */
  keepDataUris?: boolean;
  [key: string]: unknown;
}

export interface ConvertStreamOptions extends ConvertLocalOptions {}

export interface ConvertUriOptions extends ConvertLocalOptions {
  /** Mock URL for nested conversions */
  mockUrl?: string;
}

export const PRIORITY_SPECIFIC_FILE_FORMAT = 0.0;
export const PRIORITY_GENERIC_FILE_FORMAT = 10.0;
