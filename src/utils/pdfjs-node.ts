import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { currentModuleRef } from "./module-ref.js";

export interface PdfJsNodeAssetUrls {
  standardFontDataUrl: string;
  workerSrc: string;
}

let cachedAssetUrls: PdfJsNodeAssetUrls | null = null;

export function getPdfJsNodeAssetUrls(): PdfJsNodeAssetUrls {
  if (cachedAssetUrls) return cachedAssetUrls;

  const require = createRequire(currentModuleRef());
  const packageJsonPath = require.resolve("pdfjs-dist/package.json");
  const root = dirname(packageJsonPath);

  cachedAssetUrls = {
    // NodeStandardFontDataFactory reads fonts with fs.readFile (paths, not file:// URLs).
    standardFontDataUrl: join(root, "standard_fonts/"),
    workerSrc: pathToFileURL(join(root, "legacy/build/pdf.worker.mjs")).href,
  };

  return cachedAssetUrls;
}

export type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsModule: PdfJsModule | null = null;

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (pdfJsModule) return pdfJsModule;

  if (typeof process !== "undefined" && process.versions?.node) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const assets = getPdfJsNodeAssetUrls();
    pdfjs.GlobalWorkerOptions.workerSrc = assets.workerSrc;
    pdfJsModule = pdfjs;
    return pdfjs;
  }

  const pdfjs = await import("pdfjs-dist");
  pdfJsModule = pdfjs as unknown as PdfJsModule;
  return pdfJsModule;
}

export function getPdfDocumentOptions(data: Uint8Array): {
  data: Uint8Array;
  standardFontDataUrl?: string;
} {
  const options: { data: Uint8Array; standardFontDataUrl?: string } = {
    data: data.slice(),
  };

  if (typeof process !== "undefined" && process.versions?.node) {
    options.standardFontDataUrl = getPdfJsNodeAssetUrls().standardFontDataUrl;
  }

  return options;
}
