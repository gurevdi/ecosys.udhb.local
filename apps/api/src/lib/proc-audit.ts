import { prisma } from "./config.ts";
import { CATEGORY_LABELS, STATUS_LABELS } from "./catalog.ts";

export type ProcAuditInput = {
  procurementId: string;
  userId: string;
  section: string;
  action: string;
  summary: string;
  details?: string | null;
};

const SUMMARY_LIMIT = 96;

/** Запись в истории изменений карточки договора */
export async function logProcChange(input: ProcAuditInput) {
  const summary = input.summary.length > SUMMARY_LIMIT ? `${input.summary.slice(0, SUMMARY_LIMIT - 1)}…` : input.summary;
  return prisma.procChangeLog.create({
    data: {
      procurementId: input.procurementId,
      userId: input.userId,
      section: input.section,
      action: input.action,
      summary,
      details: input.details || null,
    },
  });
}

const FIELD_LABELS: Record<string, string> = {
  title: "Наименование",
  category: "Тип договора",
  description: "Описание",
  estimatedAmount: "Ориентир суммы",
  contractNumber: "Номер контракта",
  contractDate: "Дата контракта",
  contractAmount: "Сумма контракта",
  deliveryUntil: "Срок поставки",
  acceptanceStartAt: "Начало приёмки",
  acceptanceDueAt: "Срок приёмки",
  contractDeptNote: "Заметка договорного",
  folderId: "Папка",
  budgetYear: "Год договора",
};

function fmtVal(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (key === "estimatedAmount" || key === "contractAmount") return String(v);
  if (key === "category") return CATEGORY_LABELS[String(v)] || String(v);
  return String(v);
}

type ProcRow = {
  title?: string | null;
  category?: string | null;
  description?: string | null;
  estimatedAmount?: unknown;
  contractNumber?: string | null;
  contractDate?: Date | null;
  contractAmount?: unknown;
  deliveryUntil?: Date | null;
  acceptanceStartAt?: Date | null;
  acceptanceDueAt?: Date | null;
  contractDeptNote?: string | null;
  folderId?: string | null;
  budgetYear?: number | null;
};

/** Сформировать записи истории по изменённым полям карточки */
export function describeProcPatch(
  current: ProcRow,
  patch: Record<string, unknown>,
  docChanges?: { title: string; from: boolean; to: boolean; note?: string | null }[]
) {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (patch[key] === undefined) continue;
    let newVal = patch[key];
    if (["contractDate", "deliveryUntil", "acceptanceStartAt", "acceptanceDueAt"].includes(key)) {
      newVal = patch[key] ? new Date(patch[key] as string) : null;
    }
    const from = fmtVal(key, (current as Record<string, unknown>)[key]);
    const to = fmtVal(key, newVal);
    if (from !== to) lines.push(`${label}: ${from} → ${to}`);
  }
  if (docChanges?.length) {
    for (const d of docChanges) {
      if (d.from !== d.to) {
        lines.push(`Документ «${d.title}»: ${d.from ? "есть" : "нет"} → ${d.to ? "есть" : "нет"}`);
      }
      if (d.note !== undefined && d.note) lines.push(`Документ «${d.title}», примечание: ${d.note}`);
    }
  }
  if (!lines.length) return null;
  const details = lines.join("\n");
  const summary = lines.length === 1 ? lines[0] : `Изменено полей: ${lines.length} (${lines[0]}…)`;
  return { summary, details };
}

export function statusChangeText(from: string | null | undefined, to: string, comment?: string | null) {
  const fromLabel = from ? STATUS_LABELS[from] || from : null;
  const toLabel = STATUS_LABELS[to] || to;
  const summary = fromLabel ? `Статус: ${fromLabel} → ${toLabel}` : `Статус: ${toLabel}`;
  const details = comment ? `Комментарий: ${comment}` : null;
  return { summary, details };
}
