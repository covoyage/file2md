import { describe, expect, it } from "vitest";
import {
  normalizeCliHints,
  parseCliArgs,
  validateCliArgs,
} from "../src/cli-args.js";

describe("parseCliArgs", () => {
  it("accepts -p as alias for --use-plugins", () => {
    const args = parseCliArgs(["-p", "file.docx"]);
    expect(args.usePlugins).toBe(true);
    expect(args.input).toBe("file.docx");
  });

  it("accepts --cu-analyzer as alias for --cu-analyzer-id", () => {
    const args = parseCliArgs(["--cu-analyzer", "my-analyzer"]);
    expect(args.cuAnalyzerId).toBe("my-analyzer");
  });
});

describe("normalizeCliHints", () => {
  it("prefixes extension hints with a dot", () => {
    const args = parseCliArgs(["-x", "pdf"]);
    normalizeCliHints(args);
    expect(args.extension).toBe(".pdf");
  });

  it("rejects invalid MIME types", () => {
    const args = parseCliArgs(["-m", "not-a-mime"]);
    expect(() => normalizeCliHints(args)).toThrow(/Invalid MIME type/);
  });

  it("rejects invalid charsets", () => {
    const args = parseCliArgs(["-c", "not-a-real-charset-xyz"]);
    expect(() => normalizeCliHints(args)).toThrow(/Invalid charset/);
  });
});

describe("validateCliArgs", () => {
  it("rejects using Document Intelligence and Content Understanding together", () => {
    const args = parseCliArgs([
      "-e",
      "https://docintel.example",
      "--cu-endpoint",
      "https://cu.example",
      "file.pdf",
    ]);
    expect(() => validateCliArgs(args, { fromStdin: false })).toThrow(
      /cannot be used together/i,
    );
  });

  it("requires a filename for cloud conversion modes", () => {
    const args = parseCliArgs(["-e", "https://docintel.example"]);
    expect(() => validateCliArgs(args, { fromStdin: false })).toThrow(
      /filename is required/i,
    );
    expect(() => validateCliArgs(args, { fromStdin: true })).toThrow(
      /filename is required/i,
    );
  });

  it("requires docintel endpoint when -d is used without env var", () => {
    const previous = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
    try {
      const args = parseCliArgs(["-d", "file.pdf"]);
      expect(() => validateCliArgs(args, { fromStdin: false })).toThrow(
        /Document Intelligence endpoint is required/i,
      );
    } finally {
      if (previous !== undefined) {
        process.env.DOCUMENT_INTELLIGENCE_ENDPOINT = previous;
      }
    }
  });

  it("requires cu endpoint when --use-cu is used without env var", () => {
    const previous = process.env.AZURE_CONTENT_UNDERSTANDING_ENDPOINT;
    delete process.env.AZURE_CONTENT_UNDERSTANDING_ENDPOINT;
    try {
      const args = parseCliArgs(["--use-cu", "file.pdf"]);
      expect(() => validateCliArgs(args, { fromStdin: false })).toThrow(
        /Content Understanding endpoint/i,
      );
    } finally {
      if (previous !== undefined) {
        process.env.AZURE_CONTENT_UNDERSTANDING_ENDPOINT = previous;
      }
    }
  });
});
