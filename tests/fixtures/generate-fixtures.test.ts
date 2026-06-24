import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDocxWithBlockFraction,
  buildDocxWithFootnote,
  buildDocxWithFraction,
  buildMinimalDocx,
  buildMinimalXls,
  buildMinimalXlsx,
} from "./build-office-fixtures.js";
import {
  buildMinimalEpub,
  buildMinimalMsg,
  buildMinimalPptx,
  buildPptxMultiSlide,
  buildPptxWithChart,
  buildPptxWithNotes,
  buildPptxWithTable,
} from "./build-media-fixtures.js";

const fixturesDir = dirname(fileURLToPath(import.meta.url));

async function writeFixture(name: string, data: Uint8Array): Promise<void> {
  await writeFile(join(fixturesDir, name), data);
}

describe("fixture generator", () => {
  it("writes committed binary fixtures when GENERATE_FIXTURES=1", async () => {
    if (process.env.GENERATE_FIXTURES !== "1") return;

    await writeFixture("minimal.docx", await buildMinimalDocx("Hello DOCX fixture"));
    await writeFixture(
      "footnote.docx",
      await buildDocxWithFootnote("See footnote", "Footnote explanation text"),
    );
    await writeFixture("math-inline.docx", await buildDocxWithFraction());
    await writeFixture("math-block.docx", await buildDocxWithBlockFraction());
    await writeFixture(
      "minimal.xlsx",
      await buildMinimalXlsx([
        ["Name", "Score"],
        ["Alice", "95"],
        ["Bob", "88"],
      ]),
    );
    await writeFixture(
      "minimal.pptx",
      await buildMinimalPptx("Fixture Slide", "Bullet point one"),
    );
    await writeFixture(
      "chart.pptx",
      await buildPptxWithChart("Sales Slide"),
    );
    await writeFixture(
      "table.pptx",
      await buildPptxWithTable("Table Slide", [
        ["Product", "Units"],
        ["Widget", "42"],
      ]),
    );
    await writeFixture(
      "notes.pptx",
      await buildPptxWithNotes(
        "Notes Slide",
        "Slide body text",
        "Remember to mention the quarterly results.",
      ),
    );
    await writeFixture(
      "multi.pptx",
      await buildPptxMultiSlide([
        { title: "First Slide", body: "Opening content" },
        { title: "Second Slide", body: "Closing content" },
      ]),
    );
    await writeFixture(
      "minimal.xls",
      await buildMinimalXls([
        ["Item", "Qty"],
        ["Bolt", "7"],
      ]),
    );
    await writeFixture("minimal.msg", await buildMinimalMsg());
    await writeFixture(
      "minimal.epub",
      await buildMinimalEpub({
        title: "Fixture EPUB",
        chapterHtml: "<h1>Chapter</h1><p>EPUB body text</p>",
      }),
    );

    expect(true).toBe(true);
  });
});
