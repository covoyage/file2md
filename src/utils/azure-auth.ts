const AZURE_COGNITIVE_SERVICES_SCOPE =
  "https://cognitiveservices.azure.com/.default";

export type AzureCredentialProvider = () => Promise<Record<string, string>>;

export interface AzureAuthOptions {
  credential?: string;
  credentialProvider?: AzureCredentialProvider;
}

let defaultCredentialProvider: AzureCredentialProvider | null = null;
let defaultCredentialLoadAttempted = false;

async function getDefaultAzureCredentialProvider(): Promise<AzureCredentialProvider | null> {
  if (defaultCredentialProvider) return defaultCredentialProvider;
  if (defaultCredentialLoadAttempted) return null;
  defaultCredentialLoadAttempted = true;

  try {
    const { DefaultAzureCredential } = await import("@azure/identity");
    const credential = new DefaultAzureCredential();
    defaultCredentialProvider = async () => {
      const token = await credential.getToken(AZURE_COGNITIVE_SERVICES_SCOPE);
      if (!token?.token) {
        throw new Error("DefaultAzureCredential returned an empty token.");
      }
      return { Authorization: `Bearer ${token.token}` };
    };
  } catch {
    defaultCredentialProvider = null;
  }

  return defaultCredentialProvider;
}

export function setDefaultAzureCredentialProvider(
  provider: AzureCredentialProvider | null,
): void {
  defaultCredentialProvider = provider;
  defaultCredentialLoadAttempted = true;
}

export async function resolveAzureAuthHeaders(
  options: AzureAuthOptions = {},
): Promise<Record<string, string>> {
  if (options.credential) {
    return { "Ocp-Apim-Subscription-Key": options.credential };
  }

  if (options.credentialProvider) {
    return options.credentialProvider();
  }

  const apiKey =
    typeof process !== "undefined" ? process.env.AZURE_API_KEY : undefined;
  if (apiKey) {
    return { "Ocp-Apim-Subscription-Key": apiKey };
  }

  const defaultProvider = await getDefaultAzureCredentialProvider();
  if (defaultProvider) {
    return defaultProvider();
  }

  return {};
}

export async function assertAzureAuthAvailable(
  options: AzureAuthOptions,
  serviceName: string,
): Promise<Record<string, string>> {
  const headers = await resolveAzureAuthHeaders(options);
  if (Object.keys(headers).length === 0) {
    throw new Error(
      `${serviceName} requires docintelCredential/cuCredential, AZURE_API_KEY, ` +
        "azureCredentialProvider, or @azure/identity DefaultAzureCredential.",
    );
  }
  return headers;
}
