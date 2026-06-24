import { parseXmlDocument } from "../../utils/xml.js";
import { rowsToMarkdownTable } from "../../utils.js";

function localName(element: Element): string {
  const name = element.localName ?? element.tagName;
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(colon + 1) : name;
}

function walkElements(
  root: Element | Document,
  visit: (element: Element) => void,
): void {
  const start =
    "documentElement" in root && root.documentElement
      ? root.documentElement
      : (root as Element);
  if (!start) return;

  const stack: Element[] = [start];
  while (stack.length > 0) {
    const element = stack.pop()!;
    visit(element);
    for (const child of Array.from(element.children)) {
      stack.push(child);
    }
  }
}

function elementsByLocalName(root: Element | Document, name: string): Element[] {
  const results: Element[] = [];
  walkElements(root, (element) => {
    if (localName(element) === name) {
      results.push(element);
    }
  });
  return results;
}

function readCacheValues(parent: Element, valueTag: "strCache" | "numCache"): string[] {
  for (const cache of elementsByLocalName(parent, valueTag)) {
    const points = elementsByLocalName(cache, "pt")
      .map((pt) => ({
        idx: Number.parseInt(pt.getAttribute("idx") ?? "0", 10),
        value:
          pt.getAttribute("v") ??
          elementsByLocalName(pt, "v")[0]?.textContent?.trim() ??
          "",
      }))
      .sort((a, b) => a.idx - b.idx)
      .map((point) => point.value);
    if (points.length > 0) return points;
  }
  return [];
}

function readSeriesName(series: Element): string {
  for (const tx of elementsByLocalName(series, "tx")) {
    const values = readCacheValues(tx, "strCache");
    if (values[0]) return values[0];
    const text = tx.textContent?.trim();
    if (text) return text;
  }
  return "Series";
}

function readSeriesValues(series: Element): string[] {
  for (const val of elementsByLocalName(series, "val")) {
    const numbers = readCacheValues(val, "numCache");
    if (numbers.length > 0) return numbers;
    const strings = readCacheValues(val, "strCache");
    if (strings.length > 0) return strings;
  }
  return [];
}

function readCategories(series: Element): string[] {
  for (const cat of elementsByLocalName(series, "cat")) {
    const strings = readCacheValues(cat, "strCache");
    if (strings.length > 0) return strings;
    const numbers = readCacheValues(cat, "numCache");
    if (numbers.length > 0) return numbers;
  }
  return [];
}

function readChartTitle(chartRoot: Element): string | null {
  for (const title of elementsByLocalName(chartRoot, "title")) {
    for (const textNode of elementsByLocalName(title, "t")) {
      const text = textNode.textContent?.trim();
      if (text) return text;
    }
    const cache = readCacheValues(title, "strCache");
    if (cache[0]) return cache[0];
  }
  return null;
}

export function chartXmlToMarkdown(chartXml: string): string | null {
  try {
    const doc = parseXmlDocument(chartXml);
    const chartRoot =
      elementsByLocalName(doc, "chart")[0] ?? doc.documentElement;
    const series = elementsByLocalName(chartRoot, "ser");
    if (series.length === 0) return null;

    const categoryNames = readCategories(series[0]!);
    const seriesNames = series.map((item) => readSeriesName(item));
    const rows: string[][] = [["Category", ...seriesNames]];

    const maxLen = Math.max(
      categoryNames.length,
      ...series.map((item) => readSeriesValues(item).length),
    );

    for (let i = 0; i < maxLen; i++) {
      const row = [categoryNames[i] ?? String(i + 1)];
      for (const item of series) {
        row.push(readSeriesValues(item)[i] ?? "");
      }
      rows.push(row);
    }

    let markdown = "\n\n### Chart";
    const title = readChartTitle(chartRoot);
    if (title) markdown += `: ${title}`;
    markdown += "\n\n" + rowsToMarkdownTable(rows) + "\n";
    return markdown;
  } catch {
    return "\n\n[unsupported chart]\n\n";
  }
}

export function isChartGraphicFrame(element: Element): boolean {
  for (const graphicData of elementsByLocalName(element, "graphicData")) {
    const uri = graphicData.getAttribute("uri") ?? "";
    if (uri.includes("/chart")) return true;
  }
  return elementsByLocalName(element, "chart").length > 0;
}

export function getChartRelationshipId(element: Element): string | null {
  for (const chart of elementsByLocalName(element, "chart")) {
    const relId =
      chart.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ) ?? chart.getAttribute("r:id");
    if (relId) return relId;
  }
  return null;
}
