import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentConverterResult, File2MD } from "../src/index.js";
import { PdfConverter } from "../src/converters/pdf-converter.js";
import {
  buildDocxWithBlockFraction,
  buildDocxWithFootnote,
  buildDocxWithFraction,
  buildMinimalDocx,
  buildMinimalXls,
  buildMinimalXlsx,
} from "./fixtures/build-office-fixtures.js";
import {
  buildMinimalEpub,
  buildMinimalPptx,
  buildPptxMultiSlide,
  buildPptxWithChart,
  buildPptxWithNotes,
  buildPptxWithParagraphs,
  buildPptxWithTable,
} from "./fixtures/build-media-fixtures.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

async function readFixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(fixturesDir, name)));
}

async function isPdfJsAvailable(): Promise<boolean> {
  try {
    await import("pdfjs-dist/legacy/build/pdf.mjs");
    return true;
  } catch {
    return false;
  }
}

describe("DocumentConverterResult Python compatibility", () => {
  it("exposes text_content alias", () => {
    const result = new DocumentConverterResult("# Hello");
    expect(result.text_content).toBe("# Hello");
    expect(result.markdown).toBe("# Hello");
  });
});

describe("fixture conversions", () => {
  const md = () => new File2MD({ enableMagikaDetection: false });

  it("converts notebook fixture end-to-end", async () => {
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      cells: [
        { cell_type: "markdown", source: ["# Fixture\n", "Notebook text"] },
        { cell_type: "code", source: ["print('ok')"] },
      ],
    };

    const result = await md().convertStream(
      new TextEncoder().encode(JSON.stringify(notebook)),
      {
        streamInfo: {
          extension: ".ipynb",
          mimetype: "application/json",
          charset: "utf-8",
        },
      },
    );

    expect(result.markdown).toContain("# Fixture");
    expect(result.markdown).toContain("```python");
  });

  it("converts GBK text fixture via charset detection", async () => {
    const data = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3, 0xca, 0xc0, 0xbd, 0xe7]);
    const result = await md().convertStream(data, {
      streamInfo: { extension: ".txt", mimetype: "text/plain" },
    });
    expect(result.text_content).toBe("你好世界");
  });

  it("converts minimal DOCX fixture", async () => {
    const docx = await buildMinimalDocx("Hello DOCX fixture");
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    expect(result.text_content).toContain("Hello DOCX fixture");
  });

  it("converts DOCX with inline OMML math to LaTeX", async () => {
    const docx = await buildDocxWithFraction();
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    expect(result.text_content).toContain("Fraction:");
    expect(result.text_content).toContain("\\frac{1}{2}");
  });

  it("converts DOCX with block OMML math to display LaTeX", async () => {
    const docx = await buildDocxWithBlockFraction();
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    expect(result.text_content).toContain('$$\\frac{1}{2}$$');
  });

  it("converts DOCX with footnote", async () => {
    const docx = await buildDocxWithFootnote(
      "See footnote",
      "Footnote explanation text",
    );
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    });
    expect(result.text_content).toContain("See footnote");
    expect(result.text_content).toContain("Footnote explanation text");
  });

  it("converts minimal PPTX fixture", async () => {
    const pptx = await buildMinimalPptx("Fixture Slide", "Bullet point one");
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    expect(result.text_content).toContain("# Fixture Slide");
    expect(result.text_content).toContain("Bullet point one");
  });

  it("preserves paragraph breaks within a PPTX text shape", async () => {
    const pptx = await buildPptxWithParagraphs("Paragraph Slide", [
      "First paragraph",
      "Second paragraph",
    ]);
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    expect(result.text_content).toContain("First paragraph\nSecond paragraph");
  });

  it("converts PPTX with embedded chart fixture", async () => {
    const pptx = await buildPptxWithChart("Sales Slide");
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    expect(result.text_content).toContain("# Sales Slide");
    expect(result.text_content).toContain("### Chart: Sales");
    expect(result.text_content).toContain("| Jan | 10 |");
    expect(result.text_content).toContain("| Feb | 20 |");
  });

  it("converts PPTX with embedded table fixture", async () => {
    const pptx = await buildPptxWithTable("Table Slide", [
      ["Product", "Units"],
      ["Widget", "42"],
    ]);
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    expect(result.text_content).toContain("# Table Slide");
    expect(result.text_content).toContain("| Product | Units |");
    expect(result.text_content).toContain("| Widget | 42 |");
  });

  it("converts PPTX with speaker notes fixture", async () => {
    const pptx = await buildPptxWithNotes(
      "Notes Slide",
      "Slide body text",
      "Remember to mention the quarterly results.",
    );
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    expect(result.text_content).toContain("# Notes Slide");
    expect(result.text_content).toContain("Slide body text");
    expect(result.text_content).toContain("### Notes:");
    expect(result.text_content).toContain("quarterly results");
  });

  it("converts multi-slide PPTX fixture", async () => {
    const pptx = await buildPptxMultiSlide([
      { title: "First Slide", body: "Opening content" },
      { title: "Second Slide", body: "Closing content" },
    ]);
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    });
    expect(result.text_content).toContain("<!-- Slide number: 1 -->");
    expect(result.text_content).toContain("# First Slide");
    expect(result.text_content).toContain("Opening content");
    expect(result.text_content).toContain("<!-- Slide number: 2 -->");
    expect(result.text_content).toContain("# Second Slide");
    expect(result.text_content).toContain("Closing content");
  });

  it("converts minimal XLS fixture", async () => {
    const xls = await buildMinimalXls([
      ["Item", "Qty"],
      ["Bolt", "7"],
    ]);
    const result = await md().convertStream(xls, {
      streamInfo: {
        extension: ".xls",
        mimetype: "application/vnd.ms-excel",
      },
    });
    expect(result.text_content).toContain("| Item | Qty |");
    expect(result.text_content).toContain("| Bolt | 7 |");
  });

  it("converts minimal MSG fixture when msgreader is installed", async () => {
    try {
      await import("@kenjiuno/msgreader");
    } catch {
      return;
    }

    const msg = await readFixture("minimal.msg");
    const result = await md().convertStream(msg, {
      streamInfo: {
        extension: ".msg",
        mimetype: "application/vnd.ms-outlook",
        filename: "minimal.msg",
      },
    });
    expect(result.text_content).toContain("# Email Message");
    expect(result.text_content).toContain("**Subject:** title");
    expect(result.text_content).toContain("body");
  });

  it("converts minimal EPUB fixture", async () => {
    const epub = await buildMinimalEpub({
      title: "Fixture EPUB",
      chapterHtml: "<h1>Chapter</h1><p>EPUB body text</p>",
    });
    const result = await md().convertStream(epub, {
      streamInfo: {
        extension: ".epub",
        mimetype: "application/epub+zip",
      },
    });
    expect(result.text_content).toContain("Fixture EPUB");
    expect(result.text_content).toContain("Chapter");
    expect(result.text_content).toContain("EPUB body text");
  });

  it("converts minimal XLSX fixture", async () => {
    const xlsx = await buildMinimalXlsx([
      ["Name", "Score"],
      ["Alice", "95"],
      ["Bob", "88"],
    ]);
    const result = await md().convertStream(xlsx, {
      streamInfo: {
        extension: ".xlsx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
    expect(result.text_content).toContain("| Name | Score |");
    expect(result.text_content).toContain("| Alice | 95 |");
  });
});

describe("committed binary fixtures", () => {
  const md = () => new File2MD({ enableMagikaDetection: false });

  it("converts minimal.docx from disk", async () => {
    const docx = await readFixture("minimal.docx");
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "minimal.docx",
      },
    });
    expect(result.text_content).toContain("Hello DOCX fixture");
  });

  it("converts footnote.docx from disk", async () => {
    const docx = await readFixture("footnote.docx");
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "footnote.docx",
      },
    });
    expect(result.text_content).toContain("See footnote");
    expect(result.text_content).toContain("Footnote explanation text");
  });

  it("converts math-inline.docx from disk", async () => {
    const docx = await readFixture("math-inline.docx");
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "math-inline.docx",
      },
    });
    expect(result.text_content).toContain("\\frac{1}{2}");
  });

  it("converts math-block.docx from disk", async () => {
    const docx = await readFixture("math-block.docx");
    const result = await md().convertStream(docx, {
      streamInfo: {
        extension: ".docx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename: "math-block.docx",
      },
    });
    expect(result.text_content).toContain('$$\\frac{1}{2}$$');
  });

  it("converts minimal.pptx from disk", async () => {
    const pptx = await readFixture("minimal.pptx");
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename: "minimal.pptx",
      },
    });
    expect(result.text_content).toContain("# Fixture Slide");
    expect(result.text_content).toContain("Bullet point one");
  });

  it("converts chart.pptx from disk", async () => {
    const pptx = await readFixture("chart.pptx");
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename: "chart.pptx",
      },
    });
    expect(result.text_content).toContain("# Sales Slide");
    expect(result.text_content).toContain("### Chart: Sales");
    expect(result.text_content).toContain("| Feb | 20 |");
  });

  it("converts table.pptx from disk", async () => {
    const pptx = await readFixture("table.pptx");
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename: "table.pptx",
      },
    });
    expect(result.text_content).toContain("# Table Slide");
    expect(result.text_content).toContain("| Widget | 42 |");
  });

  it("converts notes.pptx from disk", async () => {
    const pptx = await readFixture("notes.pptx");
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename: "notes.pptx",
      },
    });
    expect(result.text_content).toContain("# Notes Slide");
    expect(result.text_content).toContain("### Notes:");
    expect(result.text_content).toContain("quarterly results");
  });

  it("converts multi.pptx from disk", async () => {
    const pptx = await readFixture("multi.pptx");
    const result = await md().convertStream(pptx, {
      streamInfo: {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename: "multi.pptx",
      },
    });
    expect(result.text_content).toContain("# First Slide");
    expect(result.text_content).toContain("# Second Slide");
    expect(result.text_content).toContain("Closing content");
  });

  it("converts minimal.xls from disk", async () => {
    const xls = await readFixture("minimal.xls");
    const result = await md().convertStream(xls, {
      streamInfo: {
        extension: ".xls",
        mimetype: "application/vnd.ms-excel",
        filename: "minimal.xls",
      },
    });
    expect(result.text_content).toContain("| Item | Qty |");
    expect(result.text_content).toContain("| Bolt | 7 |");
  });

  it("converts minimal.msg from disk when msgreader is installed", async () => {
    try {
      await import("@kenjiuno/msgreader");
    } catch {
      return;
    }

    const msg = await readFixture("minimal.msg");
    const result = await md().convertStream(msg, {
      streamInfo: {
        extension: ".msg",
        mimetype: "application/vnd.ms-outlook",
        filename: "minimal.msg",
      },
    });
    expect(result.text_content).toContain("**Subject:** title");
    expect(result.text_content).toContain("body");
  });

  it("converts minimal.epub from disk", async () => {
    const epub = await readFixture("minimal.epub");
    const result = await md().convertStream(epub, {
      streamInfo: {
        extension: ".epub",
        mimetype: "application/epub+zip",
        filename: "minimal.epub",
      },
    });
    expect(result.text_content).toContain("Fixture EPUB");
    expect(result.text_content).toContain("EPUB body text");
  });

  it("converts minimal.xlsx from disk", async () => {
    const xlsx = await readFixture("minimal.xlsx");
    const result = await md().convertStream(xlsx, {
      streamInfo: {
        extension: ".xlsx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: "minimal.xlsx",
      },
    });
    expect(result.text_content).toContain("| Name | Score |");
    expect(result.text_content).toContain("| Bob | 88 |");
  });
});

describe("minimal PDF fixture", () => {
  it("extracts text when pdfjs-dist is installed", async () => {
    if (!(await isPdfJsAvailable())) return;

    const pdfBytes = new Uint8Array(await readFile(join(fixturesDir, "minimal.pdf")));
    const converter = new PdfConverter();
    const result = await converter.convert(pdfBytes, {
      extension: ".pdf",
      mimetype: "application/pdf",
      charset: null,
      filename: "minimal.pdf",
      localPath: null,
      url: null,
    });

    expect(result.markdown).toMatch(/Hello\s*PDF/i);
  });

  it("converts PDF end-to-end", async () => {
    if (!(await isPdfJsAvailable())) return;

    const pdfBytes = new Uint8Array(await readFile(join(fixturesDir, "minimal.pdf")));
    const result = await new File2MD({ enableMagikaDetection: false }).convertStream(
      pdfBytes,
      {
        streamInfo: {
          extension: ".pdf",
          mimetype: "application/pdf",
          filename: "minimal.pdf",
        },
      },
    );

    expect(result.text_content).toMatch(/Hello\s*PDF/i);
  });
});
