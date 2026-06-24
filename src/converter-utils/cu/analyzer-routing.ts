import type { CuModality } from "./file-types.js";
import { getCuModality } from "./file-types.js";
import type { ContentUnderstandingFileType } from "./file-types.js";

export const PREBUILT_ANALYZERS: Record<CuModality, string> = {
  document: "prebuilt-documentSearch",
  image: "prebuilt-documentSearch",
  video: "prebuilt-videoSearch",
  audio: "prebuilt-audioSearch",
};

const BASE_TO_MODALITY: Record<string, CuModality> = {
  "prebuilt-document": "document",
  "prebuilt-image": "image",
  "prebuilt-audio": "audio",
  "prebuilt-video": "video",
};

export const KNOWN_PREBUILT_MODALITY: Record<string, CuModality> = {
  "prebuilt-documentSearch": "document",
  "prebuilt-layout": "document",
  "prebuilt-read": "document",
  "prebuilt-document": "document",
  "prebuilt-invoice": "document",
  "prebuilt-receipt": "document",
  "prebuilt-receipt.generic": "document",
  "prebuilt-receipt.hotel": "document",
  "prebuilt-idDocument": "document",
  "prebuilt-idDocument.generic": "document",
  "prebuilt-idDocument.passport": "document",
  "prebuilt-healthInsuranceCard.us": "document",
  "prebuilt-contract": "document",
  "prebuilt-creditCard": "document",
  "prebuilt-creditMemo": "document",
  "prebuilt-bankStatement.us": "document",
  "prebuilt-check.us": "document",
  "prebuilt-purchaseOrder": "document",
  "prebuilt-procurement": "document",
  "prebuilt-payStub.us": "document",
  "prebuilt-utilityBill": "document",
  "prebuilt-marriageCertificate.us": "document",
  "prebuilt-documentFieldSchema": "document",
  "prebuilt-documentFields": "document",
  "prebuilt-tax.us": "document",
  "prebuilt-tax.us.w2": "document",
  "prebuilt-tax.us.w4": "document",
  "prebuilt-tax.us.1040": "document",
  "prebuilt-mortgage.us": "document",
  "prebuilt-mortgage.us.1003": "document",
  "prebuilt-mortgage.us.closingDisclosure": "document",
  "prebuilt-image": "image",
  "prebuilt-imageSearch": "image",
  "prebuilt-audio": "audio",
  "prebuilt-audioSearch": "audio",
  "prebuilt-callCenter": "audio",
  "prebuilt-video": "video",
  "prebuilt-videoSearch": "video",
  "prebuilt-videoSynopsis": "video",
};

export function isAnalyzerCompatible(
  fileModality: CuModality,
  analyzerModality: CuModality,
): boolean {
  if (analyzerModality === "document") {
    return fileModality === "document" || fileModality === "image";
  }
  return fileModality === analyzerModality;
}

export function modalityFromBaseAnalyzerId(
  baseAnalyzerId?: string,
): CuModality {
  return BASE_TO_MODALITY[baseAnalyzerId ?? ""] ?? "document";
}

export function resolveAnalyzerModalityFromCache(
  analyzerId: string,
): CuModality | null {
  return KNOWN_PREBUILT_MODALITY[analyzerId] ?? null;
}

export async function fetchAnalyzerModality(
  endpoint: string,
  analyzerId: string,
  authHeaders: Record<string, string>,
): Promise<CuModality> {
  const cached = resolveAnalyzerModalityFromCache(analyzerId);
  if (cached) return cached;

  const url =
    `${endpoint.replace(/\/$/, "")}` +
    `/contentunderstanding/analyzers/${encodeURIComponent(analyzerId)}` +
    `?api-version=2025-05-01-preview`;

  const response = await fetch(url, { headers: authHeaders });
  if (!response.ok) {
    throw new Error(
      `Failed to resolve analyzer '${analyzerId}': HTTP ${response.status}`,
    );
  }

  const payload = (await response.json()) as {
    baseAnalyzerId?: string;
  };

  if (payload.baseAnalyzerId) {
    return modalityFromBaseAnalyzerId(payload.baseAnalyzerId);
  }

  return "document";
}

export function selectAnalyzerId(
  fileType: ContentUnderstandingFileType,
  options: {
    customAnalyzerId?: string;
    customAnalyzerModality?: CuModality | null;
  },
): string {
  const fileModality = getCuModality(fileType);

  if (
    options.customAnalyzerId &&
    options.customAnalyzerModality &&
    isAnalyzerCompatible(fileModality, options.customAnalyzerModality)
  ) {
    return options.customAnalyzerId;
  }

  return PREBUILT_ANALYZERS[fileModality] ?? "prebuilt-documentSearch";
}
