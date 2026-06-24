function flattenFields(fields: unknown): Record<string, unknown> {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return {};
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if ("value" in record) {
        out[key] = record.value;
        continue;
      }
      if ("content" in record) {
        out[key] = record.content;
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

function collectFields(result: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  const topLevel = flattenFields(result.fields);
  Object.assign(merged, topLevel);

  const analyzeResult = result.analyzeResult as Record<string, unknown> | undefined;
  if (analyzeResult) {
    Object.assign(merged, flattenFields(analyzeResult.fields));
  }

  const contents = result.contents as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(contents)) {
    for (const item of contents) {
      Object.assign(merged, flattenFields(item.fields));
    }
  }

  return merged;
}

function collectMarkdownParts(result: Record<string, unknown>): string[] {
  const parts: string[] = [];

  const pushMarkdown = (value: unknown, pageNumber?: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    if (pageNumber !== undefined && pageNumber !== null && pageNumber !== "") {
      parts.push(`<!-- Page ${pageNumber} -->\n\n${value.trim()}`);
    } else {
      parts.push(value.trim());
    }
  };

  pushMarkdown(result.markdown);
  pushMarkdown(result.content);

  const analyzeResult = result.analyzeResult as Record<string, unknown> | undefined;
  if (analyzeResult) {
    pushMarkdown(analyzeResult.content);
    pushMarkdown(analyzeResult.markdown);
  }

  const contents = result.contents as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(contents)) {
    for (const item of contents) {
      pushMarkdown(item.markdown, item.pageNumber);
      pushMarkdown(item.text, item.pageNumber);
      pushMarkdown(item.content, item.pageNumber);
    }
  }

  return parts;
}

function toSimpleYaml(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (value === null) {
      lines.push(`${key}: null`);
      continue;
    }
    if (typeof value === "string") {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      lines.push(`${key}: "${escaped}"`);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${String(value)}`);
      continue;
    }
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  return lines.join("\n");
}

export function cuResultToLlmInput(result: Record<string, unknown>): string {
  const fields = collectFields(result);
  const markdownParts = collectMarkdownParts(result);
  const parts: string[] = [];

  if (Object.keys(fields).length > 0) {
    parts.push(`---\n${toSimpleYaml(fields)}\n---`);
  }

  if (markdownParts.length > 0) {
    parts.push(markdownParts.join("\n\n"));
  }

  if (parts.length > 0) {
    return parts.join("\n\n").trim();
  }

  return "```yaml\n" + JSON.stringify(result, null, 2) + "\n```";
}

let sdkFormatter: ((result: unknown) => string) | null = null;
let sdkFormatterLoadAttempted = false;

async function getSdkToLlmInput(): Promise<((result: unknown) => string) | null> {
  if (sdkFormatter) return sdkFormatter;
  if (sdkFormatterLoadAttempted) return null;
  sdkFormatterLoadAttempted = true;

  try {
    const mod = await import("@azure/ai-content-understanding");
    const formatter = mod.toLlmInput as ((result: unknown) => string) | undefined;
    if (typeof formatter === "function") {
      sdkFormatter = formatter;
      return sdkFormatter;
    }
  } catch {
    sdkFormatter = null;
  }

  return null;
}

export async function formatCuResultForLlm(
  result: Record<string, unknown>,
): Promise<string> {
  const formatter = await getSdkToLlmInput();
  if (formatter) {
    try {
      return formatter(result);
    } catch {
      // fall back to built-in formatter
    }
  }
  return cuResultToLlmInput(result);
}

export function setCuToLlmInputFormatter(
  formatter: ((result: unknown) => string) | null,
): void {
  sdkFormatter = formatter;
  sdkFormatterLoadAttempted = true;
}
