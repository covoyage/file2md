import type { AzureAuthOptions } from "./azure-auth.js";
import {
  assertAzureAuthAvailable,
  resolveAzureAuthHeaders,
} from "./azure-auth.js";

export interface CuAnalyzeOptions {
  endpoint: string;
  analyzerId: string;
  data: Uint8Array;
  contentType: string;
  authOptions: AzureAuthOptions;
}

let sdkAnalyze:
  | ((options: CuAnalyzeOptions) => Promise<Record<string, unknown>>)
  | null = null;
let sdkAnalyzeLoadAttempted = false;

async function getSdkAnalyze():
  Promise<((options: CuAnalyzeOptions) => Promise<Record<string, unknown>>) | null> {
  if (sdkAnalyze) return sdkAnalyze;
  if (sdkAnalyzeLoadAttempted) return null;
  sdkAnalyzeLoadAttempted = true;

  try {
    const [{ ContentUnderstandingClient }, { AzureKeyCredential }, identity] =
      await Promise.all([
        import("@azure/ai-content-understanding"),
        import("@azure/core-auth"),
        import("@azure/identity").catch(() => null),
      ]);

    sdkAnalyze = async (options) => {
      const credential = await buildSdkCredential(options.authOptions, {
        AzureKeyCredential,
        DefaultAzureCredential: identity?.DefaultAzureCredential,
      });
      const client = new ContentUnderstandingClient(options.endpoint, credential);
      const poller = await client.beginAnalyzeBinary(
        options.analyzerId,
        options.data,
        { contentType: options.contentType },
      );
      const result = await poller.pollUntilDone();
      return result as unknown as Record<string, unknown>;
    };
    return sdkAnalyze;
  } catch {
    sdkAnalyze = null;
    return null;
  }
}

async function buildSdkCredential(
  authOptions: AzureAuthOptions,
  modules: {
    AzureKeyCredential: new (key: string) => unknown;
    DefaultAzureCredential?: new () => {
      getToken(scopes: string | string[]): Promise<{ token: string } | null>;
    };
  },
): Promise<unknown> {
  if (authOptions.credential) {
    return new modules.AzureKeyCredential(authOptions.credential);
  }

  const apiKey =
    typeof process !== "undefined" ? process.env.AZURE_API_KEY : undefined;
  if (apiKey) {
    return new modules.AzureKeyCredential(apiKey);
  }

  if (authOptions.credentialProvider) {
    const headers = await authOptions.credentialProvider();
    const bearer = headers.Authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (bearer) {
      return {
        getToken: async () => ({ token: bearer, expiresOnTimestamp: Date.now() + 3600_000 }),
      };
    }
  }

  if (modules.DefaultAzureCredential) {
    return new modules.DefaultAzureCredential();
  }

  throw new Error("No Azure credential available for Content Understanding SDK.");
}

export function setCuSdkAnalyze(
  analyze:
    | ((options: CuAnalyzeOptions) => Promise<Record<string, unknown>>)
    | null,
): void {
  sdkAnalyze = analyze;
  sdkAnalyzeLoadAttempted = true;
}

async function analyzeWithRest(
  options: CuAnalyzeOptions,
): Promise<Record<string, unknown>> {
  const authHeaders = await assertAzureAuthAvailable(
    options.authOptions,
    "ContentUnderstandingConverter",
  );

  const analyzeUrl =
    `${options.endpoint.replace(/\/$/, "")}/contentunderstanding/analyzers/` +
    `${encodeURIComponent(options.analyzerId)}:analyze?api-version=2025-05-01-preview`;

  const startResponse = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": options.contentType,
      ...authHeaders,
    },
    body: options.data as unknown as BodyInit,
  });

  if (!startResponse.ok) {
    throw new Error(
      `Content Understanding analyze failed: HTTP ${startResponse.status}`,
    );
  }

  const operationLocation = startResponse.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Content Understanding response missing operation-location.");
  }

  return pollCuOperation(operationLocation, authHeaders);
}

async function pollCuOperation(
  operationLocation: string,
  authHeaders: Record<string, string>,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 120; attempt++) {
    const response = await fetch(operationLocation, {
      headers: authHeaders,
    });
    if (!response.ok) {
      throw new Error(`Content Understanding poll failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      status?: string;
      result?: Record<string, unknown>;
    };

    if (payload.status === "Succeeded" || payload.status === "succeeded") {
      return payload.result ?? payload;
    }
    if (payload.status === "Failed" || payload.status === "failed") {
      throw new Error("Content Understanding analysis failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Content Understanding analysis timed out.");
}

export async function analyzeWithContentUnderstanding(
  options: CuAnalyzeOptions,
): Promise<Record<string, unknown>> {
  const sdk = await getSdkAnalyze();
  if (sdk) {
    try {
      return await sdk(options);
    } catch {
      // fall back to REST
    }
  }
  return analyzeWithRest(options);
}

export async function fetchAnalyzerInfo(
  endpoint: string,
  analyzerId: string,
  authOptions: AzureAuthOptions,
): Promise<{ baseAnalyzerId?: string }> {
  const authHeaders = await resolveAzureAuthHeaders(authOptions);
  const url =
    `${endpoint.replace(/\/$/, "")}/contentunderstanding/analyzers/` +
    `${encodeURIComponent(analyzerId)}?api-version=2025-05-01-preview`;

  const response = await fetch(url, { headers: authHeaders });
  if (!response.ok) {
    throw new Error(
      `Failed to resolve analyzer '${analyzerId}': HTTP ${response.status}`,
    );
  }

  return (await response.json()) as { baseAnalyzerId?: string };
}
