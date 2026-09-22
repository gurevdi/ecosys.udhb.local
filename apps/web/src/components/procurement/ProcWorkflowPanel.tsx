import { useState } from "react";
import { api, canDeleteContracts, STATUS, day } from "../../api";
import { toast } from "../../lib/toast";
import type { Me } from "../../App";
import {
  ESHOP_PHASES,
  normalizeProcStatus,
  needsQuotesToLeave,
  phaseClickMode,
  phaseIndex,
  phaseState,
  statusForPhaseClick,
  type ProcWorkflowMeta,
  type WorkflowCheck,
} from "../../lib/proc-workflow";

type Brief = { id: string; fullName: string; position: string | null };

export type ProcWorkflowProc = {
  id: string;
  method: string;
  status: string;
  department: { id: string };
  publishedAt: string | null;
  biddingStartAt: string | null;
  biddingEndAt: string | null;
  supervisorApprovedAt: string | null;
  directorApprovedAt: string | null;
  supervisorApprovedBy: Brief | null;
  directorApprovedBy: Brief | null;
  selectedQuoteId: string | null;
  contractFileName: string | null;
  contractStoredName: string | null;
  quotes: { id: string; supplierName: string }[];
  memos?: { id: string }[];
  workflow?: ProcWorkflowMeta;
};

function topIssue(checks: WorkflowCheck[]): WorkflowCheck | null {
  return checks.find((c) => c.level === "blocker") || checks.find((c) => c.level === "warning") || null;
}

export function ProcWorkflowPanel({
  proc,
  me,
  readOnly,
  stageFields,
  onStagePatch,
  onRefresh,
}: {
  proc: ProcWorkflowProc;
  me: Me["user"] | null;
  readOnly: boolean;
  stageFields: {
    publishedAt: string;
    biddingStartAt: string;
    biddingEndAt: string;
    contractDeptNote: string;
  };
  onStagePatch: (patch: Record<string, string | null>) => void;
  onRefresh: () => Promise<void>;
}) {
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (proc.method !== "electronic_shop" || !proc.workflow) return null;

  const wf = proc.workflow;
  const checks = wf.checks || [];
  const issue = topIssue(checks);
  const normStatus = normalizeProcStatus(proc.status);
  const canForce = me ? canDeleteContracts(me, proc.department.id) : false;
  const quotesCount = proc.quotes.length;
  const memosCount = proc.memos?.length ?? 0;
  const quoteBlocked = needsQuotesToLeave(normStatus, quotesCount);
  const flow = wf.flow?.length ? wf.flow : undefined;

  async function setStatus(targetStatus: string, useForce = false) {
    if (targetStatus === normStatus) return;
    setBusy(true);
    setErr("");
    try {
      await api(`/api/procurements/${proc.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: targetStatus, force: useForce && canForce }),
      });
      await onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сменить этап";
      setErr(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!wf.nextStatus) return;
    await setStatus(wf.nextStatus, force && canForce);
  }

  async function goToPhase(phaseIdx: number) {
    if (readOnly || busy) return;
    const mode = phaseClickMode(proc.status, phaseIdx, { memosCount });
    if (mode === "none") return;
    const target = statusForPhaseClick(proc.status, phaseIdx, {
      quotesCount,
      memosCount,
      flow,
    });
    if (!target || target === normStatus) return;
    if (mode === "next" && quoteBlocked) {
      setErr("Загрузите хотя бы одно коммерческое предложение");
      return;
    }
    await setStatus(target, mode === "next" && force && canForce);
  }

  async function approve(kind: "supervisor" | "director" | "all") {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/procurements/${proc.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ kind, advance: true }),
      });
      await onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка согласования";
      setErr(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  async function saveStage() {
    setBusy(true);
    try {
      await api(`/api/procurements/${proc.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          publishedAt: stageFields.publishedAt || null,
          biddingStartAt: stageFields.biddingStartAt || null,
          biddingEndAt: stageFields.biddingEndAt || null,
          contractDeptNote: stageFields.contractDeptNote || null,
        }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function pickSupplier(quoteId: string) {
    if (!quoteId) return;
    setBusy(true);
    try {
      await api(`/api/procurements/${proc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ selectedQuoteId: quoteId }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadContract(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      await api(`/api/procurements/${proc.id}/contract-file`, { method: "POST", body: fd });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  const showPurchaseFields = ["transferred", "published", "bidding"].includes(normStatus);
  const showContractFields = normStatus === "contracted";

  return (
    <section className="proc-wf">
      <nav className="proc-wf-phases" aria-label="Этапы закупки">
        {ESHOP_PHASES.map((phase, i) => {
          const state = phaseState(proc.status, i);
          const mode = phaseClickMode(proc.status, i, { memosCount });
          const clickable = !readOnly && mode !== "none" && !busy;
          const blocked = mode === "next" && quoteBlocked;
          const title =
            mode === "none" && i > phaseIndex(proc.status) + 1
              ? "Сначала завершите предыдущие этапы"
              : blocked
                ? "Нужно загрузить КП"
                : mode === "back"
                  ? "Вернуться на этот этап"
                  : mode === "next"
                    ? "Перейти к следующему этапу"
                    : mode === "toggle"
                      ? "Переключить раздел подготовки"
                      : undefined;
          return (
            <button
              key={phase.id}
              type="button"
              className={`proc-wf-phase proc-wf-phase--${state}${clickable ? " proc-wf-phase--click" : ""}`}
              disabled={!clickable || blocked}
              title={title}
              onClick={() => goToPhase(i)}
            >
              {phase.label}
            </button>
          );
        })}
      </nav>

      <div className="proc-wf-main">
        <div className="proc-wf-now">
          <span className="proc-wf-now-label">Сейчас</span>
          <strong>{STATUS[normStatus] || normStatus}</strong>
          {quoteBlocked && (
            <span className="proc-wf-tip proc-wf-tip--blocker">Загрузите хотя бы одно коммерческое предложение</span>
          )}
          {!quoteBlocked && issue && (
            <span className={`proc-wf-tip proc-wf-tip--${issue.level}`}>{issue.message}</span>
          )}
        </div>

        {!readOnly && (
          <div className="proc-wf-do">
            {["supervisor_approval", "director_approval", "approval"].includes(normStatus) && (
              <button type="button" className="btn" disabled={busy} onClick={() => approve("all")}>
                Согласовать
              </button>
            )}

            {showPurchaseFields && (
              <div className="proc-wf-fields">
                {(normStatus === "transferred" || normStatus === "published") && (
                  <label>
                    Размещение
                    <input
                      type="date"
                      value={stageFields.publishedAt}
                      onChange={(e) => onStagePatch({ publishedAt: e.target.value })}
                      disabled={busy}
                    />
                  </label>
                )}
                {(normStatus === "published" || normStatus === "bidding") && (
                  <>
                    <label>
                      Торги с
                      <input
                        type="date"
                        value={stageFields.biddingStartAt}
                        onChange={(e) => onStagePatch({ biddingStartAt: e.target.value })}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      Торги до
                      <input
                        type="date"
                        value={stageFields.biddingEndAt}
                        onChange={(e) => onStagePatch({ biddingEndAt: e.target.value })}
                        disabled={busy}
                      />
                    </label>
                  </>
                )}
                {normStatus === "transferred" && (
                  <label className="proc-wf-wide">
                    Заметка договорному
                    <input
                      value={stageFields.contractDeptNote}
                      onChange={(e) => onStagePatch({ contractDeptNote: e.target.value })}
                      disabled={busy}
                    />
                  </label>
                )}
                <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={saveStage}>
                  Сохранить
                </button>
              </div>
            )}

            {showContractFields && (
              <div className="proc-wf-fields">
                <label>
                  Поставщик
                  <select
                    value={proc.selectedQuoteId || ""}
                    onChange={(e) => pickSupplier(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">— выберите —</option>
                    {proc.quotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.supplierName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Договор
                  {proc.contractStoredName ? (
                    <span className="proc-wf-file">{proc.contractFileName}</span>
                  ) : (
                    <input
                      type="file"
                      disabled={busy}
                      onChange={(e) => e.target.files?.[0] && uploadContract(e.target.files[0])}
                    />
                  )}
                </label>
              </div>
            )}

            {wf.nextStatus && !["supervisor_approval", "director_approval"].includes(normStatus) && (
              <div className="proc-wf-next">
                {canForce && wf.hasBlockers && !quoteBlocked && (
                  <label className="proc-wf-force">
                    <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                    Пропустить проверки
                  </label>
                )}
                <button
                  type="button"
                  className="btn"
                  disabled={busy || quoteBlocked || (wf.hasBlockers && !force)}
                  onClick={advance}
                >
                  Далее: {STATUS[wf.nextStatus] || wf.nextStatus}
                </button>
              </div>
            )}

            {err && <p className="proc-wf-err">{err}</p>}
          </div>
        )}
      </div>

      {(proc.supervisorApprovedAt || proc.directorApprovedAt) && (
        <p className="proc-wf-done muted">
          {proc.supervisorApprovedAt && (
            <>
              Подпись руководителя · {day(proc.supervisorApprovedAt)}
              {proc.supervisorApprovedBy ? ` · отметил ${proc.supervisorApprovedBy.fullName}` : ""}
            </>
          )}
          {proc.supervisorApprovedAt && proc.directorApprovedAt && " · "}
          {proc.directorApprovedAt && (
            <>
              Подпись директора · {day(proc.directorApprovedAt)}
              {proc.directorApprovedBy ? ` · отметил ${proc.directorApprovedBy.fullName}` : ""}
            </>
          )}
        </p>
      )}
    </section>
  );
}
