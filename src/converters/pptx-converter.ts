import JSZip from "jszip";
import type { ConvertOptions } from "../base-converter.js";
import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import { MissingDependencyException, MISSING_DEPENDENCY_MESSAGE } from "../exceptions.js";
import { StreamInfo } from "../stream-info.js";
import { rowsToMarkdownTable } from "../utils.js";
import { llmCaption, type LlmClient } from "../utils/llm-caption.js";
import {
  findElementsByLocalName,
  findFirstByLocalName,
  getRelationshipAttribute,
  getRelationshipId,
  localTagName,
  parseXmlDocument,
} from "../utils/xml.js";
import {
  chartXmlToMarkdown,
  getChartRelationshipId,
  isChartGraphicFrame,
} from "../converter-utils/pptx/chart.js";

const ACCEPTED_MIMES = [
  "application/vnd.openxmlformats-officedocument.presentationml",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const ACCEPTED_EXTENSIONS = [".pptx"];

interface ShapePosition {
  top: number;
  left: number;
}

export class PptxConverter extends DocumentConverter {
  accepts(_data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_EXTENSIONS.includes(extension)) return true;
    return ACCEPTED_MIMES.some((prefix) => mimetype.startsWith(prefix));
  }

  async convert(
    data: Uint8Array,
    _streamInfo: StreamInfo,
    options: ConvertOptions = {},
  ): Promise<DocumentConverterResult> {
    try {
      const zip = await JSZip.loadAsync(data);
      const slidePaths = await this.getSlidePaths(zip);
      let mdContent = "";
      let slideNum = 0;

      for (const slidePath of slidePaths) {
        slideNum++;
        mdContent += `\n\n<!-- Slide number: ${slideNum} -->\n`;

        const slideXml = await zip.file(slidePath)?.async("string");
        if (!slideXml) continue;

        const notesPath = await this.getNotesPath(zip, slidePath);
        mdContent += await this.convertSlideXml(
          slideXml,
          zip,
          slidePath,
          options,
        );

        if (notesPath) {
          const notesXml = await zip.file(notesPath)?.async("string");
          if (notesXml) {
            mdContent += `\n\n### Notes:\n${this.extractNotesBody(notesXml)}`;
          }
        }

        mdContent = mdContent.trim();
      }

      return new DocumentConverterResult(mdContent.trim());
    } catch (error) {
      if (
        error instanceof Error &&
        /Cannot find module|jszip/i.test(error.message)
      ) {
        throw new MissingDependencyException(
          MISSING_DEPENDENCY_MESSAGE.replace("{converter}", "PptxConverter")
            .replaceAll("{extension}", ".pptx")
            .replace("{feature}", "jszip"),
        );
      }
      throw error;
    }
  }

  private async getSlidePaths(zip: JSZip): Promise<string[]> {
    const presentationXml = await zip
      .file("ppt/presentation.xml")
      ?.async("string");
    if (!presentationXml) return [];

    const relsXml = await zip
      .file("ppt/_rels/presentation.xml.rels")
      ?.async("string");
    if (!relsXml) return [];

    const relMap = this.parseRelationships(relsXml, "ppt/");
    const doc = parseXmlDocument(presentationXml);
    const slideIds = findElementsByLocalName(doc, "sldId");

    const paths: string[] = [];
    for (const slideId of slideIds) {
      const relId = getRelationshipId(slideId);
      if (relId && relMap[relId]) {
        paths.push(relMap[relId]!);
      }
    }
    return paths;
  }

  private async getNotesPath(
    zip: JSZip,
    slidePath: string,
  ): Promise<string | null> {
    const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relsXml = await zip.file(relsPath)?.async("string");
    if (!relsXml) return null;

    const relMap = this.parseRelationships(relsXml, "ppt/slides/");
    for (const target of Object.values(relMap)) {
      if (target.includes("notesSlides/")) {
        return target.startsWith("ppt/") ? target : `ppt/slides/${target}`;
      }
    }
    return null;
  }

  private parseRelationships(
    relsXml: string,
    basePath: string,
  ): Record<string, string> {
    const doc = parseXmlDocument(relsXml);
    const map: Record<string, string> = {};

    for (const rel of findElementsByLocalName(doc, "Relationship")) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      if (!id || !target) continue;

      if (target.startsWith("/")) {
        map[id] = target.slice(1);
      } else if (target.startsWith("../")) {
        const normalizedBase = basePath.replace(/\/$/, "");
        const parent = normalizedBase.split("/").slice(0, -1).join("/");
        map[id] = `${parent}/${target.replace(/^\.\.\//, "")}`;
      } else {
        map[id] = `${basePath}${target}`;
      }
    }

    return map;
  }

  private async convertSlideXml(
    slideXml: string,
    zip: JSZip,
    slidePath: string,
    options: ConvertOptions,
  ): Promise<string> {
    const doc = parseXmlDocument(slideXml);
    const spTree = findFirstByLocalName(doc, "spTree");
    if (!spTree) return this.extractTextFromSlide(slideXml);

    const relsPath =
      slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
    const relsXml = await zip.file(relsPath)?.async("string");
    const relMap = relsXml
      ? this.parseRelationships(relsXml, "ppt/slides/")
      : {};

    const elements = this.collectSortedElements(spTree);
    let markdown = "";

    for (const element of elements) {
      const name = localTagName(element);

      if (name === "sp") {
        const isTitle = this.isTitleShape(element);
        const text = this.extractTextFromShape(element);
        if (!text.trim()) {
          markdown += "\n";
          continue;
        }

        if (isTitle && !markdown.includes("# ")) {
          markdown += "# " + text.trimStart() + "\n";
        } else {
          markdown += text + "\n";
        }
      } else if (name === "pic") {
        const imageMd = await this.convertPicture(element, zip, options);
        if (imageMd) markdown += imageMd;
      } else if (name === "graphicFrame") {
        const chartMd = await this.convertChart(element, zip, relMap);
        if (chartMd) {
          markdown += chartMd;
        } else {
          const tableMd = this.convertTable(element, options);
          if (tableMd) markdown += tableMd;
        }
      } else if (name === "grpSp") {
        const groupMd = await this.convertGroup(element, zip, relMap, options);
        if (groupMd) markdown += groupMd;
      }
    }

    return markdown;
  }

  private collectSortedElements(container: Element): Element[] {
    const elements: Array<{ element: Element; position: ShapePosition }> = [];

    for (const child of Array.from(container.children)) {
      const name = localTagName(child);
      if (name === "sp" || name === "pic" || name === "graphicFrame" || name === "grpSp") {
        elements.push({
          element: child,
          position: this.getShapePosition(child),
        });
      }
    }

    elements.sort((a, b) => {
      if (a.position.top !== b.position.top) {
        return a.position.top - b.position.top;
      }
      return a.position.left - b.position.left;
    });

    return elements.map((item) => item.element);
  }

  private getShapePosition(element: Element): ShapePosition {
    const xfrm =
      findFirstByLocalName(element, "off") ?? element.querySelector("off");
    const top = Number.parseInt(xfrm?.getAttribute("y") ?? "0", 10);
    const left = Number.parseInt(xfrm?.getAttribute("x") ?? "0", 10);
    return {
      top: Number.isFinite(top) ? top : Number.MAX_SAFE_INTEGER,
      left: Number.isFinite(left) ? left : Number.MAX_SAFE_INTEGER,
    };
  }

  private isTitleShape(element: Element): boolean {
    const placeholder = findFirstByLocalName(element, "ph");
    const type = placeholder?.getAttribute("type");
    return type === "title" || type === "ctrTitle";
  }

  private extractTextFromShape(element: Element): string {
    const txBody = findFirstByLocalName(element, "txBody");
    if (txBody) {
      const paragraphs: string[] = [];
      for (const paragraph of findElementsByLocalName(txBody, "p")) {
        const texts: string[] = [];
        for (const textNode of findElementsByLocalName(paragraph, "t")) {
          const text = textNode.textContent ?? "";
          if (text) texts.push(text);
        }
        paragraphs.push(texts.join(""));
      }
      if (paragraphs.some((line) => line.trim().length > 0)) {
        return paragraphs.join("\n");
      }
    }

    const texts: string[] = [];
    for (const textNode of findElementsByLocalName(element, "t")) {
      const text = textNode.textContent ?? "";
      if (text) texts.push(text);
    }
    return texts.join("");
  }

  private extractTextFromSlide(slideXml: string): string {
    const doc = parseXmlDocument(slideXml);
    const texts: string[] = [];
    for (const textNode of findElementsByLocalName(doc, "t")) {
      const text = textNode.textContent ?? "";
      if (text) texts.push(text);
    }
    return texts.join("\n");
  }

  private extractNotesBody(notesXml: string): string {
    const doc = parseXmlDocument(notesXml);
    const spTree = findFirstByLocalName(doc, "spTree");
    if (!spTree) return "";

    for (const shape of findElementsByLocalName(spTree, "sp")) {
      const placeholder = findFirstByLocalName(shape, "ph");
      const type = placeholder?.getAttribute("type");
      if (type && type !== "body") continue;
      return this.extractTextFromShape(shape);
    }

    return "";
  }

  private async convertChart(
    element: Element,
    zip: JSZip,
    relMap: Record<string, string>,
  ): Promise<string | null> {
    if (!isChartGraphicFrame(element)) return null;

    const relId = getChartRelationshipId(element);
    if (!relId || !relMap[relId]) {
      return "\n\n[unsupported chart]\n\n";
    }

    const chartPath = relMap[relId]!.startsWith("ppt/")
      ? relMap[relId]!
      : `ppt/slides/${relMap[relId]}`;
    const chartXml = await zip.file(chartPath)?.async("string");
    if (!chartXml) {
      return "\n\n[unsupported chart]\n\n";
    }

    return chartXmlToMarkdown(chartXml);
  }

  private async convertPicture(
    element: Element,
    zip: JSZip,
    options: ConvertOptions,
  ): Promise<string> {
    const cNvPr = findFirstByLocalName(element, "cNvPr");
    const descr = cNvPr?.getAttribute("descr") ?? "";
    const name = cNvPr?.getAttribute("name") ?? "image";

    let altText = descr || name;
    altText = altText.replace(/[\r\n[\]]/g, " ").replace(/\s+/g, " ").trim();

    const llmClient = options.llmClient as LlmClient | undefined;
    const llmModel = options.llmModel as string | undefined;

    if (llmClient && llmModel) {
      const embedId = this.getBlipEmbedId(element);
      if (embedId) {
        const imageData = await this.getEmbeddedImage(zip, embedId);
        if (imageData) {
          const description = await llmCaption(imageData.data, imageData.info, {
            client: llmClient,
            model: llmModel,
            prompt: options.llmPrompt as string | undefined,
          });
          if (description) {
            altText = [description, altText].filter(Boolean).join("\n");
            altText = altText.replace(/[\r\n[\]]/g, " ").replace(/\s+/g, " ").trim();
          }
        }
      }
    }

    if (options.keepDataUris === true) {
      const embedId = this.getBlipEmbedId(element);
      if (embedId) {
        const imageData = await this.getEmbeddedImage(zip, embedId);
        if (imageData) {
          const base64 = Buffer.from(imageData.data).toString("base64");
          const mime = imageData.info.mimetype ?? "image/png";
          return `\n![${altText}](data:${mime};base64,${base64})\n`;
        }
      }
    }

    const filename = name.replace(/\W/g, "") + ".jpg";
    return `\n![${altText}](${filename})\n`;
  }

  private getBlipEmbedId(element: Element): string | null {
    const blip = findFirstByLocalName(element, "blip");
    return blip ? getRelationshipAttribute(blip, "embed") : null;
  }

  private async getEmbeddedImage(
    zip: JSZip,
    embedId: string,
  ): Promise<{ data: Uint8Array; info: StreamInfo } | null> {
    for (const path of Object.keys(zip.files)) {
      if (!path.endsWith(".rels") || !path.includes("slides/_rels/")) continue;
      const relsXml = await zip.file(path)?.async("string");
      if (!relsXml) continue;
      const relMap = this.parseRelationships(relsXml, path.replace("/_rels/", "/").replace(/\.rels$/, "/"));
      const target = relMap[embedId];
      if (!target) continue;

      const mediaPath = target.startsWith("../")
        ? `ppt/${target.replace(/^\.\.\//, "")}`
        : target;
      const file = zip.file(mediaPath);
      if (!file) continue;

      const data = await file.async("uint8array");
      const filename = mediaPath.split("/").pop() ?? "image.png";
      const extension = filename.includes(".")
        ? "." + filename.split(".").pop()!.toLowerCase()
        : ".png";

      return {
        data,
        info: new StreamInfo({
          filename,
          extension,
        }),
      };
    }

    return null;
  }

  private convertTable(element: Element, _options: ConvertOptions): string {
    const rows = findElementsByLocalName(element, "tr");
    if (rows.length === 0) return "";

    const tableRows: string[][] = [];

    for (const row of rows) {
      const cells = findElementsByLocalName(row, "tc");
      const rowValues: string[] = [];

      for (const cell of cells) {
        const texts: string[] = [];
        for (const textNode of findElementsByLocalName(cell, "t")) {
          texts.push(textNode.textContent ?? "");
        }
        rowValues.push(texts.join(""));
      }

      if (rowValues.some((value) => value.length > 0)) {
        tableRows.push(rowValues);
      }
    }

    if (tableRows.length === 0) return "";

    return `${rowsToMarkdownTable(tableRows)}\n`;
  }

  private async convertGroup(
    element: Element,
    zip: JSZip,
    relMap: Record<string, string>,
    options: ConvertOptions,
  ): Promise<string> {
    let markdown = "";
    for (const child of this.collectSortedElements(element)) {
      const name = localTagName(child);
      if (name === "sp") {
        const text = this.extractTextFromShape(child).trim();
        if (text) markdown += text + "\n";
      } else if (name === "pic") {
        const imageMd = await this.convertPicture(child, zip, options);
        if (imageMd) markdown += imageMd;
      } else if (name === "grpSp") {
        const nested = await this.convertGroup(child, zip, relMap, options);
        if (nested) markdown += nested;
      } else if (name === "graphicFrame") {
        const chartMd = await this.convertChart(child, zip, relMap);
        if (chartMd) {
          markdown += chartMd;
        } else {
          const tableMd = this.convertTable(child, options);
          if (tableMd) markdown += tableMd;
        }
      }
    }
    return markdown.trim();
  }
}
