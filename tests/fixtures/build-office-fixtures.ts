import JSZip from "jszip";
import { OMML_NS } from "../../src/converter-utils/docx/omml.js";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const FRACTION_OMML = `<m:oMath>
      <m:f>
        <m:num><m:r><m:t>1</m:t></m:r></m:num>
        <m:den><m:r><m:t>2</m:t></m:r></m:den>
      </m:f>
    </m:oMath>`;

async function packDocx(options: {
  documentXml: string;
  footnotesXml?: string;
}): Promise<Uint8Array> {
  const { documentXml, footnotesXml } = options;
  const zip = new JSZip();

  const contentTypeOverrides = [
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`,
  ];
  if (footnotesXml) {
    contentTypeOverrides.push(
      `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`,
    );
  }

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${contentTypeOverrides.join("\n  ")}
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  const documentRels = footnotesXml
    ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  zip.file("word/_rels/document.xml.rels", documentRels);
  zip.file("word/document.xml", documentXml);
  if (footnotesXml) {
    zip.file("word/footnotes.xml", footnotesXml);
  }

  return zip.generateAsync({ type: "uint8array" });
}

function wrapDocument(bodyInnerXml: string, mathNamespace = false): string {
  const mathAttr = mathNamespace ? ` xmlns:m="${OMML_NS}"` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}"${mathAttr}>
  <w:body>
${bodyInnerXml}
  </w:body>
</w:document>`;
}

export async function buildMinimalDocx(text: string): Promise<Uint8Array> {
  return packDocx({
    documentXml: wrapDocument(`    <w:p>
      <w:r>
        <w:t>${text}</w:t>
      </w:r>
    </w:p>`),
  });
}

export async function buildDocxWithFootnote(
  mainText: string,
  footnoteText: string,
): Promise<Uint8Array> {
  return packDocx({
    documentXml: wrapDocument(`    <w:p>
      <w:r>
        <w:t>${mainText}</w:t>
      </w:r>
      <w:r>
        <w:footnoteReference w:id="1"/>
      </w:r>
    </w:p>`),
    footnotesXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="${W_NS}">
  <w:footnote w:type="separator" w:id="-1">
    <w:p>
      <w:r><w:separator/></w:r>
    </w:p>
  </w:footnote>
  <w:footnote w:type="continuationSeparator" w:id="0">
    <w:p>
      <w:r><w:continuationSeparator/></w:r>
    </w:p>
  </w:footnote>
  <w:footnote w:id="1">
    <w:p>
      <w:r>
        <w:t>${footnoteText}</w:t>
      </w:r>
    </w:p>
  </w:footnote>
</w:footnotes>`,
  });
}

export async function buildDocxWithInlineMath(
  prefix: string,
  ommlBody: string,
): Promise<Uint8Array> {
  return packDocx({
    documentXml: wrapDocument(
      `    <w:p>
      <w:r>
        <w:t>${prefix}</w:t>
      </w:r>
      ${ommlBody}
    </w:p>`,
      true,
    ),
  });
}

export async function buildDocxWithBlockMath(ommlParaBody: string): Promise<Uint8Array> {
  return packDocx({
    documentXml: wrapDocument(
      `    <w:p>
      ${ommlParaBody}
    </w:p>`,
      true,
    ),
  });
}

export async function buildDocxWithFraction(
  prefix = "Fraction: ",
): Promise<Uint8Array> {
  return buildDocxWithInlineMath(prefix, FRACTION_OMML);
}

export async function buildDocxWithBlockFraction(): Promise<Uint8Array> {
  return buildDocxWithBlockMath(`<m:oMathPara>
      ${FRACTION_OMML}
    </m:oMathPara>`);
}

export async function buildMinimalXlsx(
  rows: string[][],
  sheetName = "Sheet1",
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const output = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Uint8Array(output);
}

export async function buildMinimalXls(
  rows: string[][],
  sheetName = "Sheet1",
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const output = XLSX.write(workbook, { bookType: "biff8", type: "array" });
  return new Uint8Array(output);
}
