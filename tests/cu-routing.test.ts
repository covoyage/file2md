import { describe, expect, it } from "vitest";
import {
  isAnalyzerCompatible,
  resolveAnalyzerModalityFromCache,
  selectAnalyzerId,
} from "../src/converter-utils/cu/analyzer-routing.js";
import {
  ContentUnderstandingFileType,
  canonicalMimeType,
  contentTypeFor,
  detectCuFileType,
} from "../src/converter-utils/cu/file-types.js";

describe("detectCuFileType", () => {
  it("detects by extension", () => {
    const all = Object.values(ContentUnderstandingFileType);
    expect(
      detectCuFileType({ extension: ".eml" }, all),
    ).toBe(ContentUnderstandingFileType.EML);
    expect(
      detectCuFileType({ extension: ".flac" }, all),
    ).toBe(ContentUnderstandingFileType.FLAC);
  });

  it("detects by MIME when extension is missing", () => {
    const all = Object.values(ContentUnderstandingFileType);
    expect(
      detectCuFileType(
        { extension: null, mimetype: "audio/x-wav" },
        all,
      ),
    ).toBe(ContentUnderstandingFileType.WAV);
    expect(
      detectCuFileType(
        { extension: null, mimetype: "application/vnd.ms-outlook" },
        all,
      ),
    ).toBe(ContentUnderstandingFileType.MSG);
  });

  it("respects allowed file type restrictions", () => {
    expect(
      detectCuFileType(
        { extension: ".pdf" },
        [ContentUnderstandingFileType.MP3],
      ),
    ).toBeNull();
  });
});

describe("contentTypeFor", () => {
  it("normalizes MIME aliases", () => {
    expect(canonicalMimeType("audio/x-wav")).toBe("audio/wav");
    expect(
      contentTypeFor(
        ContentUnderstandingFileType.WAV,
        "audio/x-wav",
      ),
    ).toBe("audio/wav");
  });

  it("uses canonical MIME for file type when mimetype disagrees", () => {
    expect(
      contentTypeFor(
        ContentUnderstandingFileType.PDF,
        "audio/mpeg",
      ),
    ).toBe("application/pdf");
  });
});

describe("analyzer routing", () => {
  it("resolves known prebuilt analyzer modalities from cache", () => {
    expect(resolveAnalyzerModalityFromCache("prebuilt-invoice")).toBe("document");
    expect(resolveAnalyzerModalityFromCache("prebuilt-audioSearch")).toBe("audio");
  });

  it("routes compatible custom analyzers", () => {
    const analyzerId = selectAnalyzerId(ContentUnderstandingFileType.PDF, {
      customAnalyzerId: "my-invoice",
      customAnalyzerModality: "document",
    });
    expect(analyzerId).toBe("my-invoice");
  });

  it("falls back to prebuilt when custom analyzer modality is incompatible", () => {
    const analyzerId = selectAnalyzerId(ContentUnderstandingFileType.MP3, {
      customAnalyzerId: "my-invoice",
      customAnalyzerModality: "document",
    });
    expect(analyzerId).toBe("prebuilt-audioSearch");
  });

  it("allows document analyzers for images", () => {
    expect(isAnalyzerCompatible("image", "document")).toBe(true);
    expect(isAnalyzerCompatible("audio", "document")).toBe(false);
  });
});
