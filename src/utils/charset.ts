const SAMPLE_SIZE = 4096;
const CHARDET_MIN_CONFIDENCE = 0.7;

let chardetDetector:
  | ((input: Uint8Array | string) => { encoding: string | null; confidence: number })
  | null = null;
let chardetLoadAttempted = false;

function uint8ArrayToBinaryString(data: Uint8Array): string {
  let result = "";
  const limit = Math.min(data.length, SAMPLE_SIZE);
  for (let i = 0; i < limit; i++) {
    result += String.fromCharCode(data[i]!);
  }
  return result;
}

async function detectWithChardet(
  data: Uint8Array,
): Promise<string | null> {
  if (chardetDetector) {
    const result = chardetDetector(data);
    return normalizeEncodingLabel(result.encoding, result.confidence);
  }
  if (chardetLoadAttempted) return null;
  chardetLoadAttempted = true;

  try {
    const mod = await import("jschardet");
    const detect = mod.default?.detect ?? mod.detect;
    if (typeof detect !== "function") return null;

    chardetDetector = (input: Uint8Array | string) => {
      const sample =
        typeof input === "string"
          ? input
          : typeof Buffer !== "undefined"
            ? Buffer.from(input.subarray(0, SAMPLE_SIZE))
            : uint8ArrayToBinaryString(input);
      const result = detect(sample) as {
        encoding?: string | null;
        confidence?: number;
      };
      return {
        encoding: result.encoding ?? null,
        confidence: result.confidence ?? 0,
      };
    };
    const detected = chardetDetector(data);
    return normalizeEncodingLabel(detected.encoding, detected.confidence);
  } catch {
    chardetDetector = null;
    return null;
  }
}

export function setChardetDetector(
  detector:
    | ((input: Uint8Array | string) => {
        encoding: string | null;
        confidence: number;
      })
    | null,
): void {
  chardetDetector = detector;
  chardetLoadAttempted = true;
}

function normalizeEncodingLabel(
  encoding: string | null | undefined,
  confidence = 1,
): string | null {
  if (!encoding || confidence < CHARDET_MIN_CONFIDENCE) return null;

  const normalized = encoding.trim().toLowerCase().replace(/_/g, "-");
  const aliases: Record<string, string> = {
    ascii: "utf-8",
    utf8: "utf-8",
    "iso-8859-1": "iso-8859-1",
    "iso8859-1": "iso-8859-1",
    "windows-1252": "windows-1252",
    "windows-1251": "windows-1251",
    "windows-1250": "windows-1250",
    gb2312: "gb18030",
    gbk: "gb18030",
    gb18030: "gb18030",
    big5: "big5",
    "shift-jis": "shift_jis",
    shiftjis: "shift_jis",
    "euc-kr": "euc-kr",
    euckr: "euc-kr",
    "euc-jp": "euc-jp",
    "utf-16": "utf-16le",
    "utf-16le": "utf-16le",
    "utf-16be": "utf-16be",
  };

  return aliases[normalized] ?? normalized;
}

function isValidUtf8(data: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(
      data.subarray(0, Math.min(data.length, SAMPLE_SIZE)),
    );
    return true;
  } catch {
    return false;
  }
}

function looksLikeGbk(data: Uint8Array): boolean {
  let pairs = 0;
  let invalid = 0;
  const limit = Math.min(data.length, SAMPLE_SIZE);

  for (let i = 0; i < limit; ) {
    const byte = data[i]!;
    if (byte <= 0x7f) {
      i++;
      continue;
    }
    if (i + 1 >= limit) {
      invalid++;
      break;
    }
    const next = data[i + 1]!;
    if (byte >= 0x81 && byte <= 0xfe && next >= 0x40 && next <= 0xfe) {
      pairs++;
      i += 2;
      continue;
    }
    invalid++;
    i++;
  }

  return pairs > 0 && invalid === 0;
}

function looksLikeShiftJis(data: Uint8Array): boolean {
  let pairs = 0;
  let invalid = 0;
  const limit = Math.min(data.length, SAMPLE_SIZE);

  for (let i = 0; i < limit; ) {
    const byte = data[i]!;
    if (byte <= 0x7f || (byte >= 0xa1 && byte <= 0xdf)) {
      i++;
      continue;
    }
    if (i + 1 >= limit) {
      invalid++;
      break;
    }
    const next = data[i + 1]!;
    const leadValid =
      (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xfc);
    const trailValid =
      (next >= 0x40 && next <= 0x7e) || (next >= 0x80 && next <= 0xfc);
    if (leadValid && trailValid) {
      pairs++;
      i += 2;
      continue;
    }
    invalid++;
    i++;
  }

  return pairs > 0 && invalid === 0;
}

function looksLikeEucKr(data: Uint8Array): boolean {
  let pairs = 0;
  let invalid = 0;
  const limit = Math.min(data.length, SAMPLE_SIZE);

  for (let i = 0; i < limit; ) {
    const byte = data[i]!;
    if (byte <= 0x7f) {
      i++;
      continue;
    }
    if (i + 1 >= limit) {
      invalid++;
      break;
    }
    const next = data[i + 1]!;
    if (byte >= 0xa1 && byte <= 0xfe && next >= 0xa1 && next <= 0xfe) {
      pairs++;
      i += 2;
      continue;
    }
    invalid++;
    i++;
  }

  return pairs > 0 && invalid === 0;
}

function preferShiftJisOverGbk(data: Uint8Array): boolean {
  const limit = Math.min(data.length, SAMPLE_SIZE);

  for (let i = 0; i < limit; ) {
    const byte = data[i]!;
    if (byte <= 0x7f || (byte >= 0xa1 && byte <= 0xdf)) {
      i++;
      continue;
    }
    if (i + 1 >= limit) return false;

    const next = data[i + 1]!;
    const shiftLead =
      (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xfc);
    const shiftTrail =
      (next >= 0x40 && next <= 0x7e) || (next >= 0x80 && next <= 0xfc);

    if (shiftLead && shiftTrail) {
      if (byte >= 0xa1) return false;
      i += 2;
      continue;
    }

    return false;
  }

  return true;
}

function detectWithHeuristics(data: Uint8Array): string {
  if (looksLikeShiftJis(data) && preferShiftJisOverGbk(data)) {
    return "shift_jis";
  }
  if (looksLikeGbk(data)) return "gb18030";
  if (looksLikeShiftJis(data)) return "shift_jis";
  if (looksLikeEucKr(data)) return "euc-kr";
  return "latin1";
}

export function detectTextCharset(data: Uint8Array): string {
  if (
    data.length >= 3 &&
    data[0] === 0xef &&
    data[1] === 0xbb &&
    data[2] === 0xbf
  ) {
    return "utf-8";
  }

  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return "utf-16le";
  }

  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return "utf-16be";
  }

  if (isValidUtf8(data)) {
    return "utf-8";
  }

  return detectWithHeuristics(data);
}

export async function detectTextCharsetAsync(
  data: Uint8Array,
): Promise<string> {
  if (
    data.length >= 3 &&
    data[0] === 0xef &&
    data[1] === 0xbb &&
    data[2] === 0xbf
  ) {
    return "utf-8";
  }

  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    return "utf-16le";
  }

  if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    return "utf-16be";
  }

  if (isValidUtf8(data)) {
    return "utf-8";
  }

  const fromChardet = await detectWithChardet(data);
  if (fromChardet) return fromChardet;

  return detectWithHeuristics(data);
}
