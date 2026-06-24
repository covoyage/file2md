import { describe, expect, it } from "vitest";
import {
  analyzeWithContentUnderstanding,
  setCuSdkAnalyze,
} from "../src/utils/cu-analyze.js";

describe("analyzeWithContentUnderstanding", () => {
  it("uses injected SDK analyzer when available", async () => {
    setCuSdkAnalyze(async (options) => ({
      analyzerId: options.analyzerId,
      markdown: "# SDK result",
    }));

    const result = await analyzeWithContentUnderstanding({
      endpoint: "https://example.cognitiveservices.azure.com",
      analyzerId: "prebuilt-invoice",
      data: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
      authOptions: { credential: "test-key" },
    });

    expect(result.analyzerId).toBe("prebuilt-invoice");
    expect(result.markdown).toBe("# SDK result");
    setCuSdkAnalyze(null);
  });
});
