import archiver from "archiver";
import { Readable } from "stream";

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(text: string, opts: { bold?: boolean; center?: boolean; size?: number; after?: number } = {}) {
  const size = opts.size || 24;
  const align = opts.center ? "<w:jc w:val=\"center\"/>" : "";
  const bold = opts.bold ? "<w:b/>" : "";
  const after = opts.after != null ? `<w:spacing w:after="${opts.after}"/>` : "";
  const lines = text.split(/\n/).map(
    (line) =>
      `<w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr><w:t xml:space="preserve">${xmlEscape(line || " ")}</w:t></w:r>`
  );
  const runs = lines.join("<w:br/>");
  return `<w:p><w:pPr>${align}${after}</w:pPr>${runs}</w:p>`;
}

export type MemoDocxInput = {
  letterhead: string;
  addresseeLines: string[];
  fromLine: string;
  agreedLine: string;
  body: string;
  compiledLine: string;
  dateLine: string;
};

function documentXml(input: MemoDocxInput) {
  const letter = input.letterhead
    .split(/\n/)
    .filter((l) => l.trim())
    .map((l) => paragraph(l, { center: true, bold: true, size: 22, after: 0 }))
    .join("");
  const addressee = [
    paragraph("Кому:", { bold: true, after: 0 }),
    ...input.addresseeLines.map((l) => paragraph(l, { after: 0 })),
  ].join("");
  const parts = [
    letter,
    paragraph("СЛУЖЕБНАЯ ЗАПИСКА", { center: true, bold: true, size: 28, after: 240 }),
    addressee,
    paragraph(input.fromLine, { after: 80 }),
    paragraph(input.agreedLine, { after: 200 }),
    ...input.body.split(/\n/).map((l) => paragraph(l, { after: 80 })),
    paragraph(input.compiledLine, { after: 0 }),
    paragraph(input.dateLine, { after: 0 }),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${parts.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701"/></w:sectPr></w:body>
</w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export async function buildMemoDocx(input: MemoDocxInput): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });
  archive.append(CONTENT_TYPES, { name: "[Content_Types].xml" });
  archive.append(RELS, { name: "_rels/.rels" });
  archive.append(documentXml(input), { name: "word/document.xml" });
  await archive.finalize();
  return done;
}

export function bufferToStream(buf: Buffer) {
  return Readable.from(buf);
}
