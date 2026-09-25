import { useState } from "react";
import { api, canDeleteContracts, day, STATUS } from "../../api";
import { toast } from "../../lib/toast";
import type { Me } from "../../App";
import {
  ESHOP_PHASES,
  normalizeProcStatus,
  needsQuotesToLeave,
  phaseClickMode,
  phaseIndex,
  phaseState,
  PHASE_NUMERALS,
  statusForPhaseClick,
} from "../../lib/proc-workflow";
import type { Proc } from "./procTypes";

export function ProcProgress({
  proc,
  me,
  readOnly,
  onRefresh,
}: {
  proc: Proc;
  me: Me["user"] | null;
  readOnly: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const wf = proc.workflow;
  if (!wf) return null;

  const normStatus = normalizeProcStatus(proc.status);
  const canForce = me ? canDeleteContracts(me, proc.department.id) : false;
  const quotesCount = proc.quotes.length;
  const memosCount = proc.memos.length;
  const quoteBlocked = needsQuotesToLeave(normStatus, quotesCount);
  const flow = wf.flow?.length ? wf.flow : undefined;
  const isApproval = ["supervisor_approval", "director_approval", "approval"].includes(normStatus);

  async function setStatus(targetStatus: string, useForce = false) {
    if (targetStatus === normStatus) return;
    setBusy(true);
    setErr("");
    try {
      await api(`/api/procurements/${proc.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: targetStatus, force: useForce && canForce }),
      });
      toast("Этап обновлён", "ok");
      await onRefresh();
      document.getElementById("proc-require")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сменить этап";
      setErr(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!wf?.nextStatus) return;
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

  async function approve() {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/procurements/${proc.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ kind: "all", advance: true }),
      });
      toast("Согласовано", "ok");
      await onRefresh();
      document.getElementById("proc-require")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка согласования";
      setErr(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="proc-progress">
      <div className="wf wf--compact" role="navigation" aria-label="Этапы закупки">
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
              className={`wf-step${state === "done" ? " done" : state === "active" ? " now" : ""}${clickable ? " wf-step--click" : ""}`}
              disabled={!clickable || blocked}
              title={title}
              onClick={() => goToPhase(i)}
            >
              <div className="t">
                {PHASE_NUMERALS[i]}. {phase.label}
              </div>
            </button>
          );
        })}
      </div>

      {!readOnly && (isApproval || wf.nextStatus) && (
        <div className="proc-progress-bar proc-progress-bar--lean">
          {isApproval && (
            <button type="button" className="btn" id="proc-focus-approve" disabled={busy} onClick={approve}>
              Согласовать
            </button>
          )}

          {wf.nextStatus && !["supervisor_approval", "director_approval"].includes(normStatus) && (
            <>
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
            </>
          )}

          {err && <p className="proc-wf-err">{err}</p>}
        </div>
      )}

      {(proc.supervisorApprovedAt || proc.directorApprovedAt) && (
        <p className="proc-wf-done muted">
          {proc.supervisorApprovedAt && (
            <>
              Подпись руководителя · {day(proc.supervisorApprovedAt)}
              {proc.supervisorApprovedBy ? ` · ${proc.supervisorApprovedBy.fullName}` : ""}
            </>
          )}
          {proc.supervisorApprovedAt && proc.directorApprovedAt && " · "}
          {proc.directorApprovedAt && (
            <>
              Подпись директора · {day(proc.directorApprovedAt)}
              {proc.directorApprovedBy ? ` · ${proc.directorApprovedBy.fullName}` : ""}
            </>
          )}
        </p>
      )}
    </section>
  );
}
