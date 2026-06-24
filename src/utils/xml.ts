import { DOMParser as LinkedomDOMParser } from "linkedom";

export function localTagName(elm: Element): string {
  const name = elm.localName ?? elm.tagName;
  const colon = name.indexOf(":");
  return colon >= 0 ? name.slice(colon + 1) : name;
}

function walkElements(
  root: Document | Element,
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
    const children = Array.from(element.children);
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]!);
    }
  }
}

export function findElementsByLocalName(
  root: Document | Element,
  name: string,
): Element[] {
  const results: Element[] = [];
  walkElements(root, (element) => {
    if (localTagName(element) === name) {
      results.push(element);
    }
  });
  return results;
}

export function findFirstByLocalName(
  root: Document | Element,
  name: string,
): Element | null {
  return findElementsByLocalName(root, name)[0] ?? null;
}

const RELATIONSHIPS_ATTR_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function getRelationshipId(element: Element): string | null {
  return getRelationshipAttribute(element, "id");
}

export function getRelationshipAttribute(
  element: Element,
  localName: string,
): string | null {
  const prefixed = element.getAttribute(`r:${localName}`);
  if (prefixed) return prefixed;

  return element.getAttributeNS(RELATIONSHIPS_ATTR_NS, localName);
}

export function parseXmlDocument(xml: string): Document {
  if (typeof DOMParser !== "undefined") {
    return new DOMParser().parseFromString(xml, "text/xml");
  }

  return new LinkedomDOMParser().parseFromString(
    xml,
    "text/xml",
  ) as unknown as Document;
}

export function getFirstTextByTagName(
  element: Element | Document,
  tagName: string,
): string | null {
  const nodes = element.getElementsByTagName(tagName);
  if (nodes.length > 0) {
    const text = nodes[0]?.textContent?.trim();
    if (text) return text;
  }

  for (const node of findElementsByLocalName(element, tagName)) {
    const text = node.textContent?.trim();
    if (text) return text;
  }

  return null;
}

export function getAllTextsByTagName(
  element: Element | Document,
  tagName: string,
): string[] {
  const texts: string[] = [];
  for (const node of Array.from(element.getElementsByTagName(tagName))) {
    const text = node.textContent?.trim();
    if (text) texts.push(text);
  }
  return texts;
}

export function detectFeedType(doc: Document): "rss" | "atom" | null {
  if (doc.getElementsByTagName("rss").length > 0) return "rss";

  const feeds = doc.getElementsByTagName("feed");
  if (feeds.length > 0) {
    const feed = feeds[0];
    if (feed && feed.getElementsByTagName("entry").length > 0) {
      return "atom";
    }
  }

  return null;
}

export function isFeedXml(xml: string): boolean {
  try {
    const doc = parseXmlDocument(xml);
    return detectFeedType(doc) !== null;
  } catch {
    return false;
  }
}
