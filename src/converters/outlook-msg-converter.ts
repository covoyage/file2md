import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import {
  MissingDependencyException,
  MISSING_DEPENDENCY_MESSAGE,
} from "../exceptions.js";
import type { StreamInfo } from "../stream-info.js";

const ACCEPTED_MIMES = ["application/vnd.ms-outlook"];
const ACCEPTED_EXTENSIONS = [".msg"];

interface MsgRecipient {
  name?: string;
  email?: string;
  recipType?: string;
}

interface MsgReaderInstance {
  getFileData(): {
    subject?: string;
    senderName?: string;
    senderEmail?: string;
    body?: string;
    headers?: string | Array<{ name?: string; value?: string }>;
    recipients?: MsgRecipient[];
  };
}

function parseHeaderValue(
  headers: string | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const match = headers.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function formatRecipients(
  recipients: MsgRecipient[] | undefined,
  type: string,
): string | undefined {
  const emails = (recipients ?? [])
    .filter((recipient) => recipient.recipType === type)
    .map((recipient) => recipient.email || recipient.name)
    .filter((value): value is string => Boolean(value));
  return emails.length > 0 ? emails.join(", ") : undefined;
}

function getHeaderValue(
  headers: string | Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (typeof headers === "string") {
    return parseHeaderValue(headers, name);
  }
  return headers.find((header) => header.name === name)?.value;
}

interface MsgReaderConstructor {
  new (buffer: ArrayBuffer | Uint8Array): MsgReaderInstance;
}

async function loadMsgReader(): Promise<MsgReaderConstructor> {
  try {
    const mod = await import("@kenjiuno/msgreader");
    const candidate = mod.default ?? mod;
    const MsgReader =
      typeof candidate === "function"
        ? candidate
        : (candidate as { default?: MsgReaderConstructor }).default;
    if (!MsgReader) {
      throw new Error("MsgReader export not found");
    }
    return MsgReader as MsgReaderConstructor;
  } catch (error) {
    if (error instanceof MissingDependencyException) {
      throw error;
    }
    throw new MissingDependencyException(
      MISSING_DEPENDENCY_MESSAGE.replace("{converter}", "OutlookMsgConverter")
        .replaceAll("{extension}", ".msg")
        .replace("{feature}", "@kenjiuno/msgreader"),
    );
  }
}

function isOleFile(data: Uint8Array): boolean {
  return (
    data.length >= 8 &&
    data[0] === 0xd0 &&
    data[1] === 0xcf &&
    data[2] === 0x11 &&
    data[3] === 0xe0
  );
}

export class OutlookMsgConverter extends DocumentConverter {
  accepts(data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_EXTENSIONS.includes(extension)) return true;
    if (ACCEPTED_MIMES.some((prefix) => mimetype.startsWith(prefix))) {
      return true;
    }

    if (extension && extension !== ".msg") {
      return false;
    }

    return isOleFile(data);
  }

  async convert(data: Uint8Array): Promise<DocumentConverterResult> {
    const MsgReader = await loadMsgReader();
    const reader = new MsgReader(data);
    const info = reader.getFileData();

    let md = "# Email Message\n\n";

    const from =
      info.senderEmail ??
      info.senderName ??
      getHeaderValue(info.headers, "From");
    const to =
      formatRecipients(info.recipients, "to") ??
      getHeaderValue(info.headers, "To");
    const subject = info.subject;

    if (from) md += `**From:** ${from}\n`;
    if (to) md += `**To:** ${to}\n`;
    if (subject) md += `**Subject:** ${subject}\n`;

    md += "\n## Content\n\n";
    if (info.body) md += info.body;

    return new DocumentConverterResult(md.trim(), { title: subject ?? null });
  }
}
