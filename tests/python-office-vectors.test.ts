import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { File2MD } from "../src/file2md.js";
import { resolvePythonTestFile } from "./helpers/python-test-files.js";

interface OfficeVector {
  file: string;
  mimetype: string;
  mustInclude: string[];
  mustNotInclude?: string[];
  requiresMsgReader?: boolean;
  requiresPdfJs?: boolean;
}

const OFFICE_VECTORS: OfficeVector[] = [
  {
    file: "test.xlsx",
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    mustInclude: [
      "## 09060124-b5e7-4717-9d07-3c046eb",
      "6ff4173b-42a5-4784-9b19-f49caff4d93d",
      "affc7dad-52dc-4b98-9b5d-51e65d8a8ad0",
    ],
  },
  {
    file: "test.xls",
    mimetype: "application/vnd.ms-excel",
    mustInclude: [
      "## 09060124-b5e7-4717-9d07-3c046eb",
      "6ff4173b-42a5-4784-9b19-f49caff4d93d",
      "affc7dad-52dc-4b98-9b5d-51e65d8a8ad0",
    ],
  },
  {
    file: "test.epub",
    mimetype: "application/epub+zip",
    mustInclude: [
      "**Authors:** Test Author",
      "A test EPUB document for file2md testing",
      "# Chapter 1: Test Content",
      "# Chapter 2: More Content",
    ],
  },
  {
    file: "test.docx",
    mimetype:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    mustInclude: [
      "314b0a30-5b04-470b-b9f7-eed2c2bec74a",
      "49e168b7-d2ae-407f-a055-2167576f39a1",
      "## d666f1f7-46cb-42bd-9a39-9a39cf2a509f",
      "# Abstract",
      "# Introduction",
      "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation",
      "data:image/png;base64...",
    ],
    mustNotInclude: ["data:image/png;base64,iVBORw0KGgoAAAANSU"],
  },
  {
    file: "test.pptx",
    mimetype:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    mustInclude: [
      "2cdda5c8-e50e-4db4-b5f0-9722a649f455",
      "04191ea8-5c73-4215-a1d3-1cfb43aaaf12",
      "44bf7d06-5e7a-4a40-a2e1-a2e42ef28c8a",
      "1b92870d-e3b5-4e65-8153-919f4ff45592",
      "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation",
      "a3f6004b-6f4f-4ea8-bee3-3741f4dc385f",
      "2003",
      "![This phrase of the caption is Human-written.](Picture4.jpg)",
    ],
    mustNotInclude: ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQE"],
  },
  {
    file: "test_outlook_msg.msg",
    mimetype: "application/vnd.ms-outlook",
    requiresMsgReader: true,
    mustInclude: [
      "# Email Message",
      "**From:** test.sender@example.com",
      "**To:** test.recipient@example.com",
      "**Subject:** Test Email Message",
      "## Content",
      "This is the body of the test email message",
    ],
  },
  {
    file: "test.pdf",
    mimetype: "application/pdf",
    requiresPdfJs: true,
    mustInclude: [
      "While there is contemporaneous exploration of multi-agent approaches",
    ],
  },
  {
    file: "movie-theater-booking-2024.pdf",
    mimetype: "application/pdf",
    requiresPdfJs: true,
    mustInclude: ["STARLIGHT CINEMAS", "Holiday Movie Marathon Package"],
  },
];

async function isPdfJsAvailable(): Promise<boolean> {
  try {
    await import("pdfjs-dist/legacy/build/pdf.mjs");
    return true;
  } catch {
    return false;
  }
}

async function isMsgReaderAvailable(): Promise<boolean> {
  try {
    await import("@kenjiuno/msgreader");
    return true;
  } catch {
    return false;
  }
}

describe("office vectors", () => {
  const md = () => new File2MD({ enableMagikaDetection: false });

  for (const vector of OFFICE_VECTORS) {
    it(`converts ${vector.file}`, async () => {
      const path = await resolvePythonTestFile(vector.file);
      if (!path) return;

      if (vector.requiresMsgReader && !(await isMsgReaderAvailable())) return;
      if (vector.requiresPdfJs && !(await isPdfJsAvailable())) return;

      const data = new Uint8Array(await readFile(path));
      const extension = "." + vector.file.split(".").pop()!;

      const result = await md().convertStream(data, {
        streamInfo: {
          extension,
          mimetype: vector.mimetype,
          filename: vector.file,
        },
      });

      for (const snippet of vector.mustInclude) {
        expect(result.text_content).toContain(snippet);
      }
      for (const snippet of vector.mustNotInclude ?? []) {
        expect(result.text_content).not.toContain(snippet);
      }
    });
  }
});
