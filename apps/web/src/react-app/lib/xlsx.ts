// Minimal, dependency-free .xlsx (OOXML) writer. Produces a real spreadsheet
// (a ZIP of XML parts) that Excel/Sheets open without the "format doesn't match
// extension" warning the HTML-table .xls trick causes. Cells use inline strings
// or numbers; no styles/sharedStrings to keep it tiny.

const enc = new TextEncoder();

type Cell = string | number;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Column index (0-based) → spreadsheet column letters (0→A, 26→AA).
function colName(i: number): string {
  let s = "";
  i += 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((val, c) => {
          const ref = `${colName(c)}${r + 1}`;
          if (typeof val === "number" && Number.isFinite(val)) {
            return `<c r="${ref}"><v>${val}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(val ?? ""))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
  `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

function workbookXml(sheetName: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xmlEscape(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`
  );
}

const WORKBOOK_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
  `</Relationships>`;

// ── ZIP (store / no compression) ────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++)
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  data: Uint8Array;
  crc: number;
  offset: number;
}

/** Build a ZIP archive from named parts using the "stored" (uncompressed) method. */
function zip(parts: { name: string; content: string }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const entries: Entry[] = [];
  let offset = 0;

  const push = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };

  for (const part of parts) {
    const data = enc.encode(part.content);
    const nameBytes = enc.encode(part.name);
    const crc = crc32(data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // local file header sig
    header.setUint16(4, 20, true); // version needed
    header.setUint16(6, 0, true); // flags
    header.setUint16(8, 0, true); // method: stored
    header.setUint16(10, 0, true); // mod time
    header.setUint16(12, 0x21, true); // mod date (1980-01-01)
    header.setUint32(14, crc, true);
    header.setUint32(18, data.length, true); // compressed size
    header.setUint32(22, data.length, true); // uncompressed size
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true); // extra len

    entries.push({ name: part.name, data, crc, offset });
    push(new Uint8Array(header.buffer));
    push(nameBytes);
    push(data);
  }

  // Central directory
  const cdStart = offset;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); // central dir sig
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0, true); // flags
    cd.setUint16(10, 0, true); // method
    cd.setUint16(12, 0, true); // mod time
    cd.setUint16(14, 0x21, true); // mod date
    cd.setUint32(16, e.crc, true);
    cd.setUint32(20, e.data.length, true);
    cd.setUint32(24, e.data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true); // extra
    cd.setUint16(32, 0, true); // comment
    cd.setUint16(34, 0, true); // disk #
    cd.setUint16(36, 0, true); // internal attrs
    cd.setUint32(38, 0, true); // external attrs
    cd.setUint32(42, e.offset, true); // local header offset
    push(new Uint8Array(cd.buffer));
    push(nameBytes);
  }
  const cdSize = offset - cdStart;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); // EOCD sig
  eocd.setUint16(8, entries.length, true); // entries on this disk
  eocd.setUint16(10, entries.length, true); // total entries
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  push(new Uint8Array(eocd.buffer));

  // Concatenate
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Build a single-sheet .xlsx workbook (first row is typically the header). */
export function buildXlsx(sheetName: string, rows: Cell[][]): Uint8Array {
  return zip([
    { name: "[Content_Types].xml", content: CONTENT_TYPES },
    { name: "_rels/.rels", content: ROOT_RELS },
    { name: "xl/workbook.xml", content: workbookXml(sheetName) },
    { name: "xl/_rels/workbook.xml.rels", content: WORKBOOK_RELS },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml(rows) },
  ]);
}
