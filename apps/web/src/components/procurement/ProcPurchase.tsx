import { FormEvent, useState } from "react";
import { api, day } from "../../api";
import { toast } from "../../lib/toast";
import { normalizeProcStatus, type SectionVis } from "../../lib/proc-workflow";
import { ProcSection } from "./ProcSection";
import type { Proc, ProcDates } from "./procTypes";

export function ProcPurchase({
  p,
  vis,
  forceOpen,
  readOnly,
  dates,
  setDates,
  onRefresh,
}: {
  p: Proc;
  vis: SectionVis;
  forceOpen?: boolean;
  readOnly: boolean;
  dates: ProcDates;
  setDates: (fn: (d: ProcDates) => ProcDates) => void;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const norm = normalizeProcStatus(p.status);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/procurements/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          publishedAt: dates.publishedAt || null,
          biddingStartAt: dates.biddingStartAt || null,
          biddingEndAt: dates.biddingEndAt || null,
          contractDeptNote: dates.contractDeptNote || null,
        }),
      });
      toast("Сохранено", "ok");
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProcSection
      id="purchase"
      title="Закупка на площадке"
      hint="Размещение, торги и заметка договорному отделу"
      vis={vis}
      forceOpen={forceOpen}
      summary={
        <span className="muted">
          {p.publishedAt ? `размещено ${day(p.publishedAt)}` : "не размещено"}
          {p.biddingStartAt ? ` · торги с ${day(p.biddingStartAt)}` : ""}
        </span>
      }
    >
      <form onSubmit={save} className="proc-form-grid">
        {(norm === "transferred" || norm === "published" || vis === "collapsed" || forceOpen) && (
          <div className="field" id="proc-focus-published">
            <label>Дата размещения</label>
            <input
              type="date"
              value={dates.publishedAt}
              onChange={(e) => setDates((d) => ({ ...d, publishedAt: e.target.value }))}
              disabled={readOnly || busy}
            />
          </div>
        )}
        <div className="field" id="proc-focus-bidding">
          <label>Торги с</label>
          <input
            type="date"
            value={dates.biddingStartAt}
            onChange={(e) => setDates((d) => ({ ...d, biddingStartAt: e.target.value }))}
            disabled={readOnly || busy}
          />
        </div>
        <div className="field">
          <label>Торги до</label>
          <input
            type="date"
            value={dates.biddingEndAt}
            onChange={(e) => setDates((d) => ({ ...d, biddingEndAt: e.target.value }))}
            disabled={readOnly || busy}
          />
        </div>
        <div className="field proc-span-2" id="proc-focus-dept-note">
          <label>Заметка договорному отделу</label>
          <input
            value={dates.contractDeptNote}
            onChange={(e) => setDates((d) => ({ ...d, contractDeptNote: e.target.value }))}
            disabled={readOnly || busy}
          />
        </div>
        {!readOnly && (
          <div className="proc-form-actions proc-span-2">
            <button className="btn" type="submit" disabled={busy}>
              Сохранить
            </button>
          </div>
        )}
      </form>
    </ProcSection>
  );
}
