import { spawn } from "node:child_process";

export async function convertToFlacWithFfmpeg(
  data: Uint8Array,
  audioFormat: "wav" | "mp3" | "mp4",
): Promise<Uint8Array> {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-f",
    "flac",
    "pipe:1",
  ];

  if (audioFormat !== "wav") {
    args.splice(4, 0, "-f", audioFormat === "mp4" ? "mp4" : audioFormat);
  }

  return runFfmpeg(args, data);
}

async function runFfmpeg(
  args: string[],
  input: Uint8Array,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("ffmpeg not found"));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(new Uint8Array(Buffer.concat(stdout)));
        return;
      }
      const message = Buffer.concat(stderr).toString("utf8").trim();
      reject(new Error(message || `ffmpeg exited with code ${code}`));
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
