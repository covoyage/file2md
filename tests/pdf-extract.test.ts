import { describe, expect, it } from "vitest";
import {
  extractFormContentFromWords,
  extractPlainTextFromItems,
  extractProseTextFromWords,
  extractWordsFromTextItems,
  mergeHyphenatedLines,
  postProcessPdfText,
  type PdfWord,
} from "../src/utils/pdf-extract.js";

describe("extractFormContentFromWords", () => {
  it("extracts aligned form-style tables", () => {
    const words: PdfWord[] = [
      { text: "Name", x0: 50, x1: 90, top: 100 },
      { text: "Age", x0: 200, x1: 230, top: 100 },
      { text: "City", x0: 350, x1: 380, top: 100 },
      { text: "Alice", x0: 50, x1: 90, top: 120 },
      { text: "30", x0: 200, x1: 220, top: 120 },
      { text: "NYC", x0: 350, x1: 380, top: 120 },
      { text: "Bob", x0: 50, x1: 80, top: 140 },
      { text: "25", x0: 200, x1: 220, top: 140 },
      { text: "LA", x0: 350, x1: 370, top: 140 },
    ];

    const result = extractFormContentFromWords(words, 612);
    expect(result).not.toBeNull();
    expect(result).toContain("| Name");
    expect(result).toContain("Alice");
  });

  it("does not treat brochure headlines as form tables", () => {
    const words: PdfWord[] = [
      { text: "Life", x0: 137, x1: 371, top: 236 },
      { text: "Lines", x0: 430, x1: 723, top: 236 },
      { text: "of", x0: 137, x1: 263, top: 382 },
      { text: "support", x0: 326, x1: 767, top: 382 },
      { text: "King's", x0: 137, x1: 305, top: 607 },
      { text: "Health", x0: 333, x1: 501, top: 607 },
      { text: "Partners", x0: 529, x1: 753, top: 607 },
    ];

    expect(extractFormContentFromWords(words, 960)).toBeNull();
  });

  it("does not treat magazine columns as form tables", () => {
    const words: PdfWord[] = [
      {
        text: "Enterprise",
        x0: 72,
        x1: 200,
        top: 100,
      },
      {
        text: "mobility",
        x0: 320,
        x1: 420,
        top: 100,
      },
      {
        text: "solutions",
        x0: 480,
        x1: 580,
        top: 100,
      },
      {
        text: "Organizations",
        x0: 72,
        x1: 200,
        top: 130,
      },
      {
        text: "deploy",
        x0: 320,
        x1: 420,
        top: 130,
      },
      {
        text: "devices",
        x0: 480,
        x1: 580,
        top: 130,
      },
    ];

    expect(extractFormContentFromWords(words, 612)).toBeNull();
  });

  it("does not treat letter-spaced columns as structured tables", () => {
    const words: PdfWord[] = [
      { text: "L", x0: 50, x1: 60, top: 100 },
      { text: "i", x0: 80, x1: 90, top: 100 },
      { text: "f", x0: 110, x1: 120, top: 100 },
      { text: "e", x0: 140, x1: 150, top: 100 },
      { text: "L", x0: 200, x1: 210, top: 100 },
      { text: "i", x0: 230, x1: 240, top: 100 },
      { text: "n", x0: 260, x1: 270, top: 100 },
      { text: "e", x0: 290, x1: 300, top: 100 },
      { text: "s", x0: 320, x1: 330, top: 100 },
    ];

    expect(extractFormContentFromWords(words, 612)).toBeNull();
  });

  it("returns null when words are empty", () => {
    expect(extractFormContentFromWords([], 612)).toBeNull();
  });
});

describe("extractWordsFromTextItems", () => {
  it("builds words from pdfjs text items", () => {
    const words = extractWordsFromTextItems(
      [
        {
          str: "Hello World",
          transform: [1, 0, 0, 1, 72, 700],
          width: 80,
          height: 12,
        },
      ],
      792,
    );
    expect(words.length).toBeGreaterThan(0);
    expect(words.some((w) => w.text === "Hello")).toBe(true);
    expect(words.some((w) => w.text === "World")).toBe(true);
  });
});

describe("extractProseTextFromWords", () => {
  it("joins words on the same line and breaks across rows", () => {
    const words: PdfWord[] = [
      { text: "Hello", x0: 72, x1: 110, top: 100 },
      { text: "world", x0: 115, x1: 160, top: 100 },
      { text: "Next", x0: 72, x1: 100, top: 120 },
      { text: "line", x0: 105, x1: 130, top: 120 },
    ];

    expect(extractProseTextFromWords(words)).toBe("Hello world\nNext line");
  });

  it("returns empty string for no words", () => {
    expect(extractProseTextFromWords([])).toBe("");
  });
});

describe("extractPlainTextFromItems", () => {
  it("concatenates pdfjs item strings", () => {
    expect(
      extractPlainTextFromItems([{ str: "Hello" }, { str: "PDF" }]),
    ).toBe("Hello PDF");
  });
});

describe("mergeHyphenatedLines", () => {
  it("merges lowercase hyphenation across line breaks", () => {
    expect(mergeHyphenatedLines("docu-\nment")).toBe("document");
  });

  it("does not merge when the next line starts uppercase", () => {
    expect(mergeHyphenatedLines("UPPER-\nNext")).toBe("UPPER-\nNext");
  });
});

describe("postProcessPdfText", () => {
  it("passes prose through unchanged", () => {
    expect(postProcessPdfText("inter-\nnational")).toBe("inter-\nnational");
  });
});
