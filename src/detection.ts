import { detectTextCharsetAsync } from "./utils/charset.js";
import { StreamInfo } from "./stream-info.js";
import {
  guessMimeTypeFromExtension,
  toUint8Array,
} from "./utils.js";
import type { BinaryInput } from "./types.js";

interface MagikaOutputFields {
  label?: string;
  mime_type?: string;
  mimeType?: string;
  extensions?: string[];
  is_text?: boolean;
}

interface MagikaPrediction {
  output?: MagikaOutputFields;
  status?: string;
}

type MagikaInstance = {
  identifyBytes(data: Uint8Array): Promise<MagikaPrediction | MagikaOutputFields>;
};

let magikaInstance: MagikaInstance | null = null;
let magikaLoadAttempted = false;
let magikaEnabled = false;

export function setMagikaDetectionEnabled(enabled: boolean): void {
  magikaEnabled = enabled;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function ensureMagika(): Promise<MagikaInstance | null> {
  if (!magikaEnabled) return null;
  if (magikaInstance) return magikaInstance;
  if (magikaLoadAttempted) return null;

  magikaLoadAttempted = true;

  const loaded = await withTimeout(
    (async () => {
      try {
        const mod = (await import("magika")) as Record<string, unknown>;
        const defaultExport = mod.default as Record<string, unknown> | undefined;
        const MagikaCtor = (mod.MagikaNode ??
          mod.Magika ??
          defaultExport?.Magika) as
          | (new () => {
              load?(): Promise<void>;
              identifyBytes(data: Uint8Array): Promise<unknown>;
            })
          | {
              create(): Promise<MagikaInstance>;
            }
          | undefined;
        if (!MagikaCtor) return null;

        if (typeof MagikaCtor === "function" && "create" in MagikaCtor) {
          return await (
            MagikaCtor as { create(): Promise<MagikaInstance> }
          ).create();
        }

        const instance = new (
          MagikaCtor as new () => {
            load?(): Promise<void>;
            identifyBytes(data: Uint8Array): Promise<unknown>;
          }
        )();
        if (typeof instance.load === "function") {
          await instance.load();
        }
        return instance as MagikaInstance;
      } catch {
        return null;
      }
    })(),
    3000,
  );

  magikaInstance = loaded;
  return magikaInstance;
}

async function guessCharsetAsync(data: Uint8Array): Promise<string | null> {
  return detectTextCharsetAsync(data);
}

function enhanceBaseGuess(baseGuess: StreamInfo): StreamInfo {
  let enhanced = baseGuess.copyAndUpdate();

  if (!baseGuess.mimetype && baseGuess.extension) {
    const mime = guessMimeTypeFromExtension(baseGuess.extension);
    if (mime) enhanced = enhanced.copyAndUpdate({ mimetype: mime });
  }

  if (baseGuess.mimetype && !baseGuess.extension) {
    const ext = extensionFromMime(baseGuess.mimetype);
    if (ext) enhanced = enhanced.copyAndUpdate({ extension: ext });
  }

  return enhanced;
}

export async function getStreamInfoGuesses(
  data: Uint8Array,
  baseGuess: StreamInfo,
): Promise<StreamInfo[]> {
  const enhanced = enhanceBaseGuess(baseGuess);
  const guesses: StreamInfo[] = [];

  const magika = await ensureMagika();
  if (!magika) {
    let guess = enhanced;
    if (!guess.charset && guess.mimetype?.startsWith("text/")) {
      guess = guess.copyAndUpdate({
        charset: await guessCharsetAsync(data),
      });
    }
    guesses.push(guess);
    return guesses;
  }

  try {
    const result = await withTimeout(magika.identifyBytes(data), 2000);
    if (!result) {
      guesses.push(enhanced);
      return guesses;
    }

    const output = (
      "output" in result && result.output ? result.output : result
    ) as MagikaOutputFields;
    const label = output.label;
    const mimeType = output.mime_type ?? output.mimeType;
    const extensions = output.extensions ?? [];
    const isText = output.is_text ?? false;

    if (!label || label === "unknown") {
      guesses.push(enhanced);
      return guesses;
    }

    const charset = isText ? await guessCharsetAsync(data) : null;
    const guessedExtension =
      extensions.length > 0 ? `.${extensions[0]}` : null;

    let compatible = true;
    if (baseGuess.mimetype && mimeType && baseGuess.mimetype !== mimeType) {
      compatible = false;
    }
    if (
      baseGuess.extension &&
      extensions.length > 0 &&
      !extensions.includes(baseGuess.extension.replace(/^\./, ""))
    ) {
      compatible = false;
    }

    if (compatible) {
      guesses.push(
        new StreamInfo({
          mimetype: baseGuess.mimetype ?? mimeType ?? null,
          extension: baseGuess.extension ?? guessedExtension,
          charset: baseGuess.charset ?? charset,
          filename: baseGuess.filename,
          localPath: baseGuess.localPath,
          url: baseGuess.url,
        }),
      );
    } else {
      guesses.push(enhanced);
      guesses.push(
        new StreamInfo({
          mimetype: mimeType ?? null,
          extension: guessedExtension,
          charset,
          filename: baseGuess.filename,
          localPath: baseGuess.localPath,
          url: baseGuess.url,
        }),
      );
    }
  } catch {
    guesses.push(enhanced);
  }

  return guesses;
}

function extensionFromMime(mimetype: string): string | null {
  const map: Record<string, string> = {
    "text/plain": ".txt",
    "text/html": ".html",
    "text/csv": ".csv",
    "application/json": ".json",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
  };
  return map[mimetype] ?? null;
}

export async function normalizeInput(input: BinaryInput): Promise<Uint8Array> {
  return toUint8Array(input);
}
