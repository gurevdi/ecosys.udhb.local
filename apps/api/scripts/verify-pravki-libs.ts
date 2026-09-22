import { parseContractText } from "../src/lib/contract-parse.ts";
import { endBeforeStart, parseDateOnly, addDays, dateOnlyKey } from "../src/lib/dates.ts";
import { toCsv, EXPORT_HEADERS } from "../src/lib/proc-export.ts";
import { buildMemoDocx } from "../src/lib/memo-docx.ts";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log("OK  ", name);
  else {
    failed++;
    console.log("FAIL", name, detail);
  }
}

const sample = `
Договор № 2026.94/155
Дата заключения 08.09.2026
Исполнитель: ООО «ОКС», именуемое далее Поставщик
Сумма договора 4 890,00 рублей
Срок исполнения 10 календарных дней
Срок приёмки документов 20 дней
действует до 31.12.2026
`;
const parsed = parseContractText(sample);
check("parser number", parsed.contractNumber?.includes("2026.94/155") === true, String(parsed.contractNumber));
check("parser date", parsed.contractDate === "2026-09-08", String(parsed.contractDate));
check("parser executor", Boolean(parsed.executorName && parsed.executorName.includes("ОКС")), String(parsed.executorName));
check("parser amount", parsed.contractAmount === 4890, String(parsed.contractAmount));
check("parser performanceDays", parsed.performanceDays === 10, String(parsed.performanceDays));
check("parser acceptanceDays", parsed.acceptanceDays === 20, String(parsed.acceptanceDays));
check("parser validUntil", parsed.validUntil === "2026-12-31", String(parsed.validUntil));
check("parser no date warning", !parsed.warnings.includes("Дата заключения не найдена в тексте"));

const start = parseDateOnly("2026-09-08");
const endOk = parseDateOnly("2026-12-31");
const endBad = parseDateOnly("2026-09-01");
check("dates 08.09 vs 31.12 allowed", endBeforeStart(start, endOk) === false);
check("dates end before start blocked", endBeforeStart(start, endBad) === true);
const plus10 = addDays(parseDateOnly("2026-09-18")!, 10);
check("acceptance +10 days", dateOnlyKey(plus10) === "2026-09-28", String(dateOnlyKey(plus10)));

const csv = toCsv([]);
check(
  "export headers",
  EXPORT_HEADERS.includes("Дата заключения") && EXPORT_HEADERS.includes("Поставщик") && EXPORT_HEADERS.includes("Сумма контракта")
);
check("csv bom", csv.charCodeAt(0) === 0xfeff);

const docx = await buildMemoDocx({
  letterhead: "УДХБ\nОтдел",
  addresseeLines: ["директору", "Иванову И.И."],
  fromLine: "От: специалист, Тест",
  agreedLine: "Согласовано: нач, Петров",
  body: "Текст СЗ",
  compiledLine: "Составил: Тест",
  dateLine: "21.09.2026",
});
check("docx zip signature", docx[0] === 0x50 && docx[1] === 0x4b, String(docx.length));

if (failed) {
  console.log(`lib tests failed: ${failed}`);
  process.exit(1);
}
console.log("lib tests passed");
