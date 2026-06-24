import JSZip from "jszip";

const P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const C_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CHART_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const CHART_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const NOTES_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
const NOTES_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";
const TABLE_URI = "http://schemas.openxmlformats.org/drawingml/2006/table";

const MINIMAL_MSG_URL =
  "https://raw.githubusercontent.com/HiraokaHyperTools/msgreader/master/test/test1.msg";

export const FIXTURE_CHART_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${C_NS}">
  <c:chart>
    <c:title><c:tx><c:strCache><c:pt idx="0"><c:v>Sales</c:v></c:pt></c:strCache></c:tx></c:title>
    <c:plotArea>
      <c:barChart>
        <c:ser>
          <c:tx><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt></c:strCache></c:tx>
          <c:cat><c:strCache>
            <c:pt idx="0"><c:v>Jan</c:v></c:pt>
            <c:pt idx="1"><c:v>Feb</c:v></c:pt>
          </c:strCache></c:cat>
          <c:val><c:numCache>
            <c:pt idx="0"><c:v>10</c:v></c:pt>
            <c:pt idx="1"><c:v>20</c:v></c:pt>
          </c:numCache></c:val>
        </c:ser>
      </c:barChart>
    </c:plotArea>
  </c:chart>
</c:chartSpace>`;

function textShape(
  id: number,
  name: string,
  text: string,
  options: { title?: boolean; top?: number; left?: number } = {},
): string {
  const { title = false, top = 0, left = 0 } = options;
  const placeholder = title
    ? "<p:ph type=\"title\"/>"
    : "<p:ph type=\"body\"/>";

  return `      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${id}" name="${name}"/>
          <p:cNvSpPr/>
          <p:nvPr>${placeholder}</p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${left}" y="${top}"/>
            <a:ext cx="9144000" cy="1143000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>`;
}

export async function buildMinimalPptx(
  title: string,
  body: string,
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`,
  );

  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${textShape(2, "Title", title, { title: true, top: 0, left: 0 })}
${textShape(3, "Content", body, { top: 1500000, left: 0 })}
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

export async function buildPptxWithParagraphs(
  title: string,
  paragraphs: string[],
): Promise<Uint8Array> {
  const bodyXml = paragraphs
    .map(
      (text) =>
        `          <a:p><a:r><a:t>${text}</a:t></a:r></a:p>`,
    )
    .join("\n");

  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`,
  );

  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${textShape(2, "Title", title, { title: true, top: 0, left: 0 })}
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Content"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="body"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="0" y="1500000"/>
            <a:ext cx="9144000" cy="1143000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
${bodyXml}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

function slideXml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${textShape(2, "Title", title, { title: true, top: 0, left: 0 })}
${textShape(3, "Content", body, { top: 1500000, left: 0 })}
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

export async function buildPptxMultiSlide(
  slides: Array<{ title: string; body: string }>,
): Promise<Uint8Array> {
  if (slides.length === 0) {
    throw new Error("buildPptxMultiSlide requires at least one slide");
  }

  const zip = new JSZip();
  const slideOverrides = slides
    .map(
      (_, index) =>
        `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    )
    .join("\n  ");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slideOverrides}
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  const presentationRels = slides
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
    )
    .join("\n  ");

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  ${presentationRels}
</Relationships>`,
  );

  const slideIds = slides
    .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`)
    .join("\n    ");

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:sldIdLst>
    ${slideIds}
  </p:sldIdLst>
</p:presentation>`,
  );

  slides.forEach((slide, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, slideXml(slide.title, slide.body));
  });

  return zip.generateAsync({ type: "uint8array" });
}

function chartGraphicFrame(id: number, relId: string): string {
  return `      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="${id}" name="Chart"/>
          <p:cNvGraphicFramePr/>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
          <a:off x="1000000" y="2500000"/>
          <a:ext cx="8000000" cy="4000000"/>
        </p:xfrm>
        <a:graphic>
          <a:graphicData uri="${C_NS}">
            <c:chart xmlns:c="${C_NS}" xmlns:r="${R_NS}" r:id="${relId}"/>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>`;
}

export async function buildPptxWithChart(
  title: string,
  chartRelId = "rId2",
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/charts/chart1.xml" ContentType="${CHART_CONTENT_TYPE}"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`,
  );

  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="${chartRelId}" Type="${CHART_REL_TYPE}" Target="../charts/chart1.xml"/>
</Relationships>`,
  );

  zip.file("ppt/charts/chart1.xml", FIXTURE_CHART_XML);

  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}" xmlns:c="${C_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${textShape(2, "Title", title, { title: true, top: 0, left: 0 })}
${chartGraphicFrame(3, chartRelId)}
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

function tableCell(text: string): string {
  return `          <a:tc>
            <a:txBody>
              <a:bodyPr/>
              <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
            </a:txBody>
          </a:tc>`;
}

function tableRow(cells: string[]): string {
  return `        <a:tr h="370840">
${cells.map(tableCell).join("\n")}
        </a:tr>`;
}

function tableGraphicFrame(id: number, rows: string[][]): string {
  const columnCount = rows[0]?.length ?? 1;
  const gridCols = Array.from({ length: columnCount }, () => "          <a:gridCol w=\"4000000\"/>").join("\n");

  return `      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="${id}" name="Table"/>
          <p:cNvGraphicFramePr/>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
          <a:off x="1000000" y="2500000"/>
          <a:ext cx="8000000" cy="3000000"/>
        </p:xfrm>
        <a:graphic>
          <a:graphicData uri="${TABLE_URI}">
            <a:tbl>
              <a:tblGrid>
${gridCols}
              </a:tblGrid>
${rows.map(tableRow).join("\n")}
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>`;
}

export async function buildPptxWithTable(
  title: string,
  rows: string[][],
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`,
  );

  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${textShape(2, "Title", title, { title: true, top: 0, left: 0 })}
${tableGraphicFrame(3, rows)}
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

export async function buildPptxWithNotes(
  title: string,
  body: string,
  notesText: string,
  notesRelId = "rId2",
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="${NOTES_CONTENT_TYPE}"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`,
  );

  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${REL_NS}">
  <Relationship Id="${notesRelId}" Type="${NOTES_REL_TYPE}" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`,
  );

  zip.file(
    "ppt/notesSlides/notesSlide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${textShape(2, "Notes", notesText, { top: 500000, left: 0 })}
    </p:spTree>
  </p:cSld>
</p:notes>`,
  );

  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="${A_NS}" xmlns:p="${P_NS}" xmlns:r="${R_NS}">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr/>
${textShape(2, "Title", title, { title: true, top: 0, left: 0 })}
${textShape(3, "Content", body, { top: 1500000, left: 0 })}
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}

export async function buildMinimalMsg(): Promise<Uint8Array> {
  const response = await fetch(MINIMAL_MSG_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch minimal.msg fixture: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function buildMinimalEpub(options: {
  title: string;
  author?: string;
  chapterHtml: string;
}): Promise<Uint8Array> {
  const { title, author = "Fixture Author", chapterHtml } = options;
  const zip = new JSZip();

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="book-id">fixture-epub-1</dc:identifier>
  </metadata>
  <manifest>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`,
  );

  zip.file(
    "OEBPS/chapter1.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${title}</title></head>
  <body>${chapterHtml}</body>
</html>`,
  );

  return zip.generateAsync({ type: "uint8array" });
}
