// Minimal OpenDocument spreadsheet reader: unzips content.xml with node:zlib
// and turns each table into a grid of strings. No dependency needed because
// an .ods is a zip and the cell markup is simple.

import { inflateRawSync } from "node:zlib";
import { parseXml, type XmlElement } from "../shipLayout/xml.ts";

export interface Sheet {
  name: string;
  rows: string[][];
}

/** Reads one entry from a zip via its central directory (stored or deflated). */
export function unzipEntry(zip: Buffer, wanted: string): Buffer {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(data, data + size);
      if (method === 0) return raw;
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`Unsupported zip method ${method}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in zip`);
}

/** Drops the XML declaration's cousins that parseXml does not decode: numeric character references. */
const decodeNumeric = (s: string) =>
  s.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n: string) =>
    String.fromCodePoint(n[0] === "x" || n[0] === "X" ? parseInt(n.slice(1), 16) : parseInt(n, 10)),
  );

function cellText(cell: XmlElement): string {
  // Each <text:p> is a paragraph; <text:s/> (spaces) and <text:line-break/> are
  // flattened by parseXml's text joining, which is fine for this data.
  const paragraphs = cell.children.filter((c) => c.name === "text:p").map(textOf);
  return paragraphs.join("\n");
}

function textOf(el: XmlElement): string {
  return [el.text, ...el.children.map(textOf)].filter(Boolean).join(" ");
}

export function readOds(file: Buffer): Sheet[] {
  const xml = decodeNumeric(unzipEntry(file, "content.xml").toString("utf8"));
  const doc = parseXml(xml);
  const sheets: Sheet[] = [];
  const find = (el: XmlElement, name: string, out: XmlElement[]): XmlElement[] => {
    if (el.name === name) out.push(el);
    else for (const c of el.children) find(c, name, out);
    return out;
  };
  for (const table of find(doc, "table:table", [])) {
    const rows: string[][] = [];
    for (const row of table.children.flatMap((c) => (c.name === "table:table-row-group" || c.name === "table:table-header-rows" ? c.children : [c]))) {
      if (row.name !== "table:table-row") continue;
      const cells: string[] = [];
      for (const cell of row.children) {
        if (cell.name !== "table:table-cell" && cell.name !== "table:covered-table-cell") continue;
        const repeat = Number(cell.attrs["table:number-columns-repeated"] ?? 1);
        const text = cellText(cell);
        // Trailing empty cells repeat to the sheet edge; keep only real content.
        for (let i = 0; i < (text ? repeat : Math.min(repeat, 1)); i++) cells.push(text);
        if (!text && repeat > 1) for (let i = 1; i < Math.min(repeat, 200); i++) cells.push("");
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      const repeat = Math.min(Number(row.attrs["table:number-rows-repeated"] ?? 1), cells.length ? 1000 : 1);
      for (let i = 0; i < repeat; i++) rows.push(cells);
    }
    while (rows.length && rows[rows.length - 1]!.length === 0) rows.pop();
    sheets.push({ name: table.attrs["table:name"] ?? `sheet${sheets.length + 1}`, rows });
  }
  return sheets;
}
