declare module "pdfjs-dist" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: {
    data: Uint8Array;
    standardFontDataUrl?: string;
  }): PDFDocumentLoadingTask;
  export class PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>;
  }
  export class PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }
  export class PDFPageProxy {
    getViewport(params: { scale: number }): PageViewport;
    getTextContent(): Promise<{ items: Array<{ str: string }> }>;
  }
  export class PageViewport {
    width: number;
    height: number;
  }
}

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export * from "pdfjs-dist";
}
