/** Группы этапов для компактного отображения (электронный магазин) */
export const ESHOP_PHASES = [
  { id: "prep", label: "Подготовка", statuses: ["draft", "collecting_quotes", "memo"] },
  { id: "approve", label: "Согласование", statuses: ["supervisor_approval", "director_approval", "approval"] },
  { id: "purchase", label: "Закупка", statuses: ["transferred", "published", "bidding", "returned"] },
  { id: "contract", label: "Контракт", statuses: ["contracted"] },
  { id: "exec", label: "Исполнение", statuses: ["execution", "acceptance_window", "completed"] },
] as const;

export const CONTRACT_LIST_STATUSES = ["contracted", "execution", "acceptance_window", "completed"] as const;

export type WorkflowCheck = {
  id: string;
  label: string;
  level: "blocker" | "warning";
  message: string;
};

export type ProcWorkflowMeta = {
  flow: string[];
  blockers: string[];
  warnings: string[];
  hasBlockers: boolean;
  hasWarnings: boolean;
  stepIndex: number;
  stepTotal: number;
  progress: number;
  nextStatus: string | null;
  checks?: WorkflowCheck[];
};

export type ListWorkflowMeta = {
  blockers: string[];
  warnings: string[];
  hasBlockers: boolean;
  hasWarnings: boolean;
};

export function normalizeProcStatus(status: string) {
  return status === "approval" ? "supervisor_approval" : status;
}

export function phaseIndex(status: string): number {
  const s = normalizeProcStatus(status);
  for (let i = 0; i < ESHOP_PHASES.length; i++) {
    if (ESHOP_PHASES[i].statuses.includes(s as never)) return i;
  }
  return s === "rejected" ? -1 : 0;
}

export function phaseState(current: string, phaseIdx: number): "done" | "active" | "pending" {
  const cur = phaseIndex(current);
  if (current === "rejected") return "pending";
  if (cur > phaseIdx) return "done";
  if (cur === phaseIdx) return "active";
  return "pending";
}

export function isContractStage(status: string) {
  return (CONTRACT_LIST_STATUSES as readonly string[]).includes(status);
}

/** Какая секция карточки активна на текущем этапе ЭМ */
export type EshopActiveSection = "quotes" | "memo" | "approval" | "contract" | "execution";

export function eshopActiveSection(status: string): EshopActiveSection | null {
  const s = normalizeProcStatus(status);
  if (s === "draft" || s === "collecting_quotes") return "quotes";
  if (s === "memo") return "memo";
  if (s === "supervisor_approval" || s === "director_approval") return "approval";
  if (s === "transferred" || s === "published" || s === "bidding" || s === "returned") return null;
  if (s === "contracted") return "contract";
  if (s === "execution" || s === "acceptance_window" || s === "completed") return "execution";
  return null;
}

export function showEshopSection(status: string, section: EshopActiveSection) {
  return eshopActiveSection(status) === section;
}

export const ESHOP_FLOW = [
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

export function flowIndex(status: string, flow: readonly string[] = ESHOP_FLOW): number {
  const s = normalizeProcStatus(status);
  const idx = flow.indexOf(s);
  return idx >= 0 ? idx : -1;
}

/** Статус для перехода по клику на фазу (null — без смены) */
export function statusForPhaseClick(
  currentStatus: string,
  targetPhaseIdx: number,
  opts: { quotesCount: number; memosCount: number; flow?: readonly string[] }
): string | null {
  const flow = opts.flow ?? ESHOP_FLOW;
  const cur = normalizeProcStatus(currentStatus);
  const curPhase = phaseIndex(cur);
  if (targetPhaseIdx < 0 || targetPhaseIdx >= ESHOP_PHASES.length) return null;

  if (targetPhaseIdx === curPhase) {
    if (targetPhaseIdx === 0) {
      if (cur === "memo") return "collecting_quotes";
      if (cur === "collecting_quotes" && opts.memosCount > 0) return "memo";
      if (cur === "draft") return "collecting_quotes";
    }
    return null;
  }

  const targetPhase = ESHOP_PHASES[targetPhaseIdx];
  const curFi = flowIndex(cur, flow);

  if (targetPhaseIdx < curPhase) {
    if (targetPhase.id === "prep") {
      return opts.memosCount > 0 ? "memo" : "collecting_quotes";
    }
    let best: string = targetPhase.statuses[0];
    for (const st of targetPhase.statuses) {
      const si = flowIndex(st, flow);
      if (si >= 0 && si < curFi) best = st;
    }
    return best;
  }

  return targetPhase.statuses[0];
}

/** Можно ли кликнуть фазу (соседняя вперёд, назад или переключение внутри подготовки) */
export function phaseClickMode(
  currentStatus: string,
  targetPhaseIdx: number,
  opts: { memosCount: number }
): "none" | "back" | "next" | "toggle" {
  const cur = normalizeProcStatus(currentStatus);
  const curPhase = phaseIndex(cur);
  if (targetPhaseIdx < 0 || targetPhaseIdx >= ESHOP_PHASES.length) return "none";
  if (targetPhaseIdx === curPhase) {
    if (targetPhaseIdx === 0 && (cur === "memo" || (cur === "collecting_quotes" && opts.memosCount > 0) || cur === "draft"))
      return "toggle";
    return "none";
  }
  if (targetPhaseIdx < curPhase) return "back";
  if (targetPhaseIdx === curPhase + 1) return "next";
  return "none";
}

export function needsQuotesToLeave(status: string, quotesCount: number) {
  const s = normalizeProcStatus(status);
  return (s === "draft" || s === "collecting_quotes") && quotesCount === 0;
}
