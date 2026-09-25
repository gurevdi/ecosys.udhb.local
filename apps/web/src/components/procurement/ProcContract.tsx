import { FormEvent, useState } from "react";
import { api, money } from "../../api";
import { toast } from "../../lib/toast";
import { procFileCanPreview } from "../../lib/procFiles";
import type { SectionVis } from "../../lib/proc-workflow";
import { ProcSection } from "./ProcSection";
import type { Brief, Proc, ProcDates } from "./procTypes";

export function ProcContract({
  p,
  vis,
  forceOpen,
  readOnly,
  people,
  dates,
  setDates,
  invalid,
  setInvalid,
  parseWarnings,
  setParseWarnings,
  onPreview,
  onRefresh,
}: {
  p: Proc;
  vis: SectionVis;
  forceOpen?: boolean;
  readOnly: boolean;
  people: Brief[];
  dates: ProcDates;
  setDates: (fn: (d: ProcDates) => ProcDates) => void;
  invalid: Record<string, boolean>;
  setInvalid: (fn: (inv: Record<string, boolean>) => Record<string, boolean>) => void;
  parseWarnings: string[];
  setParseWarnings: (w: string[]) => void;
  onPreview: (url: string, name: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  function pickExecutor(userId: string) {
    const u = people.find((x) => x.id === userId);
    setDates((d) => ({
      ...d,
      executorUserId: userId,
      executorName: userId ? u?.fullName || d.executorName : d.executorName,
    }));
    setInvalid((inv) => ({ ...inv, executorName: false }));
  }

  async function pickSupplier(quoteId: string) {
    if (!quoteId) return;
    setBusy(true);
    try {
      await api(`/api/procurements/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ selectedQuoteId: quoteId }),
      });
      toast("Поставщик закреплён", "ok");
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось выбрать поставщика");
    } finally {
      setBusy(false);
    }
  }

  async function uploadContract(file?: File) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api<{ parsed?: { warnings?: string[] } }>(`/api/procurements/${p.id}/contract-file`, {
        method: "POST",
        body: fd,
      });
      setParseWarnings(res.parsed?.warnings || []);
      toast("Файл загружен, проверьте реквизиты", "ok");
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось загрузить договор");
    }
  }

  async function saveDates(e: FormEvent) {
    e.preventDefault();
    const miss: Record<string, boolean> = {};
    if (!dates.contractDate) miss.contractDate = true;
    if (!dates.validUntil && !dates.deliveryUntil) miss.validUntil = true;
    setInvalid(() => miss);
    if (Object.keys(miss).length) {
      toast("Заполните подсвеченные поля");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/procurements/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          contractNumber: dates.contractNumber || null,
          contractAmount: dates.contractAmount ? Number(dates.contractAmount) : null,
          contractDate: dates.contractDate || null,
          deliveryUntil: dates.deliveryUntil || null,
          validUntil: dates.validUntil || null,
          executorName: dates.executorName || null,
          executorUserId: dates.executorUserId || null,
          performanceDays: dates.performanceDays ? Number(dates.performanceDays) : null,
          acceptanceDays: dates.acceptanceDays ? Number(dates.acceptanceDays) : 10,
          contractKind: (dates.contractKind || null) as "renewable" | "onetime" | null,
          contractComment: dates.contractComment || null,
        }),
      });
      setInvalid(() => ({}));
      toast("Сохранено", "ok");
      await onRefresh();
    } catch (err) {
      const fields = (err as { fields?: string[] }).fields || [];
      const next: Record<string, boolean> = {};
      for (const f of fields) next[f] = true;
      setInvalid(() => next);
      toast(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  const selected = p.quotes.find((q) => q.id === p.selectedQuoteId);

  return (
    <ProcSection
      id="contract"
      title="Заключение контракта"
      hint="Поставщик, реквизиты, файл договора и сроки"
      vis={vis}
      forceOpen={forceOpen}
      summary={
        <span className="muted">
          {selected ? selected.supplierName : "поставщик не выбран"}
          {p.contractNumber ? ` · №${p.contractNumber}` : ""}
          {p.contractAmount ? ` · ${money(p.contractAmount)}` : ""}
        </span>
      }
    >
      <form onSubmit={saveDates} className="proc-form-grid">
        <div className="field proc-span-2" id="proc-focus-supplier">
          <label>Поставщик из КП</label>
          <select
            value={p.selectedQuoteId || ""}
            onChange={(e) => pickSupplier(e.target.value)}
            disabled={readOnly || busy}
          >
            <option value="">— выберите —</option>
            {p.quotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.supplierName}
                {q.amount ? ` · ${money(q.amount)}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field proc-span-2" id="proc-focus-contract-file">
          <label>Документ договора</label>
          {p.contractStoredName ? (
            <div className="proc-file-row">
              <button
                type="button"
                className="btn-link"
                onClick={() =>
                  procFileCanPreview(p.contractFileName || "contract")
                    ? onPreview(`/api/procurements/${p.id}/contract-file`, p.contractFileName || "Договор")
                    : window.open(`/api/procurements/${p.id}/contract-file`, "_blank")
                }
              >
                {p.contractFileName}
              </button>
              {!readOnly && (
                <label className="linkish">
                  Заменить
                  <input type="file" hidden accept=".pdf,.doc,.docx" onChange={(e) => uploadContract(e.target.files?.[0])} />
                </label>
              )}
            </div>
          ) : (
            !readOnly && (
              <input type="file" accept=".doc,.docx,.pdf" onChange={(e) => uploadContract(e.target.files?.[0])} />
            )
          )}
          {parseWarnings.length > 0 && (
            <ul className="parse-warn">
              {parseWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="field" id="proc-focus-contract-number">
          <label>№ контракта</label>
          <input
            value={dates.contractNumber}
            onChange={(e) => setDates((d) => ({ ...d, contractNumber: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div className={invalid.contractDate ? "field field-invalid" : "field"} id="proc-focus-contract-date">
          <label>Дата заключения</label>
          <input
            type="date"
            value={dates.contractDate}
            onChange={(e) => {
              setDates((d) => ({ ...d, contractDate: e.target.value }));
              setInvalid((inv) => ({ ...inv, contractDate: false }));
            }}
            disabled={readOnly}
          />
        </div>
        <div className={invalid.validUntil ? "field field-invalid" : "field"}>
          <label>Действует до</label>
          <input
            type="date"
            value={dates.validUntil}
            onChange={(e) => {
              setDates((d) => ({ ...d, validUntil: e.target.value }));
              setInvalid((inv) => ({ ...inv, validUntil: false }));
            }}
            disabled={readOnly}
          />
        </div>
        <div className="field" id="proc-focus-contract-amount">
          <label>Сумма по итогам торгов, ₽</label>
          <input
            type="number"
            step="0.01"
            value={dates.contractAmount}
            onChange={(e) => setDates((d) => ({ ...d, contractAmount: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div className={invalid.deliveryUntil ? "field field-invalid" : "field"} id="proc-focus-delivery">
          <label>Исполнить до</label>
          <input
            type="date"
            value={dates.deliveryUntil}
            onChange={(e) => {
              setDates((d) => ({ ...d, deliveryUntil: e.target.value }));
              setInvalid((inv) => ({ ...inv, deliveryUntil: false }));
            }}
            disabled={readOnly}
          />
        </div>
        <div className="field">
          <label>Срок исполнения, дней</label>
          <input
            type="number"
            value={dates.performanceDays}
            onChange={(e) => setDates((d) => ({ ...d, performanceDays: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div className="field">
          <label>Срок приёмки, дней</label>
          <input
            type="number"
            value={dates.acceptanceDays}
            onChange={(e) => setDates((d) => ({ ...d, acceptanceDays: e.target.value }))}
            disabled={readOnly}
          />
        </div>
        <div className="field">
          <label>Исполнитель из списка</label>
          <select value={dates.executorUserId} onChange={(e) => pickExecutor(e.target.value)} disabled={readOnly}>
            <option value="">— не выбран —</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className={invalid.executorName ? "field field-invalid" : "field"}>
          <label>Исполнитель / поставщик</label>
          <input
            value={dates.executorName}
            onChange={(e) => {
              setDates((d) => ({
                ...d,
                executorName: e.target.value,
                executorUserId:
                  d.executorUserId && people.find((x) => x.id === d.executorUserId)?.fullName === e.target.value
                    ? d.executorUserId
                    : "",
              }));
              setInvalid((inv) => ({ ...inv, executorName: false }));
            }}
            disabled={readOnly}
            placeholder="если не из списка — введите вручную"
          />
        </div>
        <div className="field">
          <label>Тип договора</label>
          <select
            value={dates.contractKind}
            onChange={(e) => setDates((d) => ({ ...d, contractKind: e.target.value }))}
            disabled={readOnly}
          >
            <option value="">— не указан —</option>
            <option value="renewable">Продляемый</option>
            <option value="onetime">Разовый</option>
          </select>
        </div>
        <div className="field proc-span-2">
          <label>Комментарий</label>
          <textarea
            rows={2}
            value={dates.contractComment}
            onChange={(e) => setDates((d) => ({ ...d, contractComment: e.target.value }))}
            disabled={readOnly}
            placeholder="примечания по договору"
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
