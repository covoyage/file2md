import { describe, expect, it } from "vitest";
import { chartXmlToMarkdown } from "../src/converter-utils/pptx/chart.js";
import { htmlToMarkdown } from "../src/html/markdownify.js";
import { parseHtmlDocument } from "../src/html/parse.js";
import { detectTextCharset } from "../src/utils/charset.js";
import { resolveExiftoolPath } from "../src/utils/resolve-exiftool-node.js";
import { decodeText } from "../src/utils.js";

describe("detectTextCharset", () => {
  it("detects UTF-8 BOM", () => {
    const data = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("hello")]);
    expect(detectTextCharset(data)).toBe("utf-8");
  });

  it("detects valid UTF-8 without BOM", () => {
    const data = new TextEncoder().encode("你好 world");
    expect(detectTextCharset(data)).toBe("utf-8");
  });

  it("detects GBK-encoded Chinese text", () => {
    const data = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]);
    expect(detectTextCharset(data)).toBe("gb18030");
    expect(decodeText(data)).toBe("你好");
  });

  it("detects Shift_JIS-encoded Japanese text", () => {
    const data = new Uint8Array([0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4]);
    expect(detectTextCharset(data)).toBe("shift_jis");
    expect(decodeText(data)).toBe("あいう");
  });

  it("uses jschardet when injected", async () => {
    const { detectTextCharsetAsync, setChardetDetector } = await import(
      "../src/utils/charset.js"
    );
    setChardetDetector(() => ({
      encoding: "windows-1252",
      confidence: 0.95,
    }));
    await expect(
      detectTextCharsetAsync(new Uint8Array([0x80, 0x81])),
    ).resolves.toBe("windows-1252");
    setChardetDetector(null);
  });
});

describe("decodeText", () => {
  it("auto-detects charset when not specified", () => {
    const data = new TextEncoder().encode("café");
    expect(decodeText(data)).toBe("café");
  });
});

describe("markdownify autolink", () => {
  it("uses angle-bracket autolink when text matches href", () => {
    const doc = parseHtmlDocument(
      '<html><body><a href="https://example.com">https://example.com</a></body></html>',
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toBe("<https://example.com>");
    expect(md).not.toContain("](");
  });

  it("normalizes URI path segments", () => {
    const doc = parseHtmlDocument(
      '<html><body><a href="https://example.com/foo%20bar">link</a></body></html>',
    );
    const md = htmlToMarkdown(doc.body!);
    expect(md).toContain("https://example.com/foo%20bar");
  });

  it("preserves LaTeX backslashes inside math delimiters", () => {
    const doc = parseHtmlDocument("<p>$$\\frac{1}{2}$$</p>");
    const md = htmlToMarkdown(doc.documentElement);
    expect(md).toContain('$$\\frac{1}{2}$$');
    expect(md).not.toContain("\\\\frac");
  });
});

describe("chartXmlToMarkdown", () => {
  it("converts chart cache data to markdown table", () => {
    const chartXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <c:chart>
    <c:title><c:tx><c:strCache><c:pt idx="0"><c:v>Sales</c:v></c:pt></c:strCache></c:tx></c:title>
    <c:plotArea>
      <c:barChart>
        <c:ser>
          <c:tx><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt></c:strCache></c:tx>
          <c:cat><c:strCache>
            <c:pt idx="0"><c:v>Jan</c:v></c:pt>
            <c:pt idx="1"><c:v>Feb</c:v></c:pt>
          </c:strCache></c:cat>
          <c:val><c:numCache>
            <c:pt idx="0"><c:v>10</c:v></c:pt>
            <c:pt idx="1"><c:v>20</c:v></c:pt>
          </c:numCache></c:val>
        </c:ser>
      </c:barChart>
    </c:plotArea>
  </c:chart>
</c:chartSpace>`;

    const markdown = chartXmlToMarkdown(chartXml);
    expect(markdown).toContain("### Chart: Sales");
    expect(markdown).toContain("| Category | Q1 |");
    expect(markdown).toContain("| Jan | 10 |");
    expect(markdown).toContain("| Feb | 20 |");
  });
});

describe("resolveExiftoolPath", () => {
  it("returns configured path when provided", () => {
    expect(resolveExiftoolPath("/usr/bin/exiftool")).toBe("/usr/bin/exiftool");
  });
});

describe("OutlookMsgConverter accepts", () => {
  it("accepts .msg extension without reading OLE magic", async () => {
    const { OutlookMsgConverter } = await import(
      "../src/converters/outlook-msg-converter.js"
    );
    const { StreamInfo } = await import("../src/stream-info.js");
    const converter = new OutlookMsgConverter();
    const data = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

    expect(
      await converter.accepts(
        data,
        new StreamInfo({ extension: ".msg", mimetype: "application/vnd.ms-outlook" }),
      ),
    ).toBe(true);
  });

  it("does not treat .xls files as Outlook messages", async () => {
    const { buildMinimalXls } = await import("./fixtures/build-office-fixtures.js");
    const { OutlookMsgConverter } = await import(
      "../src/converters/outlook-msg-converter.js"
    );
    const { StreamInfo } = await import("../src/stream-info.js");
    const data = await buildMinimalXls([
      ["Item", "Qty"],
      ["Bolt", "7"],
    ]);
    const converter = new OutlookMsgConverter();

    expect(
      await converter.accepts(
        data,
        new StreamInfo({ extension: ".xls", mimetype: "application/vnd.ms-excel" }),
      ),
    ).toBe(false);
  });
});
