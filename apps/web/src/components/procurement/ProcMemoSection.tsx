import { FormEvent, useEffect, useState } from "react";
import { api, day } from "../../api";
import { toast } from "../../lib/toast";
import { memoAddresseeLines, type MemoSignatory } from "../../lib/memo-signatories";
import { normalizeProcStatus, type SectionVis } from "../../lib/proc-workflow";
import { ProcSection } from "./ProcSection";
import type { Brief, Proc, ProcMemo } from "./procTypes";

export function ProcMemoSection({
  p,
  vis,
  forceOpen,
  readOnly,
  people,
  memoSignatories,
  openForm,
  onOpenForm,
  onRefresh,
}: {
  p: Proc;
  vis: SectionVis;
  forceOpen?: boolean;
  readOnly: boolean;
  people: Brief[];
  memoSignatories: { director: MemoSignatory | null; deputy: MemoSignatory | null };
  openForm?: boolean;
  onOpenForm?: (open: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const norm = normalizeProcStatus(p.status);
  const isApproval = ["supervisor_approval", "director_approval", "approval"].includes(norm);
  const [showForm, setShowForm] = useState(p.memos.length === 0 && norm === "memo");
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [memo, setMemo] = useState({
    addressee: "director",
    fromUserId: people[0]?.id || "",
    agreedUserId: "",
    agreedPosition: "",
    agreedFullName: "",
    compiledById: people[0]?.id || "",
    letterheadKind: "department",
    body: "",
  });

  useEffect(() => {
    if (people.length && !memo.fromUserId) {
      setMemo((m) => ({
        ...m,
        fromUserId: m.fromUserId || people[0]?.id || "",
        compiledById: m.compiledById || people[0]?.id || "",
      }));
    }
  }, [people]);

  useEffect(() => {
    if (openForm) {
      setShowForm(true);
    }
  }, [openForm]);

  const selectedSignatory = memo.addressee === "director" ? memoSignatories.director : memoSignatories.deputy;
  const latest = p.memos[0];

  function pickAgreed(userId: string) {
    const u = people.find((x) => x.id === userId);
    setMemo({
      ...memo,
      agreedUserId: userId,
      agreedFullName: u?.fullName || "",
      agreedPosition: u?.position || memo.agreedPosition,
    });
  }

  function startEditMemo(m: ProcMemo) {
    setEditingMemoId(m.id);
    setMemo({
      addressee: m.addressee,
      fromUserId: people.find((x) => x.fullName === m.fromUser.fullName)?.id || memo.fromUserId,
      agreedUserId: "",
      agreedPosition: m.agreedPosition,
      agreedFullName: m.agreedFullName,
      compiledById: people.find((x) => x.fullName === m.compiledBy.fullName)?.id || memo.compiledById,
      letterheadKind: m.letterheadKind === "management" ? "management" : "department",
      body: m.body,
    });
    setShowForm(true);
    onOpenForm?.(true);
  }

  async function createMemo(e: FormEvent) {
    e.preventDefault();
    try {
      if (editingMemoId) {
        await api(`/api/procurements/${p.id}/memos/${editingMemoId}`, { method: "PATCH", body: JSON.stringify(memo) });
        toast("СЗ исправлена", "ok");
      } else {
        await api(`/api/procurements/${p.id}/memos`, { method: "POST", body: JSON.stringify(memo) });
        toast("СЗ сформирована", "ok");
      }
      setShowForm(false);
      setEditingMemoId(null);
      onOpenForm?.(false);
      await onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить СЗ");
    }
  }

  const statusBadge = isApproval ? (
    <span className="st st--gold">на согласовании</span>
  ) : p.memos.length > 0 ? (
    <span className="st st--work">оформлена</span>
  ) : undefined;

  return (
    <ProcSection
      id="memo"
      title="Служебная записка"
      hint={norm === "memo" ? "Подготовьте и согласуйте СЗ" : undefined}
      vis={vis}
      forceOpen={forceOpen}
      action={
        <>
          {statusBadge}
          {!readOnly && vis !== "stub" && (
            <button
              className="btn ghost btn-sm"
              type="button"
              onClick={() => {
                const next = !showForm;
                setShowForm(next);
                if (!next) setEditingMemoId(null);
                onOpenForm?.(next);
              }}
            >
              {showForm ? "Скрыть форму" : p.memos.length ? "Исправить" : "+ Новая СЗ"}
            </button>
          )}
        </>
      }
      summary={
        latest ? (
          <span className="muted">
            от {day(latest.createdAt)} · {latest.agreedFullName || "без согласующего"}
          </span>
        ) : (
          <span className="muted">не сформирована</span>
        )
      }
    >
      {showForm && !readOnly && (
        <form id="proc-focus-memo-form" onSubmit={createMemo} className="proc-form-grid">
          <div className="field">
            <label>Кому</label>
            <select value={memo.addressee} onChange={(e) => setMemo({ ...memo, addressee: e.target.value })}>
              <option value="director">
                Подписант 1 — директор
                {memoSignatories.director?.shortName ? ` (${memoSignatories.director.shortName})` : ""}
              </option>
              <option value="deputy_director">
                Подписант 2 — замещающая подпись
                {memoSignatories.deputy?.shortName ? ` (${memoSignatories.deputy.shortName})` : ""}
              </option>
            </select>
            <p className="memo-addressee-preview">
              {selectedSignatory?.dative && selectedSignatory.positionDative ? (
                <span className="memo-addressee-preview-block">
                  <span>Кому:</span>
                  <strong>{selectedSignatory.positionDative}</strong>
                  <strong>{selectedSignatory.dative}</strong>
                </span>
              ) : (
                <span className="muted">Настройте подписанта в Настройки → Общие → Служебные записки</span>
              )}
            </p>
          </div>
          <div className="field">
            <label>Шапка</label>
            <select value={memo.letterheadKind} onChange={(e) => setMemo({ ...memo, letterheadKind: e.target.value })}>
              <option value="department">Отдела</option>
              <option value="management">Управления</option>
            </select>
          </div>
          <div className="field">
            <label>От кого</label>
            <select value={memo.fromUserId} onChange={(e) => setMemo({ ...memo, fromUserId: e.target.value })}>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Согласовано (сотрудник)</label>
            <select value={memo.agreedUserId} onChange={(e) => pickAgreed(e.target.value)}>
              <option value="">— выбрать —</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Должность</label>
            <input value={memo.agreedPosition} onChange={(e) => setMemo({ ...memo, agreedPosition: e.target.value })} required />
          </div>
          <div className="field">
            <label>ФИО согласовавшего</label>
            <input value={memo.agreedFullName} onChange={(e) => setMemo({ ...memo, agreedFullName: e.target.value })} required />
          </div>
          <div className="field">
            <label>Составил</label>
            <select value={memo.compiledById} onChange={(e) => setMemo({ ...memo, compiledById: e.target.value })}>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field proc-span-2">
            <label>Текст</label>
            <textarea value={memo.body} onChange={(e) => setMemo({ ...memo, body: e.target.value })} required rows={5} />
          </div>
          <div className="proc-form-actions proc-span-2">
            <button className="btn" type="submit">
              {editingMemoId ? "Сохранить правки" : "Сформировать"}
            </button>
            {editingMemoId && (
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setEditingMemoId(null);
                  setShowForm(false);
                  onOpenForm?.(false);
                }}
              >
                Отмена
              </button>
            )}
          </div>
        </form>
      )}

      {!showForm && latest && (
        <div className="docview">
          <div className="dv-head">
            Служебная записка · от {day(latest.createdAt)}
          </div>
          <div className="memo-addressee-doc" style={{ marginBottom: 12 }}>
            <b>Кому:</b>
            {memoAddresseeLines(latest).map((line) => (
              <span key={line}> {line}</span>
            ))}
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{latest.body}</p>
          <div className="dv-sig">
            <span>
              Исполнитель: {latest.fromUser.fullName}
              {latest.fromUser.position ? ` (${latest.fromUser.position})` : ""}
            </span>
            <span>
              Согласовано: {latest.agreedPosition}, {latest.agreedFullName}
            </span>
          </div>
          {isApproval && (
            <p className="muted" style={{ marginTop: 12 }}>
              {norm === "director_approval" || (!p.supervisorApprovedAt && norm === "approval")
                ? "Ожидает отметки о согласовании — кнопка «Согласовать» в блоке этапов"
                : p.directorApprovedAt
                  ? "Согласовано директором"
                  : "Ожидает подписи директора — кнопка «Согласовать» в блоке этапов"}
            </p>
          )}
          <p className="muted no-print proc-memo-actions">
            <a className="btn ghost btn-sm" href={`/api/procurements/${p.id}/memos/${latest.id}/docx`}>
              Скачать DOCX
            </a>
            {!readOnly && (
              <button type="button" className="btn ghost btn-sm" onClick={() => startEditMemo(latest)}>
                Исправить
              </button>
            )}
          </p>
        </div>
      )}

      {!showForm && !latest && <p className="muted proc-empty">СЗ не сформирована</p>}
    </ProcSection>
  );
}
