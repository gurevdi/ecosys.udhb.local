import { FormEvent, useState } from "react";
import { api, day, money } from "../../api";
import { toast } from "../../lib/toast";
import type { SectionVis } from "../../lib/proc-workflow";
import { ProcPaymentsPanel } from "./ProcPaymentsPanel";
import { ProcSection } from "./ProcSection";
import type { Proc, ProcDates } from "./procTypes";

export function ProcExecution({
  p,
  vis,
  forceOpen,
  readOnly,
  dates,
  setDates,
  payAddressees,
  onRefresh,
}: {
  p: Proc;
  vis: SectionVis;
  forceOpen?: boolean;
  readOnly: boolean;
  dates: ProcDates;
  setDates: (fn: (d: ProcDates) => ProcDates) => void;
  payAddressees: string[];
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/procurements/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          actualDeliveryAt: dates.actualDeliveryAt || null,
          acceptanceDays: dates.acceptanceDays ? Number(dates.acceptanceDays) : 10,
          deliveryUntil: dates.deliveryUntil || null,
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
      id="execution"
      title="Исполнение и приёмка"
      hint={
        p.category === "supply"
          ? "Зафиксируйте фактическую дату поставки. Пеня считается от срока поставки."
          : "Фактическая дата исполнения и ориентир приёмки документов."
      }
      vis={vis}
      forceOpen={forceOpen}
      summary={
        <span className="muted">
          {p.actualDeliveryAt ? `поставка ${day(p.actualDeliveryAt)}` : "поставка не зафиксирована"}
          {p.acceptanceDueAt ? ` · приёмка до ${day(p.acceptanceDueAt)}` : ""}
          {p.payments?.length ? ` · оплат: ${p.payments.length}` : ""}
        </span>
      }
    >
      {(vis === "collapsed" || p.contractNumber || p.contractAmount) && (
        <div className="kv" style={{ marginBottom: 16 }}>
          <div className="k">Контракт</div>
          <div className="v">
            {p.contractNumber ? `№${p.contractNumber}` : "без номера"}
            {p.contractDate ? ` от ${day(p.contractDate)}` : ""}
            {p.contractAmount ? ` · ${money(p.contractAmount)}` : ""}
            {p.executorName ? ` · ${p.executorName}` : ""}
          </div>
        </div>
      )}

      <form onSubmit={save} className="proc-form-grid">
        <div className="field">
          <label>По договору исполнить до</label>
          <input type="date" value={dates.deliveryUntil} disabled />
        </div>
        <div className="field" id="proc-focus-actual-delivery">
          <label>Фактическая дата поставки</label>
          <input
            type="date"
            value={dates.actualDeliveryAt}
            onChange={(e) => setDates((d) => ({ ...d, actualDeliveryAt: e.target.value }))}
            disabled={readOnly || busy}
          />
        </div>
        <div className="field">
          <label>Срок приёмки, дней</label>
          <input
            type="number"
            value={dates.acceptanceDays}
            onChange={(e) => setDates((d) => ({ ...d, acceptanceDays: e.target.value }))}
            disabled={readOnly || busy}
          />
        </div>
        <div className="field">
          <label>Ориентир приёмки документов</label>
          <input type="date" value={dates.acceptanceDueAt} disabled />
          <p className="muted">Считается от фактической поставки + {dates.acceptanceDays || 10} дн.</p>
        </div>
        {!readOnly && (
          <div className="proc-form-actions proc-span-2">
            <button className="btn" type="submit" disabled={busy}>
              Сохранить
            </button>
          </div>
        )}
      </form>

      <ProcPaymentsPanel
        procurementId={p.id}
        payments={p.payments || []}
        addressees={payAddressees}
        readOnly={readOnly}
        onRefresh={onRefresh}
      />
    </ProcSection>
  );
}
