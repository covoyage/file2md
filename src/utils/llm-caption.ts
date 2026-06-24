import type { StreamInfo } from "../stream-info.js";

/** OpenAI-compatible chat client with completions.create */
export interface LlmClient {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: unknown[];
      }): Promise<{
        choices: Array<{ message: { content: string | null } }>;
      }>;
    };
  };
}

export async function llmCaption(
  data: Uint8Array,
  streamInfo: StreamInfo,
  options: {
    client: LlmClient;
    model: string;
    prompt?: string | null;
  },
): Promise<string | null> {
  const prompt =
    options.prompt?.trim() || "Write a detailed caption for this image.";

  let contentType = streamInfo.mimetype;
  if (!contentType && streamInfo.extension) {
    const ext = streamInfo.extension.toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";
  }
  contentType ??= "application/octet-stream";

  let base64Image: string;
  try {
    base64Image = uint8ArrayToBase64(data);
  } catch {
    return null;
  }

  const dataUri = `data:${contentType};base64,${base64Image}`;

  const response = await options.client.chat.completions.create({
    model: options.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content ?? null;
}

function uint8ArrayToBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }

  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}
