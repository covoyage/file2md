import { describe, expect, it } from "vitest";
import {
  escapeLatex,
  oMathElementToLatex,
  OMML_NS,
} from "../src/converter-utils/docx/omml.js";
import { preProcessMath } from "../src/converter-utils/docx/pre-process.js";
import { parseXmlDocument } from "../src/utils/xml.js";
import { parseWav, recognizeGoogleSpeech } from "../src/utils/transcribe-audio.js";

describe("OMML", () => {
  it("escapes LaTeX special characters", () => {
    expect(escapeLatex("a_b")).toBe("a\\_b");
    expect(escapeLatex("100%")).toBe("100\\%");
  });

  it("converts a simple fraction", () => {
    const xml = `<m:oMath xmlns:m="${OMML_NS}">
      <m:f>
        <m:num><m:r><m:t>1</m:t></m:r></m:num>
        <m:den><m:r><m:t>2</m:t></m:r></m:den>
      </m:f>
    </m:oMath>`;
    const doc = parseXmlDocument(xml);
    const oMath = doc.documentElement;
    expect(oMathElementToLatex(oMath)).toBe("\\frac{1}{2}");
  });
});

describe("DOCX preProcessMath", () => {
  it("replaces inline oMath with LaTeX text runs", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="${OMML_NS}">
  <w:body>
    <w:p>
      <m:oMath>
        <m:r><m:t>x</m:t></m:r>
      </m:oMath>
    </w:p>
  </w:body>
</w:document>`;

    const processed = new TextDecoder().decode(preProcessMath(new TextEncoder().encode(xml)));
    expect(processed).toContain("$x$");
    expect(processed).not.toContain("m:oMath");
  });

  it("replaces block oMathPara with display LaTeX", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:m="${OMML_NS}">
  <w:body>
    <w:p>
      <m:oMathPara>
        <m:oMath>
          <m:f>
            <m:num><m:r><m:t>1</m:t></m:r></m:num>
            <m:den><m:r><m:t>2</m:t></m:r></m:den>
          </m:f>
        </m:oMath>
      </m:oMathPara>
    </w:p>
  </w:body>
</w:document>`;

    const processed = new TextDecoder().decode(preProcessMath(new TextEncoder().encode(xml)));
    expect(processed).toContain('$$\\frac{1}{2}$$');
    expect(processed).not.toContain("m:oMathPara");
  });
});

describe("transcribe-audio", () => {
  it("parses 16-bit PCM WAV data", () => {
    const sampleRate = 16000;
    const channels = 1;
    const bitsPerSample = 16;
    const pcm = new Uint8Array([0, 0, 255, 127, 0, 0, 0, 0]);
    const dataChunkSize = pcm.length;
    const buffer = new ArrayBuffer(44 + dataChunkSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    const writeAscii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i++) {
        bytes[offset + i] = text.charCodeAt(i);
      }
    };

    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + dataChunkSize, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
    view.setUint16(32, channels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeAscii(36, "data");
    view.setUint32(40, dataChunkSize, true);
    bytes.set(pcm, 44);

    const parsed = parseWav(bytes);
    expect(parsed.sampleRate).toBe(16000);
    expect(parsed.pcm.length).toBe(8);
  });

  it("parses Google Speech API responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        '{"result":[]}\n{"result":[{"alternative":[{"transcript":"hello world"}],"final":true}]}\n',
      );

    try {
      const transcript = await recognizeGoogleSpeech(
        new Uint8Array([1, 2, 3]),
        "audio/l16; rate=16000",
      );
      expect(transcript).toBe("hello world");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
