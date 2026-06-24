import { MissingDependencyException } from "../exceptions.js";

export type TranscribeAudioFn = (
  data: Uint8Array,
  audioFormat: "wav" | "mp3" | "mp4",
) => Promise<string>;

const MISSING_AUDIO_MESSAGE =
  "Speech transcription requires ffmpeg (for mp3/mp4) or a custom transcribeAudio implementation. Install ffmpeg and ensure it is on PATH, or provide File2MDOptions.transcribeAudio.";

const MISSING_FFMPEG_MESSAGE =
  "Converting mp3/mp4 audio requires ffmpeg on PATH. Install ffmpeg or provide File2MDOptions.transcribeAudio.";

interface ParsedWav {
  pcm: Uint8Array;
  sampleRate: number;
  channels: number;
}

function readAscii(data: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("ascii").decode(data.slice(offset, offset + length));
}

export function parseWav(data: Uint8Array): ParsedWav {
  if (data.length < 44 || readAscii(data, 0, 4) !== "RIFF") {
    throw new Error("Invalid WAV file");
  }
  if (readAscii(data, 8, 4) !== "WAVE") {
    throw new Error("Invalid WAV file");
  }

  let offset = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bitsPerSample = 16;
  let pcm: Uint8Array | null = null;

  while (offset + 8 <= data.length) {
    const chunkId = readAscii(data, offset, 4);
    const chunkSize =
      data[offset + 4]! |
      (data[offset + 5]! << 8) |
      (data[offset + 6]! << 16) |
      (data[offset + 7]! << 24);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt ") {
      channels = data[chunkDataStart + 2]! | (data[chunkDataStart + 3]! << 8);
      sampleRate =
        data[chunkDataStart + 4]! |
        (data[chunkDataStart + 5]! << 8) |
        (data[chunkDataStart + 6]! << 16) |
        (data[chunkDataStart + 7]! << 24);
      bitsPerSample =
        data[chunkDataStart + 14]! |
        (data[chunkDataStart + 15]! << 8);
    } else if (chunkId === "data") {
      pcm = data.slice(chunkDataStart, chunkDataStart + chunkSize);
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }

  if (!pcm || bitsPerSample !== 16) {
    throw new Error("Unsupported WAV format (expected 16-bit PCM)");
  }

  return { pcm, sampleRate, channels };
}

export async function recognizeGoogleSpeech(
  audioData: Uint8Array,
  contentType: string,
  language = "en-US",
): Promise<string> {
  const url = `https://www.google.com/speech-api/v2/recognize?client=chromium&lang=${encodeURIComponent(language)}&key=`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
    },
    body: audioData as BodyInit,
  });

  if (!response.ok) {
    throw new Error(`Google Speech API error: ${response.status}`);
  }

  const text = await response.text();
  const transcripts: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        result?: Array<{
          alternative?: Array<{ transcript?: string }>;
        }>;
      };
      for (const result of parsed.result ?? []) {
        const transcript = result.alternative?.[0]?.transcript?.trim();
        if (transcript) transcripts.push(transcript);
      }
    } catch {
      // Ignore malformed JSON lines.
    }
  }

  return transcripts.join(" ").trim();
}

function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions?.node === "string"
  );
}

async function defaultTranscribeAudio(
  data: Uint8Array,
  audioFormat: "wav" | "mp3" | "mp4",
): Promise<string> {
  if (!isNodeRuntime()) {
    throw new MissingDependencyException(MISSING_AUDIO_MESSAGE);
  }

  const { convertToFlacWithFfmpeg } = await import("./transcribe-audio-node.js");

  try {
    if (audioFormat === "wav") {
      try {
        const wav = parseWav(data);
        const transcript = await recognizeGoogleSpeech(
          wav.pcm,
          `audio/l16; rate=${wav.sampleRate}`,
        );
        return transcript || "[No speech detected]";
      } catch {
        const flac = await convertToFlacWithFfmpeg(data, "wav");
        const transcript = await recognizeGoogleSpeech(
          flac,
          "audio/x-flac; rate=16000",
        );
        return transcript || "[No speech detected]";
      }
    }

    const flac = await convertToFlacWithFfmpeg(data, audioFormat);
    const transcript = await recognizeGoogleSpeech(
      flac,
      "audio/x-flac; rate=16000",
    );
    return transcript || "[No speech detected]";
  } catch (error) {
    if (
      error instanceof Error &&
      /ffmpeg not found|ENOENT|spawn ffmpeg/i.test(error.message)
    ) {
      throw new MissingDependencyException(MISSING_FFMPEG_MESSAGE);
    }
    throw error;
  }
}

export async function transcribeAudio(
  data: Uint8Array,
  audioFormat: "wav" | "mp3" | "mp4",
  transcribeFn?: TranscribeAudioFn,
): Promise<string> {
  if (transcribeFn) {
    return transcribeFn(data, audioFormat);
  }

  return defaultTranscribeAudio(data, audioFormat);
}

export function detectAudioFormat(
  extension: string | null,
  mimetype: string | null,
): "wav" | "mp3" | "mp4" | null {
  const ext = (extension ?? "").toLowerCase();
  const mime = (mimetype ?? "").toLowerCase();

  if (ext === ".wav" || mime === "audio/x-wav" || mime === "audio/wav") {
    return "wav";
  }
  if (ext === ".mp3" || mime === "audio/mpeg") {
    return "mp3";
  }
  if (ext === ".mp4" || ext === ".m4a" || mime === "video/mp4" || mime === "audio/mp4") {
    return "mp4";
  }
  return null;
}
