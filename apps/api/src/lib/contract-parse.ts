import { extractZipEntry } from "./zip-entry.ts";

export type ParsedContract = {
  contractNumber: string | null;
  contractDate: string | null;
  contractAmount: number | null;
  executorName: string | null;
  performanceDays: number | null;
  acceptanceDays: number | null;
  validUntil: string | null;
  deliveryUntil: string | null;
  warnings: string[];
};

function xmlToText(xml: string) {
  return xml
    .replace(/<w:tab\b[^/]*\/>/g, "\t")
    .replace(/<w:br\b[^/]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .replace(/ \n/g, "\n")
    .trim();
}

function toIso(day: string, month: string, year: string) {
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  if (Number(year) < 2000 || Number(mm) > 12 || Number(dd) > 31) return null;
  return `${year}-${mm}-${dd}`;
}

const MONTHS: Record<string, string> = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
};

function firstDate(text: string, around?: RegExp): string | null {
  const slice = around ? text.match(around)?.[0] || text : text;
  const numeric = slice.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (numeric) return toIso(numeric[1], numeric[2], numeric[3]);
  const verbal = slice.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (verbal) {
    const month = MONTHS[verbal[2].toLowerCase()];
    if (month) return toIso(verbal[1], month, verbal[3]);
  }
  return null;
}

function money(text: string): number | null {
  const m = text.match(
    /(?:сумм[аыуе]|цена\s+договор|стоимость)[^\d]{0,40}([\d\s]{2,18}(?:[.,]\d{1,2})?)/i
  );
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function daysNear(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n < 4000 ? n : null;
}

function partyName(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const quoted = text.match(new RegExp(`${label}\\s*[:–—-]?\\s*[^\\n]{0,30}[«"]([^»"]{2,80})[»"]`, "i"));
    if (quoted?.[1]) return quoted[1].replace(/\s+/g, " ").trim().slice(0, 160);
    const re = new RegExp(
      `${label}\\s*[:–—-]?\\s*(?:именуем[^,]{0,40},?\\s*)?([А-ЯЁA-Z«"][^\\n,]{2,80})`,
      "i"
    );
    const m = text.match(re);
    if (m) {
      const name = m[1].replace(/\s+/g, " ").replace(/[;].*$/, "").trim();
      if (name.length >= 3) return name.slice(0, 160);
    }
  }
  return null;
}

export function parseContractText(raw: string): ParsedContract {
  const text = raw.replace(/\u00a0/g, " ");
  const contractNumber =
    text.match(/(?:договор|контракт)\s*№?\s*([0-9][0-9A-Za-z./-]{3,40})/i)?.[1]?.trim() ||
    text.match(/№\s*([0-9]{4}[./][0-9A-Za-z./-]{2,30})/)?.[1]?.trim() ||
    null;
  const contractDate =
    firstDate(text, /дат[аы]\s+заключен[\s\S]{0,80}/i) ||
    firstDate(text, /заключ[её]н[\s\S]{0,80}/i) ||
    firstDate(text.slice(0, 800));
  const validUntil =
    firstDate(text, /действует\s+до[\s\S]{0,60}/i) ||
    firstDate(text, /срок\s+действи[яи][\s\S]{0,80}/i);
  const deliveryUntil =
    firstDate(text, /исполнить\s+до[\s\S]{0,60}/i) ||
    firstDate(text, /срок\s+поставк[\s\S]{0,80}/i) ||
    firstDate(text, /срок\s+исполнен[\s\S]{0,80}/i);
  const performanceDays =
    daysNear(text, /срок\s+исполнен[^\d]{0,40}(\d{1,4})\s*(?:календарн[а-яё]*\s+)?дн/i) ||
    daysNear(text, /в\s+течени[еи]\s+(\d{1,4})\s*(?:календарн[а-яё]*\s+)?дн/i);
  const acceptanceDays =
    daysNear(text, /срок\s+при[её]мк[^\d]{0,40}(\d{1,4})\s*(?:календарн[а-яё]*\s+)?дн/i) ||
    daysNear(text, /при[её]мк[аи]\s+документ[^\d]{0,30}(\d{1,4})\s*дн/i);
  const executorName = partyName(text, [
    "Исполнитель",
    "Поставщик",
    "Подрядчик",
    "Продавец",
  ]);
  const contractAmount = money(text);

  const warnings: string[] = [];
  if (!contractDate) warnings.push("Дата заключения не найдена в тексте");
  if (!executorName) warnings.push("Исполнитель / поставщик не найден в тексте");
  if (performanceDays == null && !deliveryUntil) warnings.push("Срок исполнения (дней) не найден в тексте");
  if (acceptanceDays == null) warnings.push("Срок приёмки (дней) не найден в тексте");

  return {
    contractNumber,
    contractDate,
    contractAmount,
    executorName,
    performanceDays,
    acceptanceDays,
    validUntil,
    deliveryUntil,
    warnings,
  };
}

export async function extractContractFileText(fileName: string, buf: Buffer): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "docx") {
    const xml = extractZipEntry(buf, "word/document.xml");
    if (!xml) return "";
    return xmlToText(xml.toString("utf8"));
  }
  if (ext === "doc") {
    const WordExtractor = (await import("word-extractor")).default;
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buf);
    return doc.getBody() || "";
  }
  if (ext === "txt" || ext === "rtf") {
    return buf.toString("utf8");
  }
  return "";
}
