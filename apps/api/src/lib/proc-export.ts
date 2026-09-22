import { STATUS_LABELS, CATEGORY_LABELS } from "./catalog.ts";
import { dateOnlyKey } from "./dates.ts";

type ExportRow = {
  serialNo: number;
  title: string;
  status: string;
  category: string;
  method: string;
  budgetYear: number | null;
  fromArchive: boolean;
  department: { name: string };
  initiator: { fullName: string };
  selectedQuote: { supplierName: string } | null;
  contractNumber: string | null;
  contractDate: Date | null;
  contractAmount: unknown;
  estimatedAmount: unknown;
  validUntil: Date | null;
  deliveryUntil: Date | null;
  actualDeliveryAt: Date | null;
  acceptanceDueAt: Date | null;
  executorName: string | null;
  contractKind: string | null;
  contractComment: string | null;
  createdAt: Date;
  payments?: { amount: unknown; paidAt: Date | null; addressee: string }[];
};

function money(v: unknown) {
  if (v == null || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

function d(v: Date | null | undefined) {
  const key = dateOnlyKey(v || null);
  if (!key) return "";
  const [y, m, day] = key.split("-");
  return `${day}.${m}.${y}`;
}

const METHOD: Record<string, string> = {
  electronic_shop: "Электронный магазин",
  auction: "Аукцион",
};

const KIND_LABELS: Record<string, string> = {
  renewable: "Продляемый",
  onetime: "Разовый",
};

export const EXPORT_HEADERS = [
  "№",
  "Наименование",
  "Тип",
  "Этап",
  "Способ",
  "Отдел",
  "Год карточки",
  "Архив",
  "Инициатор",
  "Поставщик",
  "Исполнитель",
  "Тип договора",
  "Комментарий",
  "№ контракта",
  "Дата заключения",
  "Сумма контракта",
  "Ориентир",
  "Действует до",
  "Исполнить до",
  "Факт поставки",
  "Приёмка до",
  "Создан",
  "Оплаты сумма",
  "Оплаты даты",
  "Оплаты адресаты",
];

export function procurementToExportCells(r: ExportRow): string[] {
  const paidSum = (r.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
  return [
    String(r.serialNo),
    r.title,
    CATEGORY_LABELS[r.category] || r.category,
    STATUS_LABELS[r.status] || r.status,
    METHOD[r.method] || r.method,
    r.department.name,
    r.budgetYear != null ? String(r.budgetYear) : "",
    r.fromArchive ? "да" : "",
    r.initiator.fullName,
    r.selectedQuote?.supplierName || "",
    r.executorName || "",
    KIND_LABELS[r.contractKind || ""] || "",
    r.contractComment || "",
    r.contractNumber || "",
    d(r.contractDate),
    money(r.contractAmount),
    money(r.estimatedAmount),
    d(r.validUntil),
    d(r.deliveryUntil),
    d(r.actualDeliveryAt),
    d(r.acceptanceDueAt),
    d(r.createdAt),
    paidSum ? money(paidSum) : "",
    (r.payments || []).map((p) => d(p.paidAt)).filter(Boolean).join("; "),
    (r.payments || []).map((p) => p.addressee).filter(Boolean).join("; "),
  ];
}

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function toCsv(rows: ExportRow[]) {
  const lines = [EXPORT_HEADERS, ...rows.map(procurementToExportCells)].map((cells) =>
    cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")
  );
  return `\uFEFF${lines.join("\r\n")}`;
}

export function toSpreadsheetXml(rows: ExportRow[]) {
  const header = EXPORT_HEADERS.map((h) => `<Cell><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join("");
  const body = rows
    .map((r) => {
      const cells = procurementToExportCells(r)
        .map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`)
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Договоры"><Table>
<Row>${header}</Row>
${body}
</Table></Worksheet></Workbook>`;
}
