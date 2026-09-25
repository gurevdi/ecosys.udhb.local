import { FormEvent, useState } from "react";
import { api, CATEGORY, CATEGORY_IDS, METHOD, money } from "../../api";
import { toast } from "../../lib/toast";
import { procFileCanPreview } from "../../lib/procFiles";
import type { SectionVis } from "../../lib/proc-workflow";
import { ProcSection } from "./ProcSection";
import type { Proc, ProcDates, ProcDoc } from "./procTypes";

export function ProcOverview({
  p,
  vis,
  forceOpen,
  readOnly,
  dates,
  setDates,
  invalid,
  setInvalid,
  onPreview,
  onRefresh,
}: {
  p: Proc;
  vis: SectionVis;
  forceOpen?: boolean;
  readOnly: boolean;
  dates: ProcDates;
  setDates: (fn: (d: ProcDates) => ProcDates) => void;
  invalid: Record<string, boolean>;
  setInvalid: (fn: (inv: Record<string, boolean>) => Record<string, boolean>) => void;
  onPreview: (url: string, name: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveBasics(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/procurements/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: dates.title.trim() || p.title,
          category: p.category,
          estimatedAmount: dates.estimatedAmount ? Number(dates.estimatedAmount) : null,
        }),
      });
      toast("Сохранено", "ok");
      setEditing(false);
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(category: string) {
    await api(`/api/procurements/${p.id}`, { method: "PATCH", body: JSON.stringify({ category }) });
    await onRefresh();
  }

  async function toggleDoc(doc: ProcDoc) {
    await api(`/api/procurements/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ documents: [{ id: doc.id, present: !doc.present }] }),
    });
    await onRefresh();
  }

  async function uploadDocFile(doc: ProcDoc, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/api/procurements/${p.id}/documents/${doc.id}/file`, { method: "POST", body: fd });
      toast(`Файл «${doc.title}» прикреплён`, "ok");
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось загрузить файл");
    }
  }

  async function removeDocFile(doc: ProcDoc) {
    if (!confirm(`Удалить файл «${doc.fileName}»?`)) return;
    try {
      await api(`/api/procurements/${p.id}/documents/${doc.id}/file`, { method: "DELETE" });
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось удалить файл");
    }
  }

  const docsReady = p.documents.filter((d) => d.present || d.storedName).length;

  return (
    <ProcSection
      id="overview"
      title="Общие сведения"
      vis={vis}
      forceOpen={forceOpen}
      action={
        !readOnly && !editing ? (
          <button type="button" className="sec-link" onClick={() => setEditing(true)}>
            изменить
          </button>
        ) : undefined
      }
      summary={
        <span className="muted">
          {p.title} · {CATEGORY[p.category] || p.category} · {METHOD[p.method]} · док. {docsReady}/{p.documents.length}
        </span>
      }
    >
      {editing && !readOnly ? (
        <form onSubmit={saveBasics} className="proc-form-grid">
          <div className="field proc-span-2">
            <label>Название</label>
            <input
              id="proc-focus-estimate"
              value={dates.title}
              onChange={(e) => setDates((d) => ({ ...d, title: e.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Тип договора</label>
            <select value={p.category} onChange={(e) => saveCategory(e.target.value)}>
              {CATEGORY_IDS.map((cid) => (
                <option key={cid} value={cid}>
                  {CATEGORY[cid]}
                </option>
              ))}
            </select>
          </div>
          <div className={`field${invalid.estimatedAmount ? " field-invalid" : ""}`}>
            <label>Начальная цена, ₽</label>
            <input
              type="number"
              step="0.01"
              value={dates.estimatedAmount}
              onChange={(e) => {
                setDates((d) => ({ ...d, estimatedAmount: e.target.value }));
                setInvalid((inv) => ({ ...inv, estimatedAmount: false }));
              }}
            />
          </div>
          <div className="proc-form-actions proc-span-2">
            <button className="btn" type="submit" disabled={busy}>
              Сохранить
            </button>
            <button className="btn ghost" type="button" onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <div className="kv">
          <div className="k">Закупка</div>
          <div className="v">{p.title}</div>
          <div className="k">Тип договора</div>
          <div className="v">
            {CATEGORY[p.category] || p.category}
            <span className="muted"> · {METHOD[p.method]}</span>
          </div>
          <div className="k">Подразделение</div>
          <div className="v">{p.department.name}</div>
          <div className="k">Инициатор</div>
          <div className="v">{p.initiator.fullName}</div>
          <div className="k">Начальная цена</div>
          <div className="v">{money(p.estimatedAmount)}</div>
          <div className="k">Комплект документов</div>
          <div id="proc-focus-docs">
            <ul className="check">
              {p.documents.map((d) => {
                const ext = (d.fileName || "").split(".").pop()?.toUpperCase() || "";
                return (
                  <li key={d.id} className={d.present || d.storedName ? "ok" : "no"}>
                    {d.title}
                    {d.code === "kp" && p.quotes.length > 0 && <span className="note-r"> — {p.quotes.length} шт.</span>}
                    {d.code === "memo" && p.memos.length > 0 && <span className="note-r"> — {p.memos.length} шт.</span>}
                    {d.note && <span className="note-r"> — {d.note}</span>}
                    <span className="proc-doc-file">
                      {d.storedName ? (
                        <>
                          {ext && <span className="ftag">{ext}</span>}
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() =>
                              procFileCanPreview(d.fileName || "")
                                ? onPreview(`/api/proc-documents/${d.id}/file`, d.fileName || d.title)
                                : window.open(`/api/proc-documents/${d.id}/file`, "_blank")
                            }
                          >
                            {d.fileName}
                          </button>
                          {!readOnly && (
                            <button type="button" className="proc-doc-del" title="Удалить файл" onClick={() => removeDocFile(d)}>
                              ×
                            </button>
                          )}
                        </>
                      ) : (
                        !readOnly && (
                          <label className="linkish proc-doc-attach">
                            Прикрепить файл
                            <input
                              type="file"
                              hidden
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.zip"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void uploadDocFile(d, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )
                      )}
                      {!d.storedName && !readOnly && (
                        <button
                          type="button"
                          className="linkish proc-doc-manual"
                          title="Отметить без файла (документ на бумаге)"
                          onClick={() => toggleDoc(d)}
                        >
                          {d.present ? "снять отметку" : "отметить наличие"}
                        </button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </ProcSection>
  );
}
