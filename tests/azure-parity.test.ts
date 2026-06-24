import { describe, expect, it } from "vitest";
import { File2MD } from "../src/file2md.js";
import {
  cuResultToLlmInput,
  setCuToLlmInputFormatter,
} from "../src/utils/cu-to-llm-input.js";
import {
  resolveAzureAuthHeaders,
  setDefaultAzureCredentialProvider,
} from "../src/utils/azure-auth.js";

describe("resolveAzureAuthHeaders", () => {
  it("uses explicit subscription key", async () => {
    const headers = await resolveAzureAuthHeaders({ credential: "test-key" });
    expect(headers).toEqual({ "Ocp-Apim-Subscription-Key": "test-key" });
  });

  it("uses custom credential provider", async () => {
    const headers = await resolveAzureAuthHeaders({
      credentialProvider: async () => ({ Authorization: "Bearer token" }),
    });
    expect(headers).toEqual({ Authorization: "Bearer token" });
  });
});

describe("cuResultToLlmInput", () => {
  it("formats fields as YAML front matter with markdown body", () => {
    const output = cuResultToLlmInput({
      fields: {
        InvoiceTotal: { value: 42.5 },
        VendorName: { value: "Contoso" },
      },
      contents: [
        {
          pageNumber: 1,
          markdown: "# Invoice\n\nLine items here.",
        },
      ],
    });

    expect(output).toContain("---");
    expect(output).toContain('InvoiceTotal: 42.5');
    expect(output).toContain('VendorName: "Contoso"');
    expect(output).toContain("<!-- Page 1 -->");
    expect(output).toContain("# Invoice");
  });

  it("prefers SDK formatter when configured", async () => {
    setCuToLlmInputFormatter(() => "SDK formatted output");
    const { formatCuResultForLlm } = await import("../src/utils/cu-to-llm-input.js");
    await expect(formatCuResultForLlm({})).resolves.toBe("SDK formatted output");
    setCuToLlmInputFormatter(null);
  });
});

describe("File2MD.convertUrl", () => {
  it("delegates to convertUri for data URIs", async () => {
    const md = new File2MD({ enableMagikaDetection: false });
    const text = "hello";
    const dataUri = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
    const result = await md.convertUrl(dataUri);
    expect(result.markdown).toBe(text);
  });
});

describe("DefaultAzureCredential integration", () => {
  it("can be injected for auth header resolution", async () => {
    setDefaultAzureCredentialProvider(async () => ({
      Authorization: "Bearer injected",
    }));
    const headers = await resolveAzureAuthHeaders({});
    expect(headers).toEqual({ Authorization: "Bearer injected" });
    setDefaultAzureCredentialProvider(null);
  });
});
