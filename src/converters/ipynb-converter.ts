import {
  DocumentConverter,
  DocumentConverterResult,
} from "../base-converter.js";
import { FileConversionException } from "../exceptions.js";
import type { StreamInfo } from "../stream-info.js";
import { decodeText } from "../utils.js";

const CANDIDATE_MIME_TYPE_PREFIXES = ["application/json"];
const ACCEPTED_FILE_EXTENSIONS = [".ipynb"];

interface NotebookCell {
  cell_type?: string;
  source?: string | string[];
}

interface NotebookContent {
  cells?: NotebookCell[];
  metadata?: { title?: string };
}

export class IpynbConverter extends DocumentConverter {
  accepts(data: Uint8Array, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype ?? "").toLowerCase();
    const extension = (streamInfo.extension ?? "").toLowerCase();

    if (ACCEPTED_FILE_EXTENSIONS.includes(extension)) return true;

    if (CANDIDATE_MIME_TYPE_PREFIXES.some((p) => mimetype.startsWith(p))) {
      const text = decodeText(data, streamInfo.charset ?? "utf-8");
      return text.includes("nbformat") && text.includes("nbformat_minor");
    }

    return false;
  }

  convert(data: Uint8Array, streamInfo: StreamInfo): DocumentConverterResult {
    const text = decodeText(data, streamInfo.charset ?? "utf-8");
    try {
      const notebook = JSON.parse(text) as NotebookContent;
      return this.convertNotebook(notebook);
    } catch (error) {
      throw new FileConversionException(
        `Error converting .ipynb file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  convertNotebook(notebook: NotebookContent): DocumentConverterResult {
    const mdOutput: string[] = [];
    let title: string | null = null;

    for (const cell of notebook.cells ?? []) {
      const cellType = cell.cell_type ?? "";
      const sourceLines = Array.isArray(cell.source)
        ? cell.source
        : [cell.source ?? ""];

      if (cellType === "markdown") {
        mdOutput.push(sourceLines.join(""));

        if (title === null) {
          for (const line of sourceLines) {
            if (line.startsWith("# ")) {
              title = line.slice(2).trim();
              break;
            }
          }
        }
      } else if (cellType === "code") {
        mdOutput.push("```python\n" + sourceLines.join("") + "\n```");
      } else if (cellType === "raw") {
        mdOutput.push("```\n" + sourceLines.join("") + "\n```");
      }
    }

    title = notebook.metadata?.title ?? title;

    return new DocumentConverterResult(mdOutput.join("\n\n"), { title });
  }
}
