import { describe, expect, it } from "vitest";
import { File2MD } from "../src/index.js";
import { HtmlConverter } from "../src/converters/html-converter.js";
import { IpynbConverter } from "../src/converters/ipynb-converter.js";
import { RssConverter } from "../src/converters/rss-converter.js";
import { WikipediaConverter } from "../src/converters/wikipedia-converter.js";
import { YouTubeConverter } from "../src/converters/youtube-converter.js";
import { htmlToMarkdown } from "../src/html/markdownify.js";
import { parseHtmlDocument } from "../src/html/parse.js";
import { rowsToMarkdownTable } from "../src/utils.js";

describe("HtmlConverter", () => {
  it("converts simple HTML to markdown", () => {
    const converter = new HtmlConverter();
    const html =
      "<html><head><title>Test</title></head><body><h1>Hello</h1><p>World</p></body></html>";
    const result = converter.convertString(html);
    expect(result.title).toBe("Test");
    expect(result.markdown).toContain("Hello");
    expect(result.markdown).toContain("World");
  });

  it("converts HTML fragments without a body wrapper", () => {
    const converter = new HtmlConverter();
    const result = converter.convertString("<p>Fragment text</p>");
    expect(result.markdown).toContain("Fragment text");
  });

  it("converts multi-block HTML fragments (mammoth-style)", () => {
    const converter = new HtmlConverter();
    const html =
      "<p>Document Title</p><p>Author Names</p><h1>Abstract</h1><p>Body paragraph with enough content.</p>";
    const result = converter.convertString(html);
    expect(result.markdown).toContain("Document Title");
    expect(result.markdown).toContain("Author Names");
    expect(result.markdown).toContain("# Abstract");
    expect(result.markdown).toContain("Body paragraph");
  });
});

describe("markdownify", () => {
  it("converts checkboxes", () => {
    const doc = parseHtmlDocument(
      "<html><body><div><input type=\"checkbox\" checked> Done</div></body></html>",
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("[x]");
  });

  it("truncates data URI images by default", () => {
    const doc = parseHtmlDocument(
      '<html><body><img alt="pic" src="data:image/png;base64,abc123"></body></html>',
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("data:image/png;base64...");
    expect(md).not.toContain("abc123");
  });

  it("skips javascript links", () => {
    const doc = parseHtmlDocument(
      '<html><body><a href="javascript:alert(1)">click</a></body></html>',
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("click");
    expect(md).not.toContain("javascript:");
  });

  it("converts HTML tables to markdown tables", () => {
    const doc = parseHtmlDocument(
      "<html><body><table><tr><td><p>1</p></td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table></body></html>",
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("| 1 | 2 |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 3 | 4 |");
  });

  it("preserves fragment-only anchor links", () => {
    const doc = parseHtmlDocument(
      '<html><body><a href="#purpose">1. Purpose of the document 3</a></body></html>',
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("[1. Purpose of the document 3](#purpose)");
    expect(md).not.toContain("example.invalid");
    expect(md).not.toContain("\\.");
  });

  it("does not double-escape numbered section links", () => {
    const doc = parseHtmlDocument(
      '<html><body><a href="#purpose">1. Purpose of the document 3</a></body></html>',
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("[1. Purpose of the document 3]");
    expect(md).not.toContain("\\.");
  });

  it("preserves bold text inside table cells", () => {
    const doc = parseHtmlDocument(
      "<html><body><table><tr><th><strong>Date</strong></th><th>Version</th></tr><tr><td>2025</td><td>1</td></tr></table></body></html>",
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("| **Date** | Version |");
  });

  it("adds a synthetic header row when the first table row is not a header", () => {
    const doc = parseHtmlDocument(
      '<html><body><table><tr><td colspan="3">Body</td></tr><tr><td>A</td><td>B</td><td>C</td></tr></table></body></html>',
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("|  |  |  |");
    expect(md).toContain("| Body | | |");
    expect(md).toContain("| A | B | C |");
  });
});

describe("CsvConverter", () => {
  it("converts CSV to markdown table", async () => {
    const md = new File2MD({ enableMagikaDetection: false });
    const csv = "Name,Age\nAlice,30\nBob,25";
    const result = await md.convertStream(new TextEncoder().encode(csv), {
      streamInfo: { extension: ".csv", mimetype: "text/csv", charset: "utf-8" },
    });
    expect(result.markdown).toContain("| Name | Age |");
    expect(result.markdown).toContain("| Alice | 30 |");
  });
});

describe("RssConverter", () => {
  it("converts Atom feed", () => {
    const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Feed</title>
  <entry>
    <title>Entry One</title>
    <summary>Summary text</summary>
  </entry>
</feed>`;

    const converter = new RssConverter();
    const result = converter.convert(
      new TextEncoder().encode(atom),
      { extension: ".atom", mimetype: "application/atom+xml", charset: "utf-8" },
    );
    expect(result.title).toBe("Test Feed");
    expect(result.markdown).toContain("# Test Feed");
    expect(result.markdown).toContain("## Entry One");
  });
});

describe("WikipediaConverter", () => {
  it("extracts main content from Wikipedia HTML", () => {
    const html = `<html><body>
      <span class="mw-page-title-main">Python</span>
      <div id="mw-content-text"><p>A programming language.</p></div>
    </body></html>`;

    const converter = new WikipediaConverter();
    const result = converter.convert(
      new TextEncoder().encode(html),
      {
        extension: ".html",
        mimetype: "text/html",
        charset: "utf-8",
        url: "https://en.wikipedia.org/wiki/Python",
      },
    );
    expect(result.title).toBe("Python");
    expect(result.markdown).toContain("# Python");
    expect(result.markdown).toContain("programming language");
  });
});

describe("YouTubeConverter", () => {
  it("extracts metadata from YouTube page HTML", async () => {
    const html = `<html><head>
      <title>My Video - YouTube</title>
      <meta property="og:title" content="My Video">
      <meta property="og:description" content="A great video">
      <meta itemprop="duration" content="PT5M">
    </head><body></body></html>`;

    const converter = new YouTubeConverter();
    const result = await converter.convert(
      new TextEncoder().encode(html),
      {
        extension: ".html",
        mimetype: "text/html",
        charset: "utf-8",
        url: "https://www.youtube.com/watch?v=abc123",
      },
    );
    expect(result.markdown).toContain("# YouTube");
    expect(result.markdown).toContain("My Video");
    expect(result.markdown).toContain("A great video");
  });

  it("includes transcript when fetcher is provided", async () => {
    const html = `<html><head><title>Video</title></head><body></body></html>`;
    const converter = new YouTubeConverter();
    const result = await converter.convert(
      new TextEncoder().encode(html),
      {
        extension: ".html",
        mimetype: "text/html",
        charset: "utf-8",
        url: "https://www.youtube.com/watch?v=abc123",
      },
      {
        fetchYouTubeTranscript: async () => "Hello transcript",
      },
    );
    expect(result.markdown).toContain("### Transcript");
    expect(result.markdown).toContain("Hello transcript");
  });
});

describe("IpynbConverter", () => {
  it("converts notebook JSON", () => {
    const converter = new IpynbConverter();
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      cells: [
        { cell_type: "markdown", source: ["# Title\n", "Some text"] },
        { cell_type: "code", source: ["print('hi')"] },
      ],
    };
    const result = converter.convertNotebook(notebook);
    expect(result.title).toBe("Title");
    expect(result.markdown).toContain("# Title");
    expect(result.markdown).toContain("```python");
  });
});

describe("rowsToMarkdownTable", () => {
  it("builds a valid table", () => {
    const table = rowsToMarkdownTable([
      ["A", "B"],
      ["1", "2"],
    ]);
    expect(table).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });
});

describe("File2MD plugins", () => {
  it("registers custom converters via plugin API", async () => {
    const { registerPlugin, clearRegisteredPlugins } = await import("../src/plugins.js");
    const { DocumentConverter, DocumentConverterResult } = await import("../src/index.js");

    class RtfConverter extends DocumentConverter {
      accepts(_data: Uint8Array, info: import("../src/stream-info.js").StreamInfo) {
        return info.extension === ".rtf";
      }
      convert(data: Uint8Array) {
        return new DocumentConverterResult(new TextDecoder().decode(data));
      }
    }

    clearRegisteredPlugins();
    registerPlugin({
      registerConverters(file2md) {
        file2md.registerConverter(new RtfConverter());
      },
    });

    const md = new File2MD({ enablePlugins: true, enableMagikaDetection: false });
    const result = await md.convertStream(new TextEncoder().encode("{\\rtf1 test}"), {
      streamInfo: { extension: ".rtf", charset: "utf-8" },
    });
    expect(result.markdown).toContain("{\\rtf1 test}");
    clearRegisteredPlugins();
  });
});

describe("PptxConverter", () => {
  it("accepts pptx mimetype", async () => {
    const { PptxConverter } = await import("../src/converters/pptx-converter.js");
    const converter = new PptxConverter();
    expect(
      converter.accepts(new Uint8Array([0x50, 0x4b]), {
        extension: ".pptx",
        mimetype:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        charset: null,
        filename: null,
        localPath: null,
        url: null,
      }),
    ).toBe(true);
  });
});

describe("File2MD", () => {
  it("converts plain text", async () => {
    const md = new File2MD({ enableMagikaDetection: false });
    const result = await md.convertStream(
      new TextEncoder().encode("Hello markdown"),
      {
        streamInfo: {
          extension: ".txt",
          mimetype: "text/plain",
          charset: "utf-8",
        },
      },
    );
    expect(result.markdown).toBe("Hello markdown");
  });
});
