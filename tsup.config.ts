import { defineConfig } from "tsup";

function applyCjsImportMetaPolyfill(
  options: { banner?: { js?: string }; define?: Record<string, string> },
  format: string | undefined,
): void {
  if (format !== "cjs") return;

  options.banner = {
    js: `${options.banner?.js ?? ""}var __importMetaUrl=require("url").pathToFileURL(__filename).href;`,
  };
  options.define = {
    ...options.define,
    "import.meta.url": "__importMetaUrl",
  };
}

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/utils/transcribe-audio-node.ts",
      "src/plugin-discovery-node.ts",
      "src/utils/pdf-pdftotext-node.ts",
      "src/utils/pdf-pdfminer-node.ts",
      "src/utils/pdf-plumber-node.ts",
      "src/utils/xlsx-pandas-node.ts",
      "src/utils/import-node-util.ts",
      "src/utils/resolve-exiftool-node.ts",
    ],
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    target: "es2022",
    platform: "neutral",
    esbuildOptions(options, context) {
      applyCjsImportMetaPolyfill(options, context.format);
    },
    external: [
      "jszip",
      "linkedom",
      "mammoth",
      "turndown",
      "xlsx",
      "magika",
      "pdfjs-dist",
      "@kenjiuno/msgreader",
      "youtube-transcript-plus",
      "@azure/identity",
      "@azure/core-auth",
      "@azure/ai-content-understanding",
      "jschardet",
      "./transcribe-audio-node.js",
      "../utils/transcribe-audio-node.js",
      "./plugin-discovery-node.js",
      "../plugin-discovery-node.js",
      "./utils/pdf-pdftotext-node.js",
      "../utils/pdf-pdftotext-node.js",
      "./utils/resolve-exiftool-node.js",
      "../utils/resolve-exiftool-node.js",
    ],
  },
  {
    entry: [
      "src/cli.ts",
      "src/utils/transcribe-audio-node.ts",
      "src/plugin-discovery-node.ts",
      "src/utils/pdf-pdftotext-node.ts",
      "src/utils/pdf-pdfminer-node.ts",
      "src/utils/pdf-plumber-node.ts",
      "src/utils/xlsx-pandas-node.ts",
      "src/utils/import-node-util.ts",
    ],
    format: ["cjs"],
    sourcemap: true,
    target: "node18",
    platform: "node",
    outDir: "dist",
    esbuildOptions(options, context) {
      applyCjsImportMetaPolyfill(options, context.format);
    },
    external: [
      "jszip",
      "linkedom",
      "mammoth",
      "turndown",
      "xlsx",
      "magika",
      "pdfjs-dist",
      "@kenjiuno/msgreader",
      "youtube-transcript-plus",
      "@azure/identity",
      "@azure/core-auth",
      "@azure/ai-content-understanding",
      "jschardet",
      "./transcribe-audio-node.js",
      "../utils/transcribe-audio-node.js",
      "./plugin-discovery-node.js",
      "../plugin-discovery-node.js",
      "./utils/pdf-pdftotext-node.js",
      "../utils/pdf-pdftotext-node.js",
      "./utils/resolve-exiftool-node.js",
      "../utils/resolve-exiftool-node.js",
    ],
  },
]);
