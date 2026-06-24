import type { AzureAuthOptions } from "../utils/azure-auth.js";
import { formatCuResultForLlm } from "../utils/cu-to-llm-input.js";
import { analyzeWithContentUnderstanding, fetchAnalyzerInfo } from "../utils/cu-analyze.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";
import {
  modalityFromBaseAnalyzerId,
  resolveAnalyzerModalityFromCache,
  selectAnalyzerId,
} from "../converter-utils/cu/analyzer-routing.js";
import type { CuModality } from "../converter-utils/cu/file-types.js";
import {
  ContentUnderstandingFileType,
  contentTypeFor,
  detectCuFileType,
} from "../converter-utils/cu/file-types.js";

export { ContentUnderstandingFileType } from "../converter-utils/cu/file-types.js";

export interface ContentUnderstandingOptions extends AzureAuthOptions {
  endpoint: string;
  analyzerId?: string;
  fileTypes?: ContentUnderstandingFileType[];
}

export class ContentUnderstandingConverter extends DocumentConverter {
  private readonly endpoint: string;
  private readonly authOptions: AzureAuthOptions;
  private readonly analyzerId?: string;
  private readonly fileTypes: ContentUnderstandingFileType[];
  private analyzerModality: CuModality | null | undefined;

  constructor(options: ContentUnderstandingOptions) {
    super();
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.authOptions = {
      credential: options.credential,
      credentialProvider: options.credentialProvider,
    };
    this.analyzerId = options.analyzerId;
    this.fileTypes =
      options.fileTypes ?? Object.values(ContentUnderstandingFileType);
    this.analyzerModality = undefined;
  }

  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    return detectCuFileType(streamInfo, this.fileTypes) !== null;
  }

  async convert(
    data: Uint8Array,
    streamInfo: StreamInfo,
  ): Promise<DocumentConverterResult> {
    const fileType = detectCuFileType(streamInfo, this.fileTypes);
    if (!fileType) {
      throw new Error(
        "Unsupported file type for Content Understanding conversion.",
      );
    }

    if (this.analyzerId && this.analyzerModality === undefined) {
      const cached = resolveAnalyzerModalityFromCache(this.analyzerId);
      if (cached) {
        this.analyzerModality = cached;
      } else {
        const info = await fetchAnalyzerInfo(
          this.endpoint,
          this.analyzerId,
          this.authOptions,
        );
        this.analyzerModality = modalityFromBaseAnalyzerId(info.baseAnalyzerId);
      }
    }

    const analyzerId = selectAnalyzerId(fileType, {
      customAnalyzerId: this.analyzerId,
      customAnalyzerModality: this.analyzerModality ?? null,
    });

    const contentType = contentTypeFor(fileType, streamInfo.mimetype);
    const result = await analyzeWithContentUnderstanding({
      endpoint: this.endpoint,
      analyzerId,
      data,
      contentType,
      authOptions: this.authOptions,
    });
    const markdown = await formatCuResultForLlm(result);

    return new DocumentConverterResult(markdown.trim());
  }
}
