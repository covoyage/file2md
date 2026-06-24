import type { YouTubeTranscriptFetcher } from "../types.js";

let defaultFetcher: YouTubeTranscriptFetcher | null = null;
let fetcherLoadAttempted = false;

async function retryOperation<T>(
  operation: () => Promise<T>,
  retries = 3,
  delayMs = 2000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

export async function getDefaultYouTubeTranscriptFetcher(): Promise<YouTubeTranscriptFetcher | null> {
  if (defaultFetcher) return defaultFetcher;
  if (fetcherLoadAttempted) return null;
  fetcherLoadAttempted = true;

  try {
    const mod = await import("youtube-transcript-plus");
    const fetchTranscript = mod.fetchTranscript as (
      videoId: string,
      config?: { lang?: string },
    ) => Promise<Array<{ text: string }>>;

    defaultFetcher = async (videoId, languages = ["en"]) => {
      const languageList = [...languages];
      if (!languageList.includes("en")) {
        languageList.push("en");
      }

      try {
        const segments = await retryOperation(() =>
          fetchTranscript(videoId, { lang: languageList[0] }),
        );
        const text = segments.map((segment) => segment.text).join(" ").trim();
        if (text) return text;
      } catch {
        // fall through to per-language attempts
      }

      for (const lang of languageList) {
        try {
          const segments = await fetchTranscript(videoId, { lang });
          const text = segments.map((segment) => segment.text).join(" ").trim();
          if (text) return text;
        } catch {
          // try next language
        }
      }

      return null;
    };
  } catch {
    defaultFetcher = null;
  }

  return defaultFetcher;
}

export function setYouTubeTranscriptFetcher(
  fetcher: YouTubeTranscriptFetcher | null,
): void {
  defaultFetcher = fetcher;
  fetcherLoadAttempted = true;
}
