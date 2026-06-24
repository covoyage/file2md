import JSZip from "jszip";
import { parseXmlDocument } from "../../utils/xml.js";
import { oMathElementToLatex } from "./omml.js";

const W_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const MATH_ROOT_TEMPLATE =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">{0}</w:document>';

const PRE_PROCESS_FILES = [
  "word/document.xml",
  "word/footnotes.xml",
  "word/endnotes.xml",
];

function localTagName(elm: Element): string {
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

function findElementsByLocalName(
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

function findFirstOmmlMath(root: Element): Element | null {
  if (localTagName(root) === "oMath") {
    return root;
  }
  let found: Element | null = null;
  walkElements(root, (element) => {
    if (!found && localTagName(element) === "oMath") {
      found = element;
    }
  });
  return found;
}

function convertOmathTagToLatex(element: Element): string {
  const wrapped = MATH_ROOT_TEMPLATE.replace("{0}", element.outerHTML);
  const doc = parseXmlDocument(wrapped);
  const mathElement = findFirstOmmlMath(doc.documentElement);
  if (!mathElement) {
    throw new Error("oMath element not found in wrapped document");
  }
  return oMathElementToLatex(mathElement);
}

function createLatexRun(doc: Document, latex: string, block: boolean): Element {
  const text = block ? `$$${latex}$$` : `$${latex}$`;
  const run = doc.createElementNS(W_NS, "w:r");
  const textNode = doc.createElementNS(W_NS, "w:t");
  textNode.textContent = text;
  run.appendChild(textNode);
  return run;
}

function replaceOmathPara(element: Element, parent: Element): void {
  const doc = element.ownerDocument!;
  const runs = findElementsByLocalName(element, "oMath").map((child) =>
    createLatexRun(doc, convertOmathTagToLatex(child), true),
  );

  if (localTagName(parent) === "p") {
    for (const run of runs) {
      parent.insertBefore(run, element);
    }
    parent.removeChild(element);
    return;
  }

  const paragraph = doc.createElementNS(W_NS, "w:p");
  for (const run of runs) {
    paragraph.appendChild(run);
  }
  parent.replaceChild(paragraph, element);
}

function replaceOmath(element: Element): Element {
  const doc = element.ownerDocument!;
  const latex = convertOmathTagToLatex(element);
  return createLatexRun(doc, latex, false);
}

function replaceEquations(element: Element): void {
  const name = localTagName(element);
  const parent = element.parentNode;
  if (!parent) return;

  if (name === "oMathPara") {
    replaceOmathPara(element, parent as Element);
  } else if (name === "oMath") {
    parent.replaceChild(replaceOmath(element), element);
  } else {
    throw new Error(`Not supported tag: ${name}`);
  }
}

function serializeXmlDocument(doc: Document): string {
  if (typeof XMLSerializer !== "undefined") {
    return new XMLSerializer().serializeToString(doc);
  }
  return doc.toString();
}

export function preProcessMath(content: Uint8Array): Uint8Array {
  const xml = new TextDecoder().decode(content);
  const doc = parseXmlDocument(xml);

  for (const tag of findElementsByLocalName(doc, "oMathPara")) {
    replaceEquations(tag);
  }
  for (const tag of findElementsByLocalName(doc, "oMath")) {
    replaceEquations(tag);
  }

  return new TextEncoder().encode(serializeXmlDocument(doc));
}

export async function preProcessDocx(data: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(data);

  for (const name of PRE_PROCESS_FILES) {
    const file = zip.file(name);
    if (!file) continue;

    try {
      const content = await file.async("uint8array");
      zip.file(name, preProcessMath(content));
    } catch {
      // Keep original content on failure.
    }
  }

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}
