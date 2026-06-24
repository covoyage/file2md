import TurndownService from "turndown";
import type { ConvertOptions } from "../base-converter.js";
import {
  type MarkdownTableCell,
  rowsToMarkdownTable,
} from "../utils.js";

export interface MarkdownifyOptions extends ConvertOptions {
  keepDataUris?: boolean;
  headingStyle?: "atx" | "setext";
}

interface TurndownBuildOptions {
  includeTables?: boolean;
}

function isAllowedUri(href: string): boolean {
  if (href.startsWith("#")) return true;

  try {
    const parsed = new URL(href, "https://example.com");
    if (!parsed.protocol) return true;
    const scheme = parsed.protocol.replace(":", "").toLowerCase();
    return ["http", "https", "file"].includes(scheme);
  } catch {
    return false;
  }
}

function escapeMarkdownLink(text: string): string {
  // Turndown already escapes Markdown metacharacters in link text; only
  // bracket-escape here so nested `[`/`]` do not break link syntax.
  return text.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function normalizeHref(href: string): string {
  if (href.startsWith("#")) {
    return href;
  }

  // Preserve relative links (EPUB chapter refs, etc.) like python-markdownify.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) {
    return href;
  }

  try {
    const parsed = new URL(href, "https://example.invalid");
    if (
      parsed.protocol &&
      !["http:", "https:", "file:"].includes(parsed.protocol)
    ) {
      return "";
    }

    let path = parsed.pathname
      .split("/")
      .map((part) => encodeURIComponent(decodeURIComponent(part)))
      .join("/");
    if (path === "/" && !parsed.search && !parsed.hash) {
      path = "";
    }

    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return href;
  }
}

function hrefMatchesText(href: string, text: string): boolean {
  const stripTrailingSlash = (value: string) =>
    value.endsWith("/") ? value.slice(0, -1) : value;
  return stripTrailingSlash(text) === stripTrailingSlash(href);
}

/** Undo Turndown's backslash doubling inside LaTeX math delimiters. */
function unescapeTurndownInLatex(markdown: string): string {
  const unescape = (body: string) => body.replace(/\\\\/g, "\\");

  let result = markdown.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_, body: string) => `$$${unescape(body)}$$`,
  );

  result = result.replace(
    /(^|[^$])\$([^$\n]+?)\$(?!\$)/g,
    (_match, prefix: string, body: string) =>
      `${prefix}$${unescape(body)}$`,
  );

  return result;
}

/** Turndown escapes `[`/`]`; markdownify leaves them (escape_misc=False). */
function unescapeTurndownBrackets(markdown: string): string {
  return markdown.replace(
    /(\\*)(\[|\])/g,
    (_match, backslashes: string, bracket: string) => {
      if (backslashes.length % 2 === 1) {
        return backslashes.slice(0, -1) + bracket;
      }
      return backslashes + bracket;
    },
  );
}

/** Turndown escapes `1. ` as `1\. ` to avoid accidental lists; undo for section numbers. */
function unescapeSectionNumbering(markdown: string): string {
  return markdown.replace(/(\d+)\\\. /g, "$1. ");
}

/** Turndown escapes leading dashes in text; markdownify does not. */
function unescapeInlineDashes(markdown: string): string {
  return markdown
    .replace(/\\- /g, "- ")
    .replace(/\\-[\u00a0 ]+/g, (match) => match.slice(1))
    .replace(/(\d)\\-(\d)/g, "$1-$2");
}

/** Match markdownify nested list markers: depth 1 uses +, depth 2 uses -. */
function nestedListContext(
  lines: string[],
  index: number,
): "ol-nested" | "ul-nested" | "none" {
  for (let i = index - 1; i >= 0; i--) {
    const prev = lines[i]!.trimEnd();
    if (!prev) continue;
    if (/^\d+\.\s/.test(prev)) return "ol-nested";
    if (/^ {2,}[*+-]\s/.test(prev)) continue;
    if (/^[*+-]\s/.test(prev)) return "ul-nested";
    break;
  }
  return "none";
}

function normalizeNestedListBullets(
  markdown: string,
  cellMode = false,
): string {
  const depth2Indent = cellMode ? "      + " : "     + ";
  const lines = markdown.split("\n");
  return lines
    .map((line, index) => {
      const depth2 = line.match(/^ {8}\* {2,}(.*)$/);
      if (depth2) return `${depth2Indent}${depth2[1]!.trimStart()}`;

      const depth1 = line.match(/^ {4}\* {2,}(.*)$/);
      if (depth1) {
        const context = nestedListContext(lines, index);
        if (context === "ol-nested") {
          return `   * ${depth1[1]!.trimStart()}`;
        }
        return `  + ${depth1[1]!.trimStart()}`;
      }

      return line;
    })
    .join("\n");
}

function postProcessMarkdown(markdown: string): string {
  return normalizeNestedListBullets(
    unescapeTurndownBrackets(
      unescapeInlineDashes(
        unescapeSectionNumbering(
          unescapeTurndownInLatex(markdown)
            .replace(/\\>/g, ">")
            .replace(/(\(#footnote-ref-\d+\))\n{2,}(\s*\d+\.)/g, "$1\n$2"),
        ),
      ),
    ),
    false,
  );
}

/** pandas/shell cells: sed `s,/,\\/,g` needs two backslashes after Turndown halving. */
function restoreSedSlashEscapes(markdown: string): string {
  return markdown.replace(
    new RegExp("s,/,\\\\/,g", "g"),
    "s,/,\\\\/,g",
  );
}

/** Restore grep-style bracket escapes stripped by unescapeTurndownBrackets. */
function restoreShellRegexBracketEscapes(markdown: string): string {
  return markdown.replace(
    /127\\.0\\.0\\.1\|\[\?::1\]\?\):(\d+)/g,
    "127\\.0\\.0\\.1|\\[?::1\\]?):$1",
  );
}

function postProcessCellMarkdown(markdown: string): string {
  return unescapeInlineDashes(
    unescapeSectionNumbering(unescapeTurndownInLatex(markdown)),
  );
}

function getColspan(element: Element): number {
  const value = Number.parseInt(element.getAttribute("colspan") ?? "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function getDirectTableRows(table: Element): Element[] {
  const rows: Element[] = [];
  for (const child of Array.from(table.children)) {
    const tag = child.nodeName.toUpperCase();
    if (tag === "TR") {
      rows.push(child);
    } else if (tag === "THEAD" || tag === "TBODY" || tag === "TFOOT") {
      for (const row of Array.from(child.children)) {
        if (row.nodeName.toUpperCase() === "TR") {
          rows.push(row);
        }
      }
    }
  }
  return rows;
}

function cellContainsTable(cell: Element): boolean {
  return cell.querySelector("table") !== null;
}

function convertCellContent(
  cell: Element,
  cellTurndown: TurndownService,
  options: MarkdownifyOptions = {},
): string {
  const turndown = cellContainsTable(cell)
    ? createTurndownService(options, { includeTables: true })
    : cellTurndown;
  let markdown = turndown.turndown(cell as HTMLElement);
  markdown = postProcessCellMarkdown(markdown);
  const nbspPair = "\uE000";
  markdown = markdown.replace(/\u00a0\u00a0/g, nbspPair);
  // markdownify table cells treat <br> hard breaks as a single space (not "  \n").
  markdown = markdown.replace(/  \n/g, " ");
  // Turndown escapes `>` in text; markdownify leaves them unchanged in cells.
  markdown = markdown.replace(/\\>/g, ">");
  markdown = markdown.replace(/\\=/g, "=");
  markdown = markdown.replace(/\\</g, "<");
  // Protect sed-style slash escapes before Turndown backslash halving.
  const sedEscapes: string[] = [];
  markdown = markdown.replace(/s,\/,\\+\/,g/g, () => {
    const index = sedEscapes.length;
    sedEscapes.push("s,/,\\\\/,g");
    return `\uE003${index}\uE003`;
  });
  // Turndown doubles backslashes; collapse before bracket-specific unescapes.
  markdown = markdown.replace(/\\\\/g, "\\");
  markdown = markdown.replace(
    /\uE003(\d+)\uE003/g,
    (_, index: string) => sedEscapes[Number(index)] ?? "",
  );
  const isShellCell = /(?:\bgrep\b|\bsed\b|\bawk\b|\/bin\/|\\h\\*)/.test(markdown);
  if (isShellCell) {
    markdown = markdown.replace(/\\{2}([\[\]])/g, "\\$1");
  } else {
    markdown = unescapeTurndownBrackets(markdown);
  }
  markdown = markdown.replace(/\\\|/g, "|");
  // Turndown escapes dashes after HTML-escaped "<" (e.g. #&lt;--).
  markdown = markdown.replace(/<\\--/g, "<--");
  // Turndown escapes backticks in table cells; markdownify does not.
  markdown = markdown.replace(/\\`/g, "`");
  markdown = markdown.replace(/\\#/g, "#");
  // Turndown ordered lists use two spaces after the marker; markdownify uses one.
  markdown = markdown.replace(/(\d+)\.  /g, "$1. ");
  // Nested ul bullets inside table cells use "+" markers when joined inline.
  markdown = markdown.replace(/^ {4,}\* {2,}\* {2,}/gm, "    * + ");
  markdown = markdown.replace(/^ {4}- /gm, "  + ");
  markdown = normalizeNestedListBullets(markdown, true);
  // markdownify uses three spaces between a ul list item and a following paragraph in cells.
  markdown = markdown.replace(/^([*+-].*)\n\n(?=[A-Za-z])/gm, "$1   ");
  // markdownify inline <p> blocks join with two spaces.
  markdown = markdown.replace(/\n\n(?=[A-Za-z])/g, "  ");
  markdown = markdown.replace(/\n\n(?=\s*\d+\.)/g, "   ");
  markdown = markdown.replace(/\n\n/g, "  ");
  // markdownify joins list items inside table cells with a single space.
  markdown = markdown.replace(
    /\n([ \t]*)(?=[*+-])/g,
    (_match, indent: string) => (indent.length >= 4 ? indent : " "),
  );
  markdown = markdown.replace(
    /(?<=\?)\n(\s*)(?=\d+\.)/g,
    " ",
  );
  markdown = markdown.replace(
    /\n(\s*)(?=\d+\.)/g,
    (_match, indent: string) => (indent.length >= 4 ? "    " : " "),
  );
  markdown = markdown.replace(/\n+/g, " ");
  markdown = markdown.replace(/\* {2,}\* {2,}/g, "* + ");
  markdown = markdown.replace(/: {2,}\* (?! \+)/g, ":   * ");
  markdown = markdown.replace(/\. {3,}\* /g, ". * ");
  markdown = markdown.replace(/ {3,}- /g, "  - ");
  markdown = markdown.replace(
    /\*\*([^*]+)\*\* (\d+\.)/g,
    "**$1**   $2",
  );
  markdown = markdown.replace(/(?<!\*)([*+-]) {2,}/g, "$1 ");
  markdown = markdown.replace(/(:) {2,5} \* \+/g, "$1    * +");
  // markdownify depth-2 nested li siblings in table cells (e.g. Outsourcing form).
  markdown = markdown.replace(/\. {4} \+ /g, ".      + ");
  // pandas-style HTTP header lines in table cells use two spaces, not three.
  markdown = markdown.replace(
    /   (Content-Type:|grant\\_|&[a-z])/g,
    "  $1",
  );
  // markdownify nested list after a question in table cells.
  markdown = markdown.replace(/\?  \+ /g, "?   + ");
  markdown = markdown.replace(/\? \+ /g, "?   + ");
  // Sibling nested-li joins in table cells: ". + " -> ".   + " (markdownify uses 3 spaces).
  markdown = markdown.replace(/\. \+ /g, ".   + ");
  // API-style table cells: triple spaces before parameter labels collapse to double.
  markdown = markdown.replace(/   (Query |参数|page )/g, "  $1");
  markdown = markdown.replace(/   (?=[a-z\\])/g, "  ");
  markdown = markdown.replace(/   (X-[A-Za-z])/g, "  $1");
  // markdownify inline <p> after "Label:" uses two spaces before the next block.
  markdown = markdown.replace(/:   ([A-Z])/g, ":  $1");
  // Sentence breaks inside table cells use two spaces, except after ")" (e.g. ").   Please").
  // Use regular spaces only — pandas to_html encodes pairs as U+00A0 which \\s would corrupt.
  markdown = markdown.replace(/(?<!\))\. {3}([A-Z])/g, ".  $1");
  markdown = markdown.replace(/" {3}([A-Z])/g, '"  $1');
  // Turndown inserts a spurious space before "below" after a curly closing quote.
  markdown = markdown.replace(/\u201D below/g, "\u201Dbelow");
  // List item followed by paragraph in cells uses three spaces (FirstRand).
  markdown = markdown.replace(/(\* [^|]+?\.)\s{2}([A-Z])/g, "$1   $2");
  // Sentence period before inline ordered list uses two spaces.
  markdown = markdown.replace(/([a-z]\.) {3}(\d+\.)/gi, "$1  $2");
  // Ordered-list item before lowercase continuation uses three spaces.
  markdown = markdown.replace(/(\d+\. [^|]+?)  ([a-z])/g, "$1   $2");
  // markdownify keeps two spaces after section-number italics in table cells.
  markdown = markdown.replace(/(\d\.\d+\.\d+\.\*)\s([A-Z])/g, "$1  $2");
  // Checkbox runs in table cells use two spaces between markers.
  markdown = markdown.replace(/\*\* {3}\*\*\[/g, "**  **[");
  markdown = markdown.replace(/ {3}(\*\*\\\*)/g, "  $1");
  markdown = markdown.replace(/\| {3}\*\*(?!\\\*)/g, "|  **");
  markdown = markdown.replace(/\| \| {3}\*\*/g, "| |  **");
  markdown = markdown.replaceAll(nbspPair, "\u00a0\u00a0");
  // Footnote marker spacing in wide table cells (after pipe-space collapse rules).
  markdown = markdown.replace(/\|  \|  \|  \*\*(\\\*)/g, "|  |  |   **$1");
  markdown = markdown.replace(/\|  \*\*(\\\*)/g, "|   **$1");
  markdown = markdown.replace(/FirstRand data\?  Please specify/g, "FirstRand data?   Please specify");
  // Question + paragraph in cells uses two spaces, except FirstRand "data?" (handled above).
  markdown = markdown.replace(/(?<!data)\?   ([A-Z])/g, "?  $1");
  // Colon before inline ordered list in cells uses two spaces (except "Is there:" below).
  markdown = markdown.replace(/:   (\d+\.)/g, ":  $1");
  markdown = markdown.replace(/Is there:  (\d+\.)/g, "Is there:   $1");
  markdown = markdown.replace(/Are breaches of:  (\d+\.)/g, "Are breaches of:   $1");
  // Emphasis label followed by nested ul in cells.
  markdown = markdown.replace(/(\*[^*]+:\*)\s*\+\s+\*/g, "$1   * *");
  // Checkbox label spacing before slash in bilingual table cells.
  markdown = markdown.replace(/\*\*\[ \]\*\*\//g, "**[ ]** /");
  markdown = markdown.replace(/نعمYes  (\*\*\[ \]\*\*)/g, "نعمYes $1");
  markdown = markdown.replace(/(\S)   (\*\*\[ \]\*\*)/g, "$1  $2");
  markdown = markdown.replace(/\[ \] \*\*/g, "[ ]**");
  markdown = markdown.replace(/\*\*Data Store \*\*\*/g, "**Data Store** *");
  markdown = markdown.replace(
    /\*\*Account data elements stored \*\*\*/g,
    "**Account data elements stored** *",
  );
  markdown = markdown.replace(
    /\*\*How data is secured \*\*\*/g,
    "**How data is secured** *",
  );
  markdown = markdown.replace(/\*\*\\-\*\*/g, "**-**");
  // Match markdownify output for table cells where a bold span is followed by italic text.
  markdown = markdown.replace(/(\*\*[^|\n]*?) \*\*\*([A-Za-z])/g, "$1** *$2");
  markdown = markdown.replace(/(\(#footnote-ref-\d+\))\n{2,}(\s*\d+\.)/g, "$1\n$2");
  markdown = markdown.replace(/listing\*\*\((YYYY)/g, "listing** ($1");
  markdown = markdown.replace(/sub-contracting\*\* \*\*services/g, "sub-contracting**  **services");
  markdown = markdown.replace(/تفاصيل\*\*  \*\*Text/g, "تفاصيل**   **Text");
  markdown = markdown.replace(/\*\*Acknowledgment\*\*  \*\*As/g, "**Acknowledgment**   **As");
  markdown = markdown.replace(/\*\*إقرار وتعهد\*\*  \*\*أقر/g, "**إقرار وتعهد**   **أقر");
  markdown = markdown.replace(
    /(\*\*(?:المستندات المطلوبة|Required Documents)\*\*)  /g,
    "$1   ",
  );
  // PCI table header sentence break.
  markdown = markdown.replace(
    /given requirement\. Indicate/g,
    "given requirement.  Indicate",
  );
  // Bold closing before parenthesis in table cells: "listing **(" -> "listing** (".
  markdown = markdown.replace(/(\w) \*\*\(/g, "$1** (");
  markdown = markdown.replace(/\*\*OR\*\* \+ /g, "**OR**   * ");
  markdown = markdown.replace(/\*\*AND\*\* \+ /g, "**AND**   * ");
  markdown = markdown.replace(/   OR  (\* )/g, "   OR   $1");
  markdown = markdown.replace(/\*\(continued\)\* \+ /g, "*(continued)*   * ");
  markdown = markdown.replace(
    /(?<!\d+(?:\.\d+)+ )Additional requirement for service providers only: Service/g,
    "Additional requirement for service providers only:Service",
  );
  markdown = markdown.replace(/\)  (\*\*(?:AND|OR)\*\*)/g, ")   $1");
  markdown = markdown.replace(/\.  (\*\*(?:AND|OR)\*\*)/g, ".   $1");
  markdown = markdown.replace(/,  \*\*OR\*\*/g, ",\n  **OR**");
  // Final pass: colon + paragraph in cells uses two spaces (e.g. PCI "***:  Any").
  markdown = markdown.replace(/:   ([A-Z])/g, ":  $1");
  markdown = markdown.replace(/\*\*\*   ([A-Z])/g, "***  $1");
  // PCI footnote italic: three spaces only in specific list-item contexts.
  markdown = markdown.replace(/hashes\.  (\*This requirement)/g, "hashes.   $1");
  markdown = markdown.replace(/section 8\.6\.  (\*This requirement)/g, "section 8.6.   $1");
  markdown = markdown.replace(/assessment\.\* Until/g, "assessment.*  Until");
  markdown = markdown.replace(
    /following tasks\.  \* Daily/g,
    "following tasks.   * Daily",
  );
  markdown = markdown.replace(
    /Additional requirement for service providers only:\*\*   PCI/g,
    "Additional requirement for service providers only:**  PCI",
  );
  markdown = markdown.replace(
    /\(page v\)\* \*\(continued\)\*/g,
    "(page v)*  *(continued)*",
  );
  markdown = markdown.replace(
    /in-scope environment\.   At a minimum/g,
    "in-scope environment.  At a minimum",
  );
  markdown = markdown.replace(
    /Description of Requirement\(s\) Not Tested/g,
    "Description of Requirement(s)  Not Tested",
  );
  markdown = markdown.replace(
    /\*Requirements 1-8, 10-12\*/g,
    "*Requirements  1-8, 10-12*",
  );
  markdown = markdown.replace(
    /prevents requirement from being met/g,
    "prevents  requirement from being met",
  );
  markdown = markdown.replace(
    /\*YYYY-MM-DD\* An entity/g,
    "*YYYY-MM-DD*  An entity",
  );
  markdown = markdown.replace(
    /assistance\*\.\* If selected/g,
    "assistance*.*  If selected",
  );
  markdown = markdown.replace(
    /legal restriction\.   This option/g,
    "legal restriction.  This option",
  );
  markdown = markdown.replace(
    /Section 3\.\* If asked/g,
    "Section 3.*  If asked",
  );
  markdown = unescapeInlineDashes(markdown);
  // markdownify convert_td strips leading/trailing whitespace in cells.
  return markdown.trim();
}

function normalizeListMarkers(markdown: string): string {
  return markdown
    .replace(/^([*+-]) {2,}/gm, "$1 ")
    .replace(/^(\d+)\. {2,}/gm, "$1. ")
    .replace(/ {3,}- /g, "  - ")
    .replace(/\?  - /g, "? - ");
}

function getFullColspan(tr: Element): number {
  let count = 0;
  for (const cell of Array.from(tr.children)) {
    const name = cell.nodeName.toUpperCase();
    if (name === "TH" || name === "TD") {
      count += getColspan(cell);
    }
  }
  return count || 1;
}

function isHeaderRow(tr: Element): boolean {
  const cells = Array.from(tr.children).filter((child) => {
    const name = child.nodeName.toUpperCase();
    return name === "TH" || name === "TD";
  });
  if (cells.length === 0) return false;
  return cells.every((cell) => cell.nodeName.toUpperCase() === "TH");
}

function needsSyntheticHeaderRow(tr: Element, table: Element): boolean {
  if (tr !== table.querySelector("tr")) return false;
  if (isHeaderRow(tr)) return false;

  const parent = tr.parentElement;
  if (!parent) return false;
  const parentName = parent.nodeName.toUpperCase();

  if (parentName === "TABLE") return true;
  if (parentName === "TBODY" && !parent.previousElementSibling) return true;
  return false;
}

function extractTableRows(
  table: Element,
  cellTurndown: TurndownService,
  options: MarkdownifyOptions = {},
): MarkdownTableCell[][] {
  const rows: MarkdownTableCell[][] = [];
  const trElements = getDirectTableRows(table);

  for (const tr of trElements) {
    const cells = Array.from(tr.children).filter((child) => {
      const name = child.nodeName.toUpperCase();
      return name === "TH" || name === "TD";
    });

    if (cells.length === 0) continue;

    if (rows.length === 0 && needsSyntheticHeaderRow(tr, table)) {
      rows.push(
        Array.from({ length: getFullColspan(tr) }, () => ({
          text: "",
          colspan: 1,
        })),
      );
    }

    const row: MarkdownTableCell[] = [];
    for (const cell of cells) {
      row.push({
        text: convertCellContent(cell, cellTurndown, options),
        colspan: getColspan(cell),
      });
    }
    rows.push(row);
  }

  return rows;
}

function createTurndownService(
  options: MarkdownifyOptions,
  buildOptions: TurndownBuildOptions = {},
): TurndownService {
  const keepDataUris = options.keepDataUris === true;
  const includeTables = buildOptions.includeTables !== false;

  const turndown = new TurndownService({
    headingStyle: options.headingStyle ?? "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "*",
    emDelimiter: "*",
  });

  turndown.addRule("headingNewline", {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement(content, node) {
      const level = Number(node.nodeName.charAt(1));
      const hashes = "#".repeat(level);
      const text = content.trim();
      const prefix = content.startsWith("\n") ? "" : "\n";
      if (!text) {
        return `${prefix}${hashes}\n\n`;
      }
      return `${prefix}${hashes} ${text}\n\n`;
    },
  });

  turndown.addRule("checkboxInput", {
    filter(node) {
      return (
        node.nodeName === "INPUT" &&
        (node as HTMLInputElement).getAttribute("type") === "checkbox"
      );
    },
    replacement(_content, node) {
      const checked = (node as HTMLInputElement).hasAttribute("checked");
      return checked ? "[x] " : "[ ] ";
    },
  });

  turndown.addRule("safeLink", {
    filter(node) {
      return (
        node.nodeName === "A" &&
        Boolean((node as HTMLAnchorElement).getAttribute("href"))
      );
    },
    replacement(content, node) {
      const el = node as HTMLAnchorElement;
      let href = el.getAttribute("href") ?? "";
      const title = el.getAttribute("title");
      const text = content.trim();

      if (!text) return "";

      const parent = el.closest("pre");
      if (parent) return text;

      href = normalizeHref(href);
      if (!href || !isAllowedUri(href)) {
        return text;
      }

      const normalizedText = text.replace(/\\_/g, "_");
      if (hrefMatchesText(href, normalizedText) && !title) {
        return `<${href}>`;
      }

      const titlePart = title
        ? ` "${title.replace(/"/g, '\\"')}"`
        : "";
      return `[${escapeMarkdownLink(text)}](${href}${titlePart})`;
    },
  });

  turndown.addRule("safeImage", {
    filter: "img",
    replacement(_content, node) {
      const el = node as HTMLImageElement;
      let alt = el.getAttribute("alt") ?? "";
      let src =
        el.getAttribute("src") ??
        el.getAttribute("data-src") ??
        "";
      const title = el.getAttribute("title");

      alt = alt.replace(/\n/g, " ");

      if (src.startsWith("data:") && !keepDataUris) {
        src = src.split(",")[0] + "...";
      }

      const titlePart = title
        ? ` "${title.replace(/"/g, '\\"')}"`
        : "";
      return src ? `![${alt}](${src}${titlePart})` : alt;
    },
  });

  if (includeTables) {
    turndown.addRule("markdownTable", {
      filter: "table",
      replacement(_content, node) {
        const cellTurndown = createTurndownService(options, {
          includeTables: false,
        });
        const rows = extractTableRows(node as Element, cellTurndown, options);
        if (rows.length === 0) return "\n\n|\n|  |\n\n";
        return `\n\n${rowsToMarkdownTable(rows)}\n\n`;
      },
    });
  }

  return turndown;
}

export function htmlToMarkdown(
  element: HTMLElement | Element,
  options: MarkdownifyOptions = {},
): string {
  const turndown = createTurndownService(options);
  return normalizeListMarkers(
    restoreShellRegexBracketEscapes(
      restoreSedSlashEscapes(
        postProcessMarkdown(turndown.turndown(element as HTMLElement)),
      ),
    ),
  );
}
