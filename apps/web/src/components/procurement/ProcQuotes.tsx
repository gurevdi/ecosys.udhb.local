import { FormEvent, useEffect, useState } from "react";
import { api, money } from "../../api";
import { toast } from "../../lib/toast";
import { procFileCanPreview } from "../../lib/procFiles";
import type { SectionVis } from "../../lib/proc-workflow";
import { SupplierCombo } from "../SupplierCombo";
import { ProcSection } from "./ProcSection";
import type { Proc } from "./procTypes";

export function ProcQuotes({
  p,
  vis,
  forceOpen,
  readOnly,
  openForm,
  onOpenForm,
  onPreview,
  onRefresh,
}: {
  p: Proc;
  vis: SectionVis;
  forceOpen?: boolean;
  readOnly: boolean;
  openForm?: boolean;
  onOpenForm?: (open: boolean) => void;
  onPreview: (url: string, name: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [quote, setQuote] = useState({
    supplierName: "",
    supplierId: "",
    inn: "",
    phone: "",
    comment: "",
    amount: "",
    file: null as File | null,
  });

  useEffect(() => {
    if (openForm) setShowForm(true);
  }, [openForm]);

  function toggleForm() {
    const next = !showForm;
    setShowForm(next);
    onOpenForm?.(next);
  }

  async function uploadQuote(e: FormEvent) {
    e.preventDefault();
    if (!quote.file) return;
    if (!quote.supplierName.trim()) {
      setInvalid({ supplierName: true });
      toast("Наименование поставщика обязательно");
      return;
    }
    const fd = new FormData();
    fd.append("file", quote.file);
    fd.append("supplierName", quote.supplierName.trim());
    if (quote.supplierId) fd.append("supplierId", quote.supplierId);
    if (quote.inn) fd.append("inn", quote.inn);
    if (quote.phone) fd.append("phone", quote.phone);
    if (quote.comment) fd.append("comment", quote.comment);
    if (quote.amount) fd.append("amount", quote.amount);
    try {
      await api(`/api/procurements/${p.id}/quotes`, { method: "POST", body: fd });
      setQuote({ supplierName: "", supplierId: "", inn: "", phone: "", comment: "", amount: "", file: null });
      setShowForm(false);
      onOpenForm?.(false);
      setInvalid({});
      toast("КП загружено", "ok");
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось загрузить КП");
    }
  }

  const selected = p.quotes.find((q) => q.id === p.selectedQuoteId);

  return (
    <ProcSection
      id="quotes"
      title="Коммерческие предложения"
      hint={vis === "active" ? "Загрузите КП от поставщиков" : undefined}
      vis={vis}
      forceOpen={forceOpen}
      action={
        !readOnly && vis !== "stub" ? (
          <button className="btn ghost btn-sm" type="button" onClick={toggleForm}>
            {showForm ? "Скрыть" : "+ Добавить КП"}
          </button>
        ) : undefined
      }
      summary={
        <span className="muted">
          {p.quotes.length} шт.
          {selected ? ` · выбрано: ${selected.supplierName}` : ""}
        </span>
      }
    >
      {showForm && !readOnly && (
        <form id="proc-focus-quote-form" onSubmit={uploadQuote} className="proc-inline-form proc-quote-form">
          <SupplierCombo
            value={quote.supplierName}
            supplierId={quote.supplierId}
            extra={{ inn: quote.inn, phone: quote.phone, comment: quote.comment }}
            required
            invalid={Boolean(invalid.supplierName)}
            onChange={(next) => {
              setQuote({
                ...quote,
                supplierName: next.name,
                supplierId: next.supplierId,
                inn: next.inn,
                phone: next.phone,
                comment: next.comment,
              });
              setInvalid((inv) => ({ ...inv, supplierName: false }));
            }}
          />
          <div className="field">
            <label>Сумма</label>
            <input type="number" step="0.01" value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value })} />
          </div>
          <div className="field">
            <label>Файл</label>
            <input type="file" onChange={(e) => setQuote({ ...quote, file: e.target.files?.[0] || null })} required />
          </div>
          <button className="btn" type="submit">
            Загрузить
          </button>
        </form>
      )}
      {p.quotes.length === 0 ? (
        <p className="muted proc-empty">КП пока нет</p>
      ) : (
        <table className="reg">
          <thead>
            <tr>
              <th>Поставщик</th>
              <th>Файл</th>
              <th>Отметка</th>
              <th className="sum">Цена</th>
            </tr>
          </thead>
          <tbody>
            {p.quotes.map((q) => (
              <tr key={q.id} className={p.selectedQuoteId === q.id ? "row-gold" : ""}>
                <td>
                  <div className="name">{q.supplierName}</div>
                </td>
                <td className="proc-file-cell">
                  <span className="ftag">{q.fileName.split(".").pop()?.toUpperCase() || "FILE"}</span>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() =>
                      procFileCanPreview(q.fileName)
                        ? onPreview(`/api/quotes/${q.id}/file`, q.fileName)
                        : window.open(`/api/quotes/${q.id}/file`, "_blank")
                    }
                  >
                    {q.fileName}
                  </button>
                </td>
                <td>
                  {p.selectedQuoteId === q.id ? (
                    <span className="st st--gold">выбрано</span>
                  ) : (
                    <span className="st st--muted">—</span>
                  )}
                </td>
                <td className="sum">{money(q.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ProcSection>
  );
}
