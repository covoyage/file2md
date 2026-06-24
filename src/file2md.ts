import {
  DocumentConverter,
  DocumentConverterResult,
} from "./base-converter.js";
import type { ConvertOptions } from "./base-converter.js";
import {
  FailedConversionAttempt,
  FileConversionException,
  UnsupportedFormatException,
} from "./exceptions.js";
import { getStreamInfoGuesses, normalizeInput, setMagikaDetectionEnabled } from "./detection.js";
import { StreamInfo, type StreamInfoData } from "./stream-info.js";
import { AudioConverter } from "./converters/audio-converter.js";
import { BingSerpConverter } from "./converters/bing-serp-converter.js";
import {
  ContentUnderstandingConverter,
} from "./converters/content-understanding-converter.js";
import { CsvConverter } from "./converters/csv-converter.js";
import {
  DocumentIntelligenceConverter,
} from "./converters/doc-intel-converter.js";
import { DocxConverter } from "./converters/docx-converter.js";
import { EpubConverter } from "./converters/epub-converter.js";
import { HtmlConverter } from "./converters/html-converter.js";
import { ImageConverter } from "./converters/image-converter.js";
import { IpynbConverter } from "./converters/ipynb-converter.js";
import { OutlookMsgConverter } from "./converters/outlook-msg-converter.js";
import { PdfConverter } from "./converters/pdf-converter.js";
import { PlainTextConverter } from "./converters/plain-text-converter.js";
import { PptxConverter } from "./converters/pptx-converter.js";
import { RssConverter } from "./converters/rss-converter.js";
import { WikipediaConverter } from "./converters/wikipedia-converter.js";
import { XlsConverter, XlsxConverter } from "./converters/xlsx-converter.js";
import { YouTubeConverter } from "./converters/youtube-converter.js";
import { ZipConverter } from "./converters/zip-converter.js";
import { getRegisteredPlugins, ensureDiscoveredPlugins } from "./plugins.js";
import type {
  BinaryInput,
  ConvertLocalOptions,
  ConvertStreamOptions,
  ConvertUriOptions,
  FetchResponseLike,
  File2MDOptions,
} from "./types.js";
import {
  PRIORITY_GENERIC_FILE_FORMAT,
  PRIORITY_SPECIFIC_FILE_FORMAT,
} from "./types.js";
import {
  fileUriToPath,
  getBasename,
  getExtension,
  normalizeMarkdown,
  parseDataUri,
} from "./utils.js";

export interface ConverterRegistration {
  converter: DocumentConverter;
  priority: number;
}

const DEFAULT_ACCEPT_HEADER =
  "text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1";

export class File2MD {
  private readonly fetchImpl: typeof fetch;
  private readonly styleMap?: string;
  private readonly llmClient?: File2MDOptions["llmClient"];
  private readonly llmModel?: string;
  private readonly llmPrompt?: string;
  private readonly exiftoolPath?: string;
  private readonly fetchYouTubeTranscript?: File2MDOptions["fetchYouTubeTranscript"];
  private readonly youtubeTranscriptLanguages?: string[];
  private readonly transcribeAudio?: File2MDOptions["transcribeAudio"];
  private converters: ConverterRegistration[] = [];
  private builtinsEnabled = false;
  private pluginsEnabled = false;
  private pluginsLoadPromise: Promise<void> | null = null;
  private exiftoolPathResolved: string | undefined | null = null;
  private readonly initOptions: File2MDOptions;

  constructor(options: File2MDOptions = {}) {
    this.initOptions = options;
    this.fetchImpl = options.fetch ?? createFetchWithAcceptHeader();
    this.styleMap = options.styleMap;
    this.llmClient = options.llmClient;
    this.llmModel = options.llmModel;
    this.llmPrompt = options.llmPrompt;
    this.exiftoolPath = options.exiftoolPath;
    this.fetchYouTubeTranscript = options.fetchYouTubeTranscript;
    this.youtubeTranscriptLanguages = options.youtubeTranscriptLanguages;
    this.transcribeAudio = options.transcribeAudio;

    setMagikaDetectionEnabled(options.enableMagikaDetection !== false);

    if (options.enableBuiltins !== false) {
      this.enableBuiltins(options);
    }

    if (options.enablePlugins) {
      this.pluginsLoadPromise = this.enablePluginsAsync(options);
    }
  }

  enableBuiltins(options: File2MDOptions = this.initOptions): void {
    if (this.builtinsEnabled) return;

    this.registerConverter(new PlainTextConverter(), {
      priority: PRIORITY_GENERIC_FILE_FORMAT,
    });
    this.registerConverter(new ZipConverter(this), {
      priority: PRIORITY_GENERIC_FILE_FORMAT,
    });
    this.registerConverter(new HtmlConverter(), {
      priority: PRIORITY_GENERIC_FILE_FORMAT,
    });

    this.registerConverter(new RssConverter());
    this.registerConverter(new WikipediaConverter());
    this.registerConverter(new YouTubeConverter());
    this.registerConverter(new BingSerpConverter());
    this.registerConverter(new DocxConverter());
    this.registerConverter(new XlsxConverter());
    this.registerConverter(new XlsConverter());
    this.registerConverter(new PptxConverter());
    this.registerConverter(new AudioConverter());
    this.registerConverter(new ImageConverter());
    this.registerConverter(new IpynbConverter());
    this.registerConverter(new PdfConverter());
    this.registerConverter(new OutlookMsgConverter());
    this.registerConverter(new EpubConverter());
    this.registerConverter(new CsvConverter());

    if (options.docintelEndpoint) {
      this.registerConverter(
        new DocumentIntelligenceConverter({
          endpoint: options.docintelEndpoint,
          apiVersion: options.docintelApiVersion,
          credential: options.docintelCredential,
          credentialProvider: options.azureCredentialProvider,
          fileTypes: options.docintelFileTypes,
        }),
      );
    }

    if (options.cuEndpoint) {
      this.registerConverter(
        new ContentUnderstandingConverter({
          endpoint: options.cuEndpoint,
          credential: options.cuCredential,
          credentialProvider: options.azureCredentialProvider,
          analyzerId: options.cuAnalyzerId,
          fileTypes: options.cuFileTypes,
        }),
      );
    }

    this.builtinsEnabled = true;
  }

  enablePlugins(options: File2MDOptions = this.initOptions): void {
    this.pluginsLoadPromise ??= this.enablePluginsAsync(options);
  }

  async enablePluginsAsync(
    options: File2MDOptions = this.initOptions,
  ): Promise<void> {
    if (this.pluginsEnabled) return;

    const { errors } = await ensureDiscoveredPlugins();
    for (const message of errors) {
      console.warn(`[file2md] ${message}`);
    }

    for (const plugin of getRegisteredPlugins()) {
      try {
        plugin.registerConverters(this, options);
      } catch {
        // skip failing plugins
      }
    }

    this.pluginsEnabled = true;
  }

  private async ensureExiftoolPath(): Promise<string | undefined> {
    if (this.exiftoolPath) return this.exiftoolPath;
    if (this.exiftoolPathResolved !== null) {
      return this.exiftoolPathResolved ?? undefined;
    }

    if (typeof process !== "undefined" && process.versions?.node) {
      const { resolveExiftoolPath } = await import(
        "./utils/resolve-exiftool-node.js"
      );
      this.exiftoolPathResolved = resolveExiftoolPath() ?? undefined;
      return this.exiftoolPathResolved;
    }

    this.exiftoolPathResolved = undefined;
    return undefined;
  }

  private async ensurePluginsReady(): Promise<void> {
    if (this.pluginsLoadPromise) {
      await this.pluginsLoadPromise;
    }
  }

  /** @deprecated Use registerConverter instead */
  registerPageConverter(converter: DocumentConverter): void {
    this.registerConverter(converter);
  }

  registerConverter(
    converter: DocumentConverter,
    options: { priority?: number } = {},
  ): void {
    this.converters.unshift({
      converter,
      priority: options.priority ?? PRIORITY_SPECIFIC_FILE_FORMAT,
    });
  }

  async convert(
    source: string | BinaryInput | FetchResponseLike,
    options: ConvertStreamOptions = {},
  ): Promise<DocumentConverterResult> {
    if (typeof source === "string") {
      if (
        source.startsWith("http:") ||
        source.startsWith("https:") ||
        source.startsWith("file:") ||
        source.startsWith("data:")
      ) {
        return this.convertUri(source, options);
      }
      return this.convertLocal(source, options);
    }

    if (
      typeof source === "object" &&
      source !== null &&
      "headers" in source &&
      "arrayBuffer" in source &&
      typeof (source as FetchResponseLike).arrayBuffer === "function"
    ) {
      return this.convertResponse(source as FetchResponseLike, options);
    }

    return this.convertStream(source as BinaryInput, options);
  }

  async convertLocal(
    path: string,
    options: ConvertLocalOptions = {},
  ): Promise<DocumentConverterResult> {
    if (typeof process === "undefined" || !process.versions?.node) {
      throw new Error(
        "convertLocal() requires Node.js. In the browser, use convertStream() with file data from a File input.",
      );
    }

    const fs = await import("node:fs/promises");
    const data = await fs.readFile(path);
    const bytes = new Uint8Array(data);

    let baseGuess = new StreamInfo({
      localPath: path,
      extension: getExtension(path),
      filename: getBasename(path),
    });

    baseGuess = this.applyStreamInfoOptions(baseGuess, options);

    const guesses = await getStreamInfoGuesses(bytes, baseGuess);
    return this.convertInternal(bytes, guesses, options);
  }

  async convertStream(
    input: BinaryInput,
    options: ConvertStreamOptions = {},
  ): Promise<DocumentConverterResult> {
    const data = await normalizeInput(input);

    let baseGuess = toStreamInfo(options.streamInfo);

    if (options.fileExtension && !baseGuess.extension) {
      baseGuess = baseGuess.copyAndUpdate({ extension: options.fileExtension });
    }
    if (options.url) {
      baseGuess = baseGuess.copyAndUpdate({ url: options.url });
    }

    const guesses = await getStreamInfoGuesses(data, baseGuess);
    return this.convertInternal(data, guesses, options);
  }

  /** @deprecated Use convertUri instead */
  async convertUrl(
    url: string,
    options: ConvertUriOptions = {},
  ): Promise<DocumentConverterResult> {
    return this.convertUri(url, options);
  }

  async convertUri(
    uri: string,
    options: ConvertUriOptions = {},
  ): Promise<DocumentConverterResult> {
    const trimmed = uri.trim();

    if (trimmed.startsWith("file:")) {
      const path = fileUriToPath(trimmed);
      return this.convertLocal(path, {
        ...options,
        url: options.mockUrl ?? options.url,
      });
    }

    if (trimmed.startsWith("data:")) {
      const { mimetype, charset, data } = parseDataUri(trimmed);
      let streamInfo = new StreamInfo({ mimetype, charset });
      if (options.streamInfo) {
        streamInfo = streamInfo.copyAndUpdate({
          mimetype: options.streamInfo.mimetype ?? mimetype,
          charset: options.streamInfo.charset ?? charset,
          extension: options.streamInfo.extension,
          filename: options.streamInfo.filename,
          url: options.streamInfo.url ?? options.mockUrl ?? options.url,
        });
      }
      return this.convertStream(data, { ...options, streamInfo });
    }

    if (trimmed.startsWith("http:") || trimmed.startsWith("https:")) {
      const response = await this.fetchImpl(trimmed);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return this.convertResponse(response, {
        ...options,
        url: options.mockUrl ?? options.url ?? trimmed,
      });
    }

    throw new Error(
      `Unsupported URI scheme. Supported: file:, data:, http:, https:`,
    );
  }

  async convertResponse(
    response: FetchResponseLike,
    options: ConvertStreamOptions = {},
  ): Promise<DocumentConverterResult> {
    let mimetype: string | null = null;
    let charset: string | null = null;

    const contentType = response.headers.get("content-type");
    if (contentType) {
      const parts = contentType.split(";");
      mimetype = parts[0]?.trim() ?? null;
      for (const part of parts.slice(1)) {
        const trimmed = part.trim();
        if (trimmed.startsWith("charset=")) {
          charset = trimmed.slice("charset=".length).trim();
        }
      }
    }

    let filename: string | null = null;
    let extension: string | null = null;

    const disposition = response.headers.get("content-disposition");
    if (disposition) {
      const match = /filename=([^;]+)/i.exec(disposition);
      if (match?.[1]) {
        filename = match[1].trim().replace(/^["']|["']$/g, "");
        extension = getExtension(filename);
      }
    }

    if (!filename) {
      try {
        const parsed = new URL(response.url);
        extension = getExtension(parsed.pathname);
        if (extension) {
          filename = getBasename(parsed.pathname);
        }
      } catch {
        // ignore invalid URL
      }
    }

    let baseGuess = new StreamInfo({
      mimetype,
      charset,
      filename,
      extension,
      url: options.url ?? response.url,
    });

    baseGuess = this.applyStreamInfoOptions(baseGuess, options);

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const guesses = await getStreamInfoGuesses(data, baseGuess);
    return this.convertInternal(data, guesses, options);
  }

  private applyStreamInfoOptions(
    base: StreamInfo,
    options: ConvertLocalOptions,
  ): StreamInfo {
    let result = base;
    if (options.streamInfo) {
      result = result.copyAndUpdate({
        mimetype: options.streamInfo.mimetype ?? undefined,
        extension: options.streamInfo.extension ?? undefined,
        charset: options.streamInfo.charset ?? undefined,
        filename: options.streamInfo.filename ?? undefined,
        localPath: options.streamInfo.localPath ?? undefined,
        url: options.streamInfo.url ?? undefined,
      });
    }
    if (options.fileExtension && !result.extension) {
      result = result.copyAndUpdate({ extension: options.fileExtension });
    }
    if (options.url) {
      result = result.copyAndUpdate({ url: options.url });
    }
    return result;
  }

  private async convertInternal(
    data: Uint8Array,
    streamInfoGuesses: StreamInfo[],
    options: ConvertOptions,
  ): Promise<DocumentConverterResult> {
    await this.ensurePluginsReady();

    const resolvedExiftoolPath = await this.ensureExiftoolPath();

    const failedAttempts: FailedConversionAttempt[] = [];
    const sorted = [...this.converters].sort((a, b) => a.priority - b.priority);

    const globalOptions: ConvertOptions = { ...options };

    if (this.styleMap && globalOptions.styleMap === undefined) {
      globalOptions.styleMap = this.styleMap;
    }
    if (this.llmClient && globalOptions.llmClient === undefined) {
      globalOptions.llmClient = this.llmClient;
    }
    if (this.llmModel && globalOptions.llmModel === undefined) {
      globalOptions.llmModel = this.llmModel;
    }
    if (this.llmPrompt && globalOptions.llmPrompt === undefined) {
      globalOptions.llmPrompt = this.llmPrompt;
    }
    if (this.exiftoolPath && globalOptions.exiftoolPath === undefined) {
      globalOptions.exiftoolPath = this.exiftoolPath;
    } else if (
      resolvedExiftoolPath &&
      globalOptions.exiftoolPath === undefined
    ) {
      globalOptions.exiftoolPath = resolvedExiftoolPath;
    }
    if (
      this.fetchYouTubeTranscript &&
      globalOptions.fetchYouTubeTranscript === undefined
    ) {
      globalOptions.fetchYouTubeTranscript = this.fetchYouTubeTranscript;
    }
    if (
      this.youtubeTranscriptLanguages &&
      globalOptions.youtubeTranscriptLanguages === undefined
    ) {
      globalOptions.youtubeTranscriptLanguages =
        this.youtubeTranscriptLanguages;
    }
    if (this.transcribeAudio && globalOptions.transcribeAudio === undefined) {
      globalOptions.transcribeAudio = this.transcribeAudio;
    }

    for (const streamInfo of [...streamInfoGuesses, new StreamInfo()]) {
      for (const { converter } of sorted) {
        const converterOptions: ConvertOptions = { ...globalOptions };

        if (streamInfo.extension) {
          converterOptions.fileExtension = streamInfo.extension;
        }
        if (streamInfo.url) {
          converterOptions.url = streamInfo.url;
        }

        let accepts = false;
        try {
          accepts = await converter.accepts(data, streamInfo, converterOptions);
        } catch {
          accepts = false;
        }

        if (!accepts) continue;

        try {
          const result = await converter.convert(
            data,
            streamInfo,
            converterOptions,
          );
          if (result) {
            const markdown = normalizeMarkdown(result.markdown).replace(
              /(\(#footnote-ref-\d+\))\n{2,}(\s*\d+\.)/g,
              "$1\n$2",
            );
            return new DocumentConverterResult(markdown, {
              title: result.title,
            });
          }
        } catch (error) {
          failedAttempts.push(new FailedConversionAttempt(converter, error));
        }
      }
    }

    if (failedAttempts.length > 0) {
      throw new FileConversionException(undefined, failedAttempts);
    }

    throw new UnsupportedFormatException(
      "Could not convert stream to Markdown. No converter attempted a conversion, suggesting that the filetype is simply not supported.",
    );
  }
}

export {
  PRIORITY_GENERIC_FILE_FORMAT,
  PRIORITY_SPECIFIC_FILE_FORMAT,
};

function toStreamInfo(value?: StreamInfo | StreamInfoData | null): StreamInfo {
  if (!value) return new StreamInfo();
  if (value instanceof StreamInfo) return value;
  return new StreamInfo(value);
}

function createFetchWithAcceptHeader(): typeof fetch {
  const baseFetch = globalThis.fetch.bind(globalThis);
  return (input, init) =>
    baseFetch(input, {
      ...init,
      headers: {
        Accept: DEFAULT_ACCEPT_HEADER,
        ...(init?.headers ?? {}),
      },
    });
}
