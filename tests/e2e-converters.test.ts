import { describe, expect, it } from "vitest";
import { File2MD } from "../src/file2md.js";
import { ZipConverter } from "../src/converters/zip-converter.js";
import {
  FileConversionException,
  UnsupportedFormatException,
} from "../src/exceptions.js";

describe("File2MD end-to-end", () => {
  const md = () => new File2MD({ enableMagikaDetection: false });

  it("converts JSON to markdown text", async () => {
    const json = JSON.stringify({ hello: "world", count: 2 }, null, 2);
    const result = await md().convertStream(new TextEncoder().encode(json), {
      streamInfo: { extension: ".json", mimetype: "application/json" },
    });
    expect(result.markdown).toContain('"hello"');
    expect(result.markdown).toContain("world");
  });

  it("converts HTML with title", async () => {
    const html =
      "<html><head><title>Report</title></head><body><h1>Summary</h1></body></html>";
    const result = await md().convertStream(new TextEncoder().encode(html), {
      streamInfo: { extension: ".html", mimetype: "text/html", charset: "utf-8" },
    });
    expect(result.title).toBe("Report");
    expect(result.markdown).toContain("Summary");
  });

  it("converts Markdown passthrough", async () => {
    const source = "# Title\n\nParagraph one.";
    const result = await md().convertStream(new TextEncoder().encode(source), {
      streamInfo: { extension: ".md", mimetype: "text/markdown", charset: "utf-8" },
    });
    expect(result.markdown).toContain("# Title");
    expect(result.markdown).toContain("Paragraph one.");
  });

  it("converts Atom feed end-to-end", async () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>News</title>
  <entry><title>Item</title><summary>Body</summary></entry>
</feed>`;
    const result = await md().convertStream(new TextEncoder().encode(atom), {
      streamInfo: { extension: ".atom", mimetype: "application/atom+xml", charset: "utf-8" },
    });
    expect(result.markdown).toContain("# News");
    expect(result.markdown).toContain("Item");
  });
});

describe("ZipConverter resilience", () => {
  it("skips unsupported zip entries silently", async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file("readme.txt", "hello");
    zip.file("broken.bin", new Uint8Array([0, 1, 2]));
    const archive = await zip.generateAsync({ type: "uint8array" });

    class StubFile2MD {
      async convertStream(
        input: Uint8Array,
        options?: { streamInfo?: { extension?: string | null } },
      ) {
        const extension = options?.streamInfo?.extension ?? "";
        if (extension === ".bin") {
          throw new UnsupportedFormatException("unsupported");
        }
        if (extension === ".fail") {
          throw new FileConversionException("failed");
        }
        return {
          markdown: new TextDecoder().decode(input),
          title: null,
        };
      }
    }

    const converter = new ZipConverter(new StubFile2MD());
    const result = await converter.convert(archive, {
      extension: ".zip",
      mimetype: "application/zip",
      charset: null,
      filename: "bundle.zip",
      localPath: null,
      url: null,
    });

    expect(result.markdown).toContain("readme.txt");
    expect(result.markdown).toContain("hello");
    expect(result.markdown).not.toContain("broken.bin");
  });
});
