import { inflateRawSync } from "zlib";

/** Достаёт файл из ZIP (для docx: word/document.xml) */
export function extractZipEntry(buf: Buffer, target: string): Buffer | null {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const flags = buf.readUInt16LE(offset + 6);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    if (flags & 0x08) {
      offset = dataStart;
      break;
    }
    const data = buf.slice(dataStart, dataStart + compSize);
    if (name.replace(/\\/g, "/") === target) {
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    offset = dataStart + compSize;
  }
  return null;
}
