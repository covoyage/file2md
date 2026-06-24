import type { StreamInfo } from "./stream-info.js";

export class DocumentConverterResult {
  readonly markdown: string;
  readonly title: string | null;

  constructor(markdown: string, options: { title?: string | null } = {}) {
    this.markdown = markdown;
    this.title = options.title ?? null;
  }

  /** @deprecated Use `markdown` instead */
  get textContent(): string {
    return this.markdown;
  }

  /** Snake_case alias for `markdown` (legacy API). */
  get text_content(): string {
    return this.markdown;
  }

  /** @deprecated Use `markdown` instead */
  set textContent(value: string) {
    (this as { markdown: string }).markdown = value;
  }

  toString(): string {
    return this.markdown;
  }
}

export type ConvertOptions = Record<string, unknown>;

export abstract class DocumentConverter {
  abstract accepts(
    data: Uint8Array,
    streamInfo: StreamInfo,
    options?: ConvertOptions,
  ): boolean | Promise<boolean>;

  abstract convert(
    data: Uint8Array,
    streamInfo: StreamInfo,
    options?: ConvertOptions,
  ): DocumentConverterResult | Promise<DocumentConverterResult>;
}
