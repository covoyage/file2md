export interface StreamInfoData {
  mimetype?: string | null;
  extension?: string | null;
  charset?: string | null;
  filename?: string | null;
  localPath?: string | null;
  url?: string | null;
}

export class StreamInfo {
  readonly mimetype: string | null;
  readonly extension: string | null;
  readonly charset: string | null;
  readonly filename: string | null;
  readonly localPath: string | null;
  readonly url: string | null;

  constructor(data: StreamInfoData = {}) {
    this.mimetype = data.mimetype ?? null;
    this.extension = data.extension ?? null;
    this.charset = data.charset ?? null;
    this.filename = data.filename ?? null;
    this.localPath = data.localPath ?? null;
    this.url = data.url ?? null;
  }

  copyAndUpdate(partial: StreamInfoData = {}): StreamInfo {
    return new StreamInfo({
      mimetype: partial.mimetype ?? this.mimetype,
      extension: partial.extension ?? this.extension,
      charset: partial.charset ?? this.charset,
      filename: partial.filename ?? this.filename,
      localPath: partial.localPath ?? this.localPath,
      url: partial.url ?? this.url,
    });
  }
}

export function mergeStreamInfo(
  base: StreamInfo,
  partial: StreamInfoData,
): StreamInfo {
  return new StreamInfo({
    mimetype: partial.mimetype ?? base.mimetype,
    extension: partial.extension ?? base.extension,
    charset: partial.charset ?? base.charset,
    filename: partial.filename ?? base.filename,
    localPath: partial.localPath ?? base.localPath,
    url: partial.url ?? base.url,
  });
}
