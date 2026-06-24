import JSZip from "jszip";
import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import { StreamInfo } from "../stream-info.js";
import { getBasename } from "../utils.js";
import {
  getAllTextsByTagName,
  getFirstTextByTagName,
  parseXmlDocument,
} from "../utils/xml.js";
import { HtmlConverter } from "./html-converter.js";

const ACCEPTED_MIMES = [
  "application/epub",
  "application/epub+zip",
  "application/x-epub+zip",
];
const ACCEPTED_EXTENSIONS = [".epub"];

const MIME_TYPE_MAPPING: Record<string, string> = {
  ".html": "text/html",
  ".xhtml": "application/xhtml+xml",
};

export class EpubConverter extends DocumentConverter {
  private readonly htmlConverter = new HtmlConverter();

  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_EXTENSIONS.includes(extension)) return true;
    return ACCEPTED_MIMES.some((p) => mimetype.startsWith(p));
  }

  async convert(
    data: Uint8Array,
    _streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    const zip = await JSZip.loadAsync(data);

    const containerXml = await zip.file("META-INF/container.xml")?.async("string");
    if (!containerXml) {
      throw new Error("Invalid EPUB: missing META-INF/container.xml");
    }

    const containerDom = parseXmlDocument(containerXml);
    const rootfile = containerDom.getElementsByTagName("rootfile")[0];
    const opfPath = rootfile?.getAttribute("full-path");
    if (!opfPath) throw new Error("Invalid EPUB: missing rootfile path");

    const opfContent = await zip.file(opfPath)?.async("string");
    if (!opfContent) throw new Error(`Invalid EPUB: missing ${opfPath}`);

    const opfDom = parseXmlDocument(opfContent);

    const metadata: Record<string, string | string[] | null> = {
      title: getFirstTextByTagName(opfDom, "dc:title"),
      authors: getAllTextsByTagName(opfDom, "dc:creator"),
      language: getFirstTextByTagName(opfDom, "dc:language"),
      publisher: getFirstTextByTagName(opfDom, "dc:publisher"),
      date: getFirstTextByTagName(opfDom, "dc:date"),
      description: getFirstTextByTagName(opfDom, "dc:description"),
      identifier: getFirstTextByTagName(opfDom, "dc:identifier"),
    };

    const manifest = new Map<string, string>();
    for (const item of Array.from(opfDom.getElementsByTagName("item"))) {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (id && href) manifest.set(id, href);
    }

    const basePath = opfPath.includes("/")
      ? opfPath.split("/").slice(0, -1).join("/")
      : "";

    const spine: string[] = [];
    for (const itemref of Array.from(opfDom.getElementsByTagName("itemref"))) {
      const idref = itemref.getAttribute("idref");
      if (!idref) continue;
      const href = manifest.get(idref);
      if (!href) continue;
      spine.push(basePath ? `${basePath}/${href}` : href);
    }

    const markdownParts: string[] = [];

    for (const file of spine) {
      const entry = zip.file(file);
      if (!entry) continue;

      const content = await entry.async("uint8array");
      const filename = getBasename(file);
      const extension = filename.includes(".")
        ? "." + filename.split(".").pop()!.toLowerCase()
        : null;

      const result = this.htmlConverter.convert(
        content,
        new StreamInfo({
          mimetype: extension ? MIME_TYPE_MAPPING[extension] ?? null : null,
          extension,
          filename,
        }),
        options,
      );
      markdownParts.push(result.markdown.trim());
    }

    const metadataLines: string[] = [];
    for (const [key, value] of Object.entries(metadata)) {
      if (!value) continue;
      const display = Array.isArray(value) ? value.join(", ") : value;
      metadataLines.push(`**${key.charAt(0).toUpperCase()}${key.slice(1)}:** ${display}`);
    }

    if (metadataLines.length > 0) {
      markdownParts.unshift(metadataLines.join("\n"));
    }

    const title =
      typeof metadata.title === "string" ? metadata.title : null;

    return new DocumentConverterResult(
      markdownParts.join("\n\n"),
      { title },
    );
  }
}
