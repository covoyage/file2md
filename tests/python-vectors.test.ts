import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { File2MD } from "../src/file2md.js";

const vectorsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/vectors",
);

interface VectorCase {
  file: string;
  mimetype: string;
  charset?: string;
  url?: string;
  mustInclude: string[];
  mustNotInclude?: string[];
}

const TEXT_VECTORS: VectorCase[] = [
  {
    file: "test.json",
    mimetype: "application/json",
    charset: "ascii",
    mustInclude: [
      "5b64c88c-b3c3-4510-bcb8-da0b200602d8",
      "9700dc99-6685-40b4-9a3a-5e406dcb37f3",
    ],
  },
  {
    file: "test_mskanji.csv",
    mimetype: "text/csv",
    charset: "cp932",
    mustInclude: [
      "| 名前 | 年齢 | 住所 |",
      "| 佐藤太郎 | 30 | 東京 |",
      "| 髙橋淳 | 35 | 名古屋 |",
    ],
  },
  {
    file: "test_rss.xml",
    mimetype: "text/xml",
    charset: "utf-8",
    mustInclude: [
      "# The Official Microsoft Blog",
      "## Ignite 2024: Why nearly 70% of the Fortune 500 now use Microsoft 365 Copilot",
      "In the case of AI, it is absolutely true that the industry is moving incredibly fast",
    ],
    mustNotInclude: ["<rss", "<feed"],
  },
  {
    file: "test_notebook.ipynb",
    mimetype: "application/json",
    charset: "ascii",
    mustInclude: [
      "# Test Notebook",
      "```python",
      'print("file2md")',
      "## Code Cell Below",
    ],
    mustNotInclude: ["nbformat", "nbformat_minor"],
  },
  {
    file: "test_blog.html",
    mimetype: "text/html",
    charset: "utf-8",
    url: "https://microsoft.github.io/autogen/blog/2023/04/21/LLM-tuning-math",
    mustInclude: [
      "Large language models (LLMs) are powerful tools that can generate natural language texts for various applications, such as chatbots, summarization, translation, and more. GPT-4 is currently the state of the art LLM in the world. Is model selection irrelevant? What about inference parameters?",
      "an example where high cost can easily prevent a generic complex",
    ],
  },
  {
    file: "test_wikipedia.html",
    mimetype: "text/html",
    charset: "utf-8",
    url: "https://en.wikipedia.org/wiki/Microsoft",
    mustInclude: [
      "Microsoft entered the operating system (OS) business in 1980 with its own version of [Unix]",
      "Microsoft was founded by",
      "Bill Gates",
    ],
    mustNotInclude: [
      "You are encouraged to create an account and log in",
      "154 languages",
      "move to sidebar",
    ],
  },
  {
    file: "test_serp.html",
    mimetype: "text/html",
    charset: "utf-8",
    url: "https://www.bing.com/search?q=microsoft+wikipedia",
    mustInclude: [
      "en.wikipedia.org/wiki/Microsoft",
      "Microsoft Corporation is **an American multinational corporation and technology company headquartered** in Redmond",
      "Windows 95",
    ],
    mustNotInclude: [
      "https://www.bing.com/ck/a?!&&p=",
      "data:image/svg+xml,%3Csvg%20width%3D",
    ],
  },
];

describe("text vectors", () => {
  const md = () => new File2MD({ enableMagikaDetection: false });

  for (const vector of TEXT_VECTORS) {
    it(`converts ${vector.file}`, async () => {
      const data = new Uint8Array(
        await readFile(join(vectorsDir, vector.file)),
      );
      const extension = "." + vector.file.split(".").pop()!;

      const result = await md().convertStream(data, {
        streamInfo: {
          extension,
          mimetype: vector.mimetype,
          charset: vector.charset ?? null,
          filename: vector.file,
          url: vector.url ?? null,
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
