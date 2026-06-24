import type { AzureAuthOptions } from "../utils/azure-auth.js";
import { assertAzureAuthAvailable } from "../utils/azure-auth.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import type { StreamInfo } from "../stream-info.js";

export enum DocumentIntelligenceFileType {
  DOCX = "docx",
  PPTX = "pptx",
  XLSX = "xlsx",
  HTML = "html",
  PDF = "pdf",
  JPEG = "jpeg",
  PNG = "png",
  BMP = "bmp",
  TIFF = "tiff",
}

const EXTENSION_MAP: Record<DocumentIntelligenceFileType, string[]> = {
  [DocumentIntelligenceFileType.DOCX]: [".docx"],
  [DocumentIntelligenceFileType.PPTX]: [".pptx"],
  [DocumentIntelligenceFileType.XLSX]: [".xlsx"],
  [DocumentIntelligenceFileType.HTML]: [".html", ".htm"],
  [DocumentIntelligenceFileType.PDF]: [".pdf"],
  [DocumentIntelligenceFileType.JPEG]: [".jpg", ".jpeg"],
  [DocumentIntelligenceFileType.PNG]: [".png"],
  [DocumentIntelligenceFileType.BMP]: [".bmp"],
  [DocumentIntelligenceFileType.TIFF]: [".tif", ".tiff"],
};

const MIME_MAP: Record<DocumentIntelligenceFileType, string[]> = {
  [DocumentIntelligenceFileType.DOCX]: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [DocumentIntelligenceFileType.PPTX]: [
    "application/vnd.openxmlformats-officedocument.presentationml",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  [DocumentIntelligenceFileType.XLSX]: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  [DocumentIntelligenceFileType.HTML]: ["text/html", "application/xhtml"],
  [DocumentIntelligenceFileType.PDF]: ["application/pdf", "application/x-pdf"],
  [DocumentIntelligenceFileType.JPEG]: ["image/jpeg"],
  [DocumentIntelligenceFileType.PNG]: ["image/png"],
  [DocumentIntelligenceFileType.BMP]: ["image/bmp"],
  [DocumentIntelligenceFileType.TIFF]: ["image/tiff"],
};

const OFFICE_TYPES = new Set([
  DocumentIntelligenceFileType.DOCX,
  DocumentIntelligenceFileType.PPTX,
  DocumentIntelligenceFileType.XLSX,
  DocumentIntelligenceFileType.HTML,
]);

export interface DocumentIntelligenceOptions extends AzureAuthOptions {
  endpoint: string;
  apiVersion?: string;
  fileTypes?: DocumentIntelligenceFileType[];
}

export class DocumentIntelligenceConverter extends DocumentConverter {
  private readonly endpoint: string;
  private readonly apiVersion: string;
  private readonly authOptions: AzureAuthOptions;
  private readonly fileTypes: DocumentIntelligenceFileType[];

  constructor(options: DocumentIntelligenceOptions) {
    super();
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.apiVersion = options.apiVersion ?? "2024-07-31-preview";
    this.authOptions = {
      credential: options.credential,
      credentialProvider: options.credentialProvider,
    };
    this.fileTypes = options.fileTypes ?? Object.values(DocumentIntelligenceFileType);
  }

  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const extension = (streamInfo.extension ?? "").toLowerCase();
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();

    for (const fileType of this.fileTypes) {
      if (EXTENSION_MAP[fileType]?.includes(extension)) return true;
      if (MIME_MAP[fileType]?.some((prefix) => mimetype.startsWith(prefix))) {
        return true;
      }
    }
    return false;
  }

  async convert(data: Uint8Array, streamInfo: StreamInfo): Promise<DocumentConverterResult> {
    const features = this.analysisFeatures(streamInfo);
    const query = new URLSearchParams({ "api-version": this.apiVersion });
    if (features.length > 0) {
      for (const feature of features) {
        query.append("features", feature);
      }
    }
    query.set("outputContentFormat", "markdown");

    const analyzeUrl =
      `${this.endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?${query}`;

    const authHeaders = await assertAzureAuthAvailable(
      this.authOptions,
      "DocumentIntelligenceConverter",
    );

    const startResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        base64Source: uint8ArrayToBase64(data),
      }),
    });

    if (!startResponse.ok) {
      throw new Error(
        `Document Intelligence analyze failed: HTTP ${startResponse.status}`,
      );
    }

    const operationLocation = startResponse.headers.get("operation-location");
    if (!operationLocation) {
      throw new Error("Document Intelligence response missing operation-location.");
    }

    const result = await pollOperation(operationLocation, authHeaders);
    const content = result?.analyzeResult?.content ?? result?.content ?? "";
    const markdown = String(content).replace(/<!--.*?-->/gs, "");

    return new DocumentConverterResult(markdown.trim());
  }

  private analysisFeatures(streamInfo: StreamInfo): string[] {
    const extension = (streamInfo.extension ?? "").toLowerCase();
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();

    for (const fileType of OFFICE_TYPES) {
      if (!this.fileTypes.includes(fileType)) continue;
      if (EXTENSION_MAP[fileType]?.includes(extension)) return [];
      if (MIME_MAP[fileType]?.some((prefix) => mimetype.startsWith(prefix))) {
        return [];
      }
    }

    return ["ocrHighResolution", "styleFont", "formulas"];
  }
}

async function pollOperation(
  operationLocation: string,
  authHeaders: Record<string, string>,
): Promise<{ analyzeResult?: { content?: string }; content?: string }> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(operationLocation, {
      headers: authHeaders,
    });
    if (!response.ok) {
      throw new Error(`Document Intelligence poll failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      analyzeResult?: { content?: string };
      content?: string;
    };

    if (payload.status === "succeeded") return payload;
    if (payload.status === "failed") {
      throw new Error("Document Intelligence analysis failed.");
    }

    await sleep(1000);
  }

  throw new Error("Document Intelligence analysis timed out.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uint8ArrayToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}
