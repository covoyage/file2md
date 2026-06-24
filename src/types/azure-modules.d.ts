declare module "@azure/ai-content-understanding" {
  export class ContentUnderstandingClient {
    constructor(endpoint: string, credential: unknown);
    beginAnalyzeBinary(
      analyzerId: string,
      data: Uint8Array,
      options?: { contentType?: string },
    ): Promise<{ pollUntilDone(): Promise<unknown> }>;
  }
  export function toLlmInput(result: unknown): string;
}

declare module "@azure/core-auth" {
  export class AzureKeyCredential {
    constructor(key: string);
  }
}

declare module "@azure/identity" {
  export class DefaultAzureCredential {
    getToken(
      scopes: string | string[],
    ): Promise<{ token: string; expiresOnTimestamp?: number } | null>;
  }
}

declare module "jschardet" {
  interface DetectResult {
    encoding?: string | null;
    confidence?: number;
  }

  export function detect(input: Uint8Array | string): DetectResult;
  const defaultExport: { detect: typeof detect };
  export default defaultExport;
}
