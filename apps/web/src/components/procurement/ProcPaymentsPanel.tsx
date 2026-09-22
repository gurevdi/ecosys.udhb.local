import { FormEvent, useState } from "react";
import { api, day, money } from "../../api";
import { toast } from "../../lib/toast";

type PayFile = { id: string; fileName: string };
type Payment = {
  id: string;
  amount: string | null;
  paidAt: string | null;
  addressee: string;
  memoText: string | null;
  note: string | null;
  files: PayFile[];
  createdBy: { fullName: string } | null;
};

export function ProcPaymentsPanel({
  procurementId,
  payments,
  addressees,
  readOnly,
  onRefresh,
}: {
  procurementId: string;
  payments: Payment[];
  addressees: string[];
  readOnly: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({ amount: "", paidAt: "", addressee: addressees[0] || "", memoText: "", note: "" });
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!form.addressee.trim()) {
      toast("Укажите, на кого служебка по оплате");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/procurements/${procurementId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: form.amount ? Number(form.amount) : null,
          paidAt: form.paidAt || null,
          addressee: form.addressee.trim(),
          memoText: form.memoText || null,
          note: form.note || null,
        }),
      });
      setForm({ amount: "", paidAt: "", addressee: addressees[0] || form.addressee, memoText: "", note: "" });
      toast("Оплата добавлена", "ok");
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить оплату");
    } finally {
      setBusy(false);
    }
  }

  async function upload(paymentId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    await api(`/api/procurements/${procurementId}/payments/${paymentId}/files`, { method: "POST", body: fd });
    await onRefresh();
  }

  return (
    <section className="proc-section">
      <div className="proc-section-head">
        <div>
          <h2>Оплаты</h2>
          <p className="muted">Служебка и пакет в 1С — отдельно по каждой оплате. Адресат меняется (кто на месте).</p>
        </div>
      </div>
      {!readOnly && (
        <form onSubmit={create} className="proc-form-grid">
          <div className="field">
            <label>Адресат служебки</label>
            <input
              list="pay-addr"
              value={form.addressee}
              onChange={(e) => setForm({ ...form, addressee: e.target.value })}
              required
            />
            <datalist id="pay-addr">
              {addressees.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Сумма</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="field">
            <label>Дата оплаты</label>
            <input type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
          </div>
          <div className="field proc-span-2">
            <label>Текст служебки / заметка</label>
            <textarea rows={3} value={form.memoText} onChange={(e) => setForm({ ...form, memoText: e.target.value })} />
          </div>
          <div className="proc-form-actions proc-span-2">
            <button className="btn" type="submit" disabled={busy}>
              Добавить оплату
            </button>
          </div>
        </form>
      )}
      {payments.length === 0 ? (
        <p className="muted proc-empty">Оплат пока нет</p>
      ) : (
        <table className="proc-table">
          <thead>
            <tr>
              <th>Адресат</th>
              <th>Сумма</th>
              <th>Дата</th>
              <th>Файлы</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.addressee}
                  {p.memoText && <div className="muted">{p.memoText}</div>}
                </td>
                <td>{money(p.amount)}</td>
                <td>{day(p.paidAt)}</td>
                <td>
                  {p.files.map((f) => (
                    <a key={f.id} href={`/api/payment-files/${f.id}`} className="btn-link">
                      {f.fileName}
                    </a>
                  ))}
                  {!readOnly && (
                    <label className="btn ghost btn-sm">
                      + файл
                      <input
                        type="file"
                        hidden
                        onChange={(e) => e.target.files?.[0] && upload(p.id, e.target.files[0])}
                      />
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
