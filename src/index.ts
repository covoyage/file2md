export { File2MD, PRIORITY_GENERIC_FILE_FORMAT, PRIORITY_SPECIFIC_FILE_FORMAT } from "./file2md.js";
export type { ConverterRegistration } from "./file2md.js";

export {
  DocumentConverter,
  DocumentConverterResult,
} from "./base-converter.js";
export type { ConvertOptions } from "./base-converter.js";

export { StreamInfo } from "./stream-info.js";
export type { StreamInfoData } from "./stream-info.js";

export {
  File2MDException,
  MissingDependencyException,
  UnsupportedFormatException,
  FileConversionException,
  FailedConversionAttempt,
  MISSING_DEPENDENCY_MESSAGE,
} from "./exceptions.js";

export type {
  BinaryInput,
  File2MDOptions,
  ConvertLocalOptions,
  ConvertStreamOptions,
  ConvertUriOptions,
  FetchResponseLike,
  YouTubeTranscriptFetcher,
  AzureCredentialProvider,
} from "./types.js";

export type { LlmClient } from "./utils/llm-caption.js";
export { llmCaption } from "./utils/llm-caption.js";
export type { TranscribeAudioFn } from "./utils/transcribe-audio.js";

export {
  registerPlugin,
  getRegisteredPlugins,
  clearRegisteredPlugins,
  ensureDiscoveredPlugins,
  PLUGIN_INTERFACE_VERSION,
} from "./plugins.js";
export type { File2MDPlugin } from "./plugins.js";
export type {
  DiscoveredPluginEntry,
  LoadedDiscoveredPlugin,
} from "./plugin-discovery-node.js";

export { PlainTextConverter } from "./converters/plain-text-converter.js";
export { HtmlConverter } from "./converters/html-converter.js";
export { CsvConverter } from "./converters/csv-converter.js";
export { IpynbConverter } from "./converters/ipynb-converter.js";
export { DocxConverter } from "./converters/docx-converter.js";
export { PdfConverter } from "./converters/pdf-converter.js";
export { XlsxConverter, XlsConverter } from "./converters/xlsx-converter.js";
export { ZipConverter } from "./converters/zip-converter.js";
export { RssConverter } from "./converters/rss-converter.js";
export { WikipediaConverter } from "./converters/wikipedia-converter.js";
export { BingSerpConverter } from "./converters/bing-serp-converter.js";
export { YouTubeConverter } from "./converters/youtube-converter.js";
export { EpubConverter } from "./converters/epub-converter.js";
export { ImageConverter } from "./converters/image-converter.js";
export { PptxConverter } from "./converters/pptx-converter.js";
export { AudioConverter } from "./converters/audio-converter.js";
export { OutlookMsgConverter } from "./converters/outlook-msg-converter.js";
export {
  DocumentIntelligenceConverter,
  DocumentIntelligenceFileType,
} from "./converters/doc-intel-converter.js";
export {
  ContentUnderstandingConverter,
  ContentUnderstandingFileType,
} from "./converters/content-understanding-converter.js";

export {
  cuResultToLlmInput,
  formatCuResultForLlm,
  setCuToLlmInputFormatter,
} from "./utils/cu-to-llm-input.js";
export {
  resolveAzureAuthHeaders,
  setDefaultAzureCredentialProvider,
} from "./utils/azure-auth.js";

export {
  detectTextCharset,
  detectTextCharsetAsync,
} from "./utils/charset.js";
export { decodeText } from "./utils.js";
export { htmlToMarkdown } from "./html/markdownify.js";
export type { MarkdownifyOptions } from "./html/markdownify.js";
export {
  getPdfDocumentOptions,
  getPdfJsNodeAssetUrls,
  loadPdfJs,
} from "./utils/pdfjs-node.js";
export type { PdfJsModule, PdfJsNodeAssetUrls } from "./utils/pdfjs-node.js";
export { preProcessDocx } from "./converter-utils/docx/pre-process.js";

export const VERSION = "1.0.2";
