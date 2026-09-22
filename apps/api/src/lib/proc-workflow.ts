import { STATUS_LABELS } from "./catalog.ts";

export type WorkflowLevel = "blocker" | "warning";

export type WorkflowIssue = {
  id: string;
  label: string;
  level: WorkflowLevel;
  message: string;
};

export type ProcWorkflowInput = {
  method: string;
  status: string;
  quotesCount: number;
  memosCount: number;
  documents: { code: string; present: boolean }[];
  supervisorApprovedAt: Date | string | null;
  directorApprovedAt: Date | string | null;
  publishedAt: Date | string | null;
  biddingStartAt: Date | string | null;
  biddingEndAt: Date | string | null;
  selectedQuoteId: string | null;
  contractStoredName: string | null;
  contractDate: Date | string | null;
  contractNumber: string | null;
  contractAmount: unknown;
  deliveryUntil: Date | string | null;
  acceptanceStartAt: Date | string | null;
  acceptanceDueAt: Date | string | null;
  contractDeptNote: string | null;
  estimatedAmount: unknown;
  fromArchive?: boolean;
};

/** Основной маршрут электронного магазина */
export const ELECTRONIC_SHOP_FLOW = [
  "draft",
  "collecting_quotes",
  "memo",
  "supervisor_approval",
  "director_approval",
  "transferred",
  "published",
  "bidding",
  "contracted",
  "execution",
  "acceptance_window",
  "completed",
] as const;

/** Маршрут аукциона — прежняя схема */
export const AUCTION_FLOW = [
  "draft",
  "collecting_quotes",
  "memo",
  "approval",
  "transferred",
  "returned",
  "published",
  "bidding",
  "contracted",
  "execution",
  "acceptance_window",
  "completed",
] as const;

export function getFlow(method: string): readonly string[] {
  return method === "electronic_shop" ? ELECTRONIC_SHOP_FLOW : AUCTION_FLOW;
}

export function normalizeStatus(method: string, status: string): string {
  if (method === "electronic_shop" && status === "approval") return "supervisor_approval";
  return status;
}

export function flowIndex(method: string, status: string): number {
  const flow = getFlow(method);
  const s = normalizeStatus(method, status);
  const idx = flow.indexOf(s);
  return idx >= 0 ? idx : -1;
}

export function nextStatus(method: string, status: string): string | null {
  const flow = getFlow(method);
  const idx = flowIndex(method, status);
  if (idx < 0 || idx >= flow.length - 1) return null;
  return flow[idx + 1]!;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

function docPresent(documents: ProcWorkflowInput["documents"], code: string) {
  return documents.some((d) => d.code === code && d.present);
}

export function exitChecks(proc: ProcWorkflowInput): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (proc.fromArchive) return issues;
  const status = normalizeStatus(proc.method, proc.status);

  switch (status) {
    case "collecting_quotes":
      if (proc.quotesCount === 0) {
        issues.push({
          id: "no_quotes",
          label: "Коммерческие предложения",
          level: "blocker",
          message: "Загрузите хотя бы одно коммерческое предложение",
        });
      }
      break;
    case "memo":
      if (proc.memosCount === 0) {
        issues.push({
          id: "no_memo",
          label: "Служебная записка",
          level: "blocker",
          message: "Сформируйте служебную записку перед согласованием",
        });
      }
      if (!docPresent(proc.documents, "memo") && proc.memosCount > 0) {
        issues.push({
          id: "memo_doc",
          label: "Комплект документов",
          level: "warning",
          message: "Отметьте «Служебная записка» в комплекте документов",
        });
      }
      break;
    case "supervisor_approval":
      if (!proc.supervisorApprovedAt) {
        issues.push({
          id: "supervisor_ok",
          label: "Согласование руководителя",
          level: "blocker",
          message: "Требуется согласование непосредственного руководителя",
        });
      }
      break;
    case "director_approval":
      if (!proc.directorApprovedAt) {
        issues.push({
          id: "director_ok",
          label: "Согласование директора",
          level: "blocker",
          message: "Требуется согласование директора",
        });
      }
      break;
    case "transferred":
      if (!proc.contractDeptNote?.trim()) {
        issues.push({
          id: "dept_note",
          label: "Договорной отдел",
          level: "warning",
          message: "Рекомендуется заполнить заметку для договорного отдела",
        });
      }
      break;
    case "published":
      if (!proc.publishedAt) {
        issues.push({
          id: "published_at",
          label: "Размещение на площадке",
          level: "blocker",
          message: "Укажите дату размещения на электронной площадке",
        });
      }
      break;
    case "bidding":
      if (!proc.biddingStartAt || !proc.biddingEndAt) {
        issues.push({
          id: "bidding_dates",
          label: "Сроки торгов",
          level: "blocker",
          message: "Укажите даты начала и окончания торгов",
        });
      } else {
        const start = new Date(proc.biddingStartAt);
        const end = new Date(proc.biddingEndAt);
        if (end < start) {
          issues.push({
            id: "bidding_order",
            label: "Сроки торгов",
            level: "blocker",
            message: "Дата окончания торгов не может быть раньше начала",
          });
        }
      }
      break;
    case "contracted":
      if (!proc.selectedQuoteId) {
        issues.push({
          id: "supplier",
          label: "Поставщик",
          level: "blocker",
          message: "Закрепите поставщика из списка КП",
        });
      }
      if (!proc.contractStoredName) {
        issues.push({
          id: "contract_file",
          label: "Файл договора",
          level: "blocker",
          message: "Загрузите актуальный договор",
        });
      }
      if (!proc.contractDate) {
        issues.push({
          id: "contract_date",
          label: "Дата заключения",
          level: "blocker",
          message: "Укажите дату заключения договора",
        });
      }
      if (!proc.deliveryUntil && !proc.contractDate) {
        issues.push({
          id: "delivery",
          label: "Срок поставки",
          level: "blocker",
          message: "Укажите срок исполнения или дату заключения",
        });
      }
      if (!proc.contractNumber?.trim()) {
        issues.push({
          id: "contract_no",
          label: "Номер договора",
          level: "warning",
          message: "Рекомендуется указать номер контракта",
        });
      }
      if (proc.contractAmount == null || proc.contractAmount === "") {
        issues.push({
          id: "contract_sum",
          label: "Сумма договора",
          level: "warning",
          message: "Рекомендуется указать сумму контракта",
        });
      }
      break;
    case "execution":
      if (!proc.acceptanceStartAt) {
        issues.push({
          id: "acceptance_start",
          label: "Начало приёмки",
          level: "warning",
          message: "Рекомендуется указать дату начала приёмки",
        });
      }
      break;
    case "acceptance_window":
      if (proc.acceptanceDueAt && new Date(proc.acceptanceDueAt) > new Date()) {
        issues.push({
          id: "acceptance_open",
          label: "Приёмка",
          level: "warning",
          message: "Срок приёмки ещё не истёк",
        });
      }
      break;
    default:
      break;
  }

  return issues;
}

export function stageChecks(proc: ProcWorkflowInput): WorkflowIssue[] {
  const exit = exitChecks(proc);
  const status = normalizeStatus(proc.method, proc.status);

  if (status === "draft" && (proc.estimatedAmount == null || proc.estimatedAmount === "")) {
    return [
      ...exit,
      {
        id: "estimate",
        label: "Ориентир суммы",
        level: "warning",
        message: "Рекомендуется указать ориентир суммы закупки",
      },
    ];
  }
  return exit;
}

export type TransitionResult = {
  ok: boolean;
  blockers: WorkflowIssue[];
  warnings: WorkflowIssue[];
  skippedSteps: number;
};

export function validateTransition(
  proc: ProcWorkflowInput,
  targetStatus: string,
  opts: { force?: boolean } = {}
): TransitionResult {
  const force = Boolean(opts.force);
  const from = normalizeStatus(proc.method, proc.status);
  const to = normalizeStatus(proc.method, targetStatus);
  const flow = getFlow(proc.method);
  const fromIdx = flow.indexOf(from);
  const toIdx = flow.indexOf(to);

  const blockers: WorkflowIssue[] = [];
  const warnings: WorkflowIssue[] = [];

  if (to === "rejected") {
    return { ok: true, blockers, warnings, skippedSteps: 0 };
  }

  if (to === "returned") {
    if (proc.method === "electronic_shop" && fromIdx < flow.indexOf("transferred")) {
      blockers.push({
        id: "return_early",
        label: "Возврат",
        level: "blocker",
        message: "Возврат возможен после передачи в договорной отдел",
      });
    }
    return { ok: blockers.length === 0, blockers, warnings, skippedSteps: 0 };
  }

  if (fromIdx < 0 || toIdx < 0) {
    if (!force) {
      blockers.push({
        id: "unknown_status",
        label: "Статус",
        level: "blocker",
        message: "Недопустимый переход статуса для данного способа закупки",
      });
    }
    return { ok: force, blockers, warnings, skippedSteps: 0 };
  }

  const skippedSteps = toIdx - fromIdx - 1;
  if (skippedSteps > 0 && !force) {
    blockers.push({
      id: "skip_steps",
      label: "Этапность",
      level: "blocker",
      message: `Пропуск ${skippedSteps} этап(ов). Завершите текущий этап или используйте принудительный переход (модератор)`,
    });
  }

  if (toIdx < fromIdx) {
    warnings.push({
      id: "rollback",
      label: "Откат этапа",
      level: "warning",
      message: `Возврат на этап «${statusLabel(to)}»`,
    });
  }

  if (toIdx > fromIdx) {
    for (const issue of exitChecks(proc)) {
      if (issue.level === "blocker") blockers.push(issue);
      else warnings.push(issue);
    }
    const cqIdx = flow.indexOf("collecting_quotes");
    if (cqIdx >= 0 && fromIdx <= cqIdx && toIdx > cqIdx && proc.quotesCount === 0) {
      blockers.push({
        id: "no_quotes",
        label: "Коммерческие предложения",
        level: "blocker",
        message: "Загрузите хотя бы одно коммерческое предложение",
      });
    }
  }

  if (force && skippedSteps > 0) {
    warnings.push({
      id: "forced_skip",
      label: "Принудительный переход",
      level: "warning",
      message: `Пропущено этапов: ${skippedSteps}`,
    });
  }

  const ok =
    !blockers.some((b) => b.id === "no_quotes") &&
    blockers.filter((b) => !(force && b.id === "skip_steps")).length === 0 &&
    (skippedSteps <= 0 || force);
  return { ok, blockers, warnings, skippedSteps: Math.max(0, skippedSteps) };
}

export function workflowSummary(proc: ProcWorkflowInput) {
  const checks = stageChecks(proc);
  const blockers = checks.filter((c) => c.level === "blocker");
  const warnings = checks.filter((c) => c.level === "warning");
  const flow = getFlow(proc.method);
  const idx = flowIndex(proc.method, proc.status);
  return {
    blockers: blockers.map((b) => b.message),
    warnings: warnings.map((w) => w.message),
    hasBlockers: blockers.length > 0,
    hasWarnings: warnings.length > 0,
    stepIndex: idx,
    stepTotal: flow.length,
    progress: idx >= 0 ? Math.round((idx / (flow.length - 1)) * 100) : 0,
    nextStatus: nextStatus(proc.method, proc.status),
  };
}

export function toWorkflowInput(row: {
  method: string;
  status: string;
  quotes?: { id: string }[];
  memos?: { id: string }[];
  documents?: { code: string; present: boolean }[];
  supervisorApprovedAt?: Date | null;
  directorApprovedAt?: Date | null;
  publishedAt?: Date | null;
  biddingStartAt?: Date | null;
  biddingEndAt?: Date | null;
  selectedQuoteId?: string | null;
  contractStoredName?: string | null;
  contractDate?: Date | null;
  contractNumber?: string | null;
  contractAmount?: unknown;
  deliveryUntil?: Date | null;
  acceptanceStartAt?: Date | null;
  acceptanceDueAt?: Date | null;
  contractDeptNote?: string | null;
  estimatedAmount?: unknown;
  fromArchive?: boolean;
  _count?: { quotes?: number; memos?: number };
}): ProcWorkflowInput {
  return {
    method: row.method,
    status: row.status,
    quotesCount: row._count?.quotes ?? row.quotes?.length ?? 0,
    memosCount: row._count?.memos ?? row.memos?.length ?? 0,
    documents: row.documents ?? [],
    supervisorApprovedAt: row.supervisorApprovedAt ?? null,
    directorApprovedAt: row.directorApprovedAt ?? null,
    publishedAt: row.publishedAt ?? null,
    biddingStartAt: row.biddingStartAt ?? null,
    biddingEndAt: row.biddingEndAt ?? null,
    selectedQuoteId: row.selectedQuoteId ?? null,
    contractStoredName: row.contractStoredName ?? null,
    contractDate: row.contractDate ?? null,
    contractNumber: row.contractNumber ?? null,
    contractAmount: row.contractAmount ?? null,
    deliveryUntil: row.deliveryUntil ?? null,
    acceptanceStartAt: row.acceptanceStartAt ?? null,
    acceptanceDueAt: row.acceptanceDueAt ?? null,
    contractDeptNote: row.contractDeptNote ?? null,
    estimatedAmount: row.estimatedAmount ?? null,
    fromArchive: Boolean(row.fromArchive),
  };
}

export const ESHOP_STAGE_LABELS: { status: string; short: string; hint: string }[] = [
  { status: "collecting_quotes", short: "1. КП", hint: "Запрос и сбор коммерческих предложений" },
  { status: "memo", short: "2. СЗ", hint: "Служебная записка" },
  { status: "supervisor_approval", short: "3. Руководитель", hint: "Согласование непосредственного руководителя" },
  { status: "director_approval", short: "4. Директор", hint: "Согласование директора" },
  { status: "transferred", short: "5. Договорной", hint: "Передача в договорной отдел" },
  { status: "published", short: "5б. Размещение", hint: "Дата размещения на площадке" },
  { status: "bidding", short: "6. Торги", hint: "Сроки начала и окончания торгов" },
  { status: "contracted", short: "7. Контракт", hint: "Поставщик, договор, сроки поставки и приёмки" },
];
