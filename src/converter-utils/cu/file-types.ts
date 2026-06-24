export enum ContentUnderstandingFileType {
  PDF = "pdf",
  DOCX = "docx",
  PPTX = "pptx",
  XLSX = "xlsx",
  HTML = "html",
  TXT = "txt",
  MD = "md",
  RTF = "rtf",
  XML = "xml",
  EML = "eml",
  MSG = "msg",
  JPEG = "jpeg",
  PNG = "png",
  BMP = "bmp",
  TIFF = "tiff",
  HEIF = "heif",
  MP4 = "mp4",
  M4V = "m4v",
  MOV = "mov",
  AVI = "avi",
  MKV = "mkv",
  WEBM = "webm",
  FLV = "flv",
  WMV = "wmv",
  WAV = "wav",
  MP3 = "mp3",
  M4A = "m4a",
  FLAC = "flac",
  OGG = "ogg",
  AAC = "aac",
  WMA = "wma",
}

export const EXTENSION_TO_FILE_TYPE: Record<string, ContentUnderstandingFileType> =
  {
    ".pdf": ContentUnderstandingFileType.PDF,
    ".docx": ContentUnderstandingFileType.DOCX,
    ".pptx": ContentUnderstandingFileType.PPTX,
    ".xlsx": ContentUnderstandingFileType.XLSX,
    ".html": ContentUnderstandingFileType.HTML,
    ".htm": ContentUnderstandingFileType.HTML,
    ".txt": ContentUnderstandingFileType.TXT,
    ".md": ContentUnderstandingFileType.MD,
    ".markdown": ContentUnderstandingFileType.MD,
    ".rtf": ContentUnderstandingFileType.RTF,
    ".xml": ContentUnderstandingFileType.XML,
    ".eml": ContentUnderstandingFileType.EML,
    ".msg": ContentUnderstandingFileType.MSG,
    ".jpg": ContentUnderstandingFileType.JPEG,
    ".jpeg": ContentUnderstandingFileType.JPEG,
    ".jpe": ContentUnderstandingFileType.JPEG,
    ".png": ContentUnderstandingFileType.PNG,
    ".bmp": ContentUnderstandingFileType.BMP,
    ".tif": ContentUnderstandingFileType.TIFF,
    ".tiff": ContentUnderstandingFileType.TIFF,
    ".heif": ContentUnderstandingFileType.HEIF,
    ".heic": ContentUnderstandingFileType.HEIF,
    ".mp4": ContentUnderstandingFileType.MP4,
    ".m4v": ContentUnderstandingFileType.M4V,
    ".mov": ContentUnderstandingFileType.MOV,
    ".avi": ContentUnderstandingFileType.AVI,
    ".mkv": ContentUnderstandingFileType.MKV,
    ".webm": ContentUnderstandingFileType.WEBM,
    ".flv": ContentUnderstandingFileType.FLV,
    ".wmv": ContentUnderstandingFileType.WMV,
    ".wav": ContentUnderstandingFileType.WAV,
    ".mp3": ContentUnderstandingFileType.MP3,
    ".m4a": ContentUnderstandingFileType.M4A,
    ".flac": ContentUnderstandingFileType.FLAC,
    ".ogg": ContentUnderstandingFileType.OGG,
    ".aac": ContentUnderstandingFileType.AAC,
    ".wma": ContentUnderstandingFileType.WMA,
  };

export const MIME_PREFIXES: Record<ContentUnderstandingFileType, string[]> = {
  [ContentUnderstandingFileType.PDF]: ["application/pdf", "application/x-pdf"],
  [ContentUnderstandingFileType.DOCX]: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  [ContentUnderstandingFileType.PPTX]: [
    "application/vnd.openxmlformats-officedocument.presentationml",
  ],
  [ContentUnderstandingFileType.XLSX]: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  [ContentUnderstandingFileType.HTML]: ["text/html", "application/xhtml+xml"],
  [ContentUnderstandingFileType.TXT]: ["text/plain"],
  [ContentUnderstandingFileType.MD]: ["text/markdown"],
  [ContentUnderstandingFileType.RTF]: ["text/rtf", "application/rtf"],
  [ContentUnderstandingFileType.XML]: ["text/xml", "application/xml"],
  [ContentUnderstandingFileType.EML]: ["message/rfc822"],
  [ContentUnderstandingFileType.MSG]: ["application/vnd.ms-outlook"],
  [ContentUnderstandingFileType.JPEG]: ["image/jpeg"],
  [ContentUnderstandingFileType.PNG]: ["image/png"],
  [ContentUnderstandingFileType.BMP]: ["image/bmp"],
  [ContentUnderstandingFileType.TIFF]: ["image/tiff"],
  [ContentUnderstandingFileType.HEIF]: ["image/heif", "image/heic"],
  [ContentUnderstandingFileType.MP4]: ["video/mp4"],
  [ContentUnderstandingFileType.M4V]: ["video/x-m4v"],
  [ContentUnderstandingFileType.MOV]: ["video/quicktime"],
  [ContentUnderstandingFileType.AVI]: ["video/x-msvideo"],
  [ContentUnderstandingFileType.MKV]: ["video/x-matroska"],
  [ContentUnderstandingFileType.WEBM]: ["video/webm"],
  [ContentUnderstandingFileType.FLV]: ["video/x-flv"],
  [ContentUnderstandingFileType.WMV]: ["video/x-ms-wmv"],
  [ContentUnderstandingFileType.WAV]: ["audio/wav", "audio/x-wav"],
  [ContentUnderstandingFileType.MP3]: ["audio/mpeg", "audio/mp3"],
  [ContentUnderstandingFileType.M4A]: ["audio/mp4", "audio/m4a", "audio/x-m4a"],
  [ContentUnderstandingFileType.FLAC]: ["audio/flac", "audio/x-flac"],
  [ContentUnderstandingFileType.OGG]: ["audio/ogg"],
  [ContentUnderstandingFileType.AAC]: ["audio/aac"],
  [ContentUnderstandingFileType.WMA]: ["audio/x-ms-wma"],
};

export const MIME_ALIASES: Record<string, string> = {
  "audio/x-wav": "audio/wav",
  "audio/x-flac": "audio/flac",
  "audio/x-m4a": "audio/mp4",
  "video/x-m4v": "video/mp4",
};

const DOCUMENT_TYPES = new Set<ContentUnderstandingFileType>([
  ContentUnderstandingFileType.PDF,
  ContentUnderstandingFileType.DOCX,
  ContentUnderstandingFileType.PPTX,
  ContentUnderstandingFileType.XLSX,
  ContentUnderstandingFileType.HTML,
  ContentUnderstandingFileType.TXT,
  ContentUnderstandingFileType.MD,
  ContentUnderstandingFileType.RTF,
  ContentUnderstandingFileType.XML,
  ContentUnderstandingFileType.EML,
  ContentUnderstandingFileType.MSG,
]);

const IMAGE_TYPES = new Set<ContentUnderstandingFileType>([
  ContentUnderstandingFileType.JPEG,
  ContentUnderstandingFileType.PNG,
  ContentUnderstandingFileType.BMP,
  ContentUnderstandingFileType.TIFF,
  ContentUnderstandingFileType.HEIF,
]);

const VIDEO_TYPES = new Set<ContentUnderstandingFileType>([
  ContentUnderstandingFileType.MP4,
  ContentUnderstandingFileType.M4V,
  ContentUnderstandingFileType.MOV,
  ContentUnderstandingFileType.AVI,
  ContentUnderstandingFileType.MKV,
  ContentUnderstandingFileType.WEBM,
  ContentUnderstandingFileType.FLV,
  ContentUnderstandingFileType.WMV,
]);

const AUDIO_TYPES = new Set<ContentUnderstandingFileType>([
  ContentUnderstandingFileType.WAV,
  ContentUnderstandingFileType.MP3,
  ContentUnderstandingFileType.M4A,
  ContentUnderstandingFileType.FLAC,
  ContentUnderstandingFileType.OGG,
  ContentUnderstandingFileType.AAC,
  ContentUnderstandingFileType.WMA,
]);

export type CuModality = "document" | "image" | "video" | "audio";

export function cleanMimeType(mimetype: string | null | undefined): string {
  return (mimetype ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function canonicalMimeType(mimetype: string | null | undefined): string {
  const cleaned = cleanMimeType(mimetype);
  return MIME_ALIASES[cleaned] ?? cleaned;
}

export function getCuModality(
  fileType: ContentUnderstandingFileType,
): CuModality {
  if (DOCUMENT_TYPES.has(fileType)) return "document";
  if (IMAGE_TYPES.has(fileType)) return "image";
  if (VIDEO_TYPES.has(fileType)) return "video";
  if (AUDIO_TYPES.has(fileType)) return "audio";
  throw new Error(`Unknown Content Understanding file type: ${fileType}`);
}

function detectFromMime(
  mimetype: string,
  allowed: Set<ContentUnderstandingFileType> | null,
): ContentUnderstandingFileType | null {
  for (const [candidate, prefixes] of Object.entries(MIME_PREFIXES) as Array<
    [ContentUnderstandingFileType, string[]]
  >) {
    if (allowed && !allowed.has(candidate)) continue;
    for (const prefix of prefixes) {
      if (mimetype.startsWith(prefix)) return candidate;
    }
  }
  return null;
}

export function detectCuFileType(
  streamInfo: { extension?: string | null; mimetype?: string | null },
  allowed: ContentUnderstandingFileType[],
): ContentUnderstandingFileType | null {
  const allowedSet = new Set(allowed);
  const extension = (streamInfo.extension ?? "").toLowerCase();
  const fromExtension = EXTENSION_TO_FILE_TYPE[extension];
  if (fromExtension && allowedSet.has(fromExtension)) {
    return fromExtension;
  }

  const mimetype = canonicalMimeType(streamInfo.mimetype);
  if (!mimetype) return null;

  return detectFromMime(mimetype, allowedSet);
}

export function contentTypeFor(
  fileType: ContentUnderstandingFileType,
  mimetype: string | null | undefined,
): string {
  const prefixes = MIME_PREFIXES[fileType] ?? [];
  const canonical = canonicalMimeType(mimetype);

  if (prefixes.length > 0 && canonical && canonical !== "application/octet-stream") {
    for (const prefix of prefixes) {
      if (canonical.startsWith(prefix)) return canonical;
    }
  }

  if (prefixes[0]) {
    return canonicalMimeType(prefixes[0]);
  }

  return canonical || "application/octet-stream";
}
