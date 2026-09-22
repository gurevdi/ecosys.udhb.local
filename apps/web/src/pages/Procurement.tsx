import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, canDeleteContracts, canWriteContracts, CATEGORY, CATEGORY_IDS, day, METHOD, money, procIdentity, STATUS } from "../api";
import { memoAddresseeLines, parseMemoSignatory, type MemoSignatory, MEMO_SIGNATORY_SETTING_KEYS } from "../lib/memo-signatories";
import { DeleteButton } from "../components/DeleteButton";
import { HistoryButton } from "../components/HistoryButton";
import { HistoryModal } from "../components/HistoryModal";
import { ProcWorkflowPanel } from "../components/procurement/ProcWorkflowPanel";
import { ProcFilePreviewModal } from "../components/procurement/ProcFilePreviewModal";
import { ProcPaymentsPanel } from "../components/procurement/ProcPaymentsPanel";
import { SupplierCombo } from "../components/SupplierCombo";
import { procFileCanPreview } from "../lib/procFiles";
import { ESHOP_PHASES, phaseState, type ProcWorkflowMeta } from "../lib/proc-workflow";
import { toast } from "../lib/toast";
import type { Me } from "../App";

type Brief = { id: string; fullName: string; position: string | null };
type Proc = {
  id: string;
  serialNo: number;
  createdAt: string;
  title: string;
  law: string;
  method: string;
  category: string;
  status: string;
  description: string | null;
  estimatedAmount: string | null;
  contractNumber: string | null;
  contractDate: string | null;
  contractAmount: string | null;
  deliveryUntil: string | null;
  acceptanceStartAt: string | null;
  acceptanceDueAt: string | null;
  contractDeptNote: string | null;
  publishedAt: string | null;
  biddingStartAt: string | null;
  biddingEndAt: string | null;
  supervisorApprovedAt: string | null;
  directorApprovedAt: string | null;
  supervisorApprovedBy: { id: string; fullName: string; position: string | null } | null;
  directorApprovedBy: { id: string; fullName: string; position: string | null } | null;
  selectedQuoteId: string | null;
  contractFileName: string | null;
  contractStoredName: string | null;
  executorName: string | null;
  executorUserId: string | null;
  performanceDays: number | null;
  acceptanceDays: number | null;
  actualDeliveryAt: string | null;
  validUntil: string | null;
  contractKind: "renewable" | "onetime" | null;
  contractComment: string | null;
  fromArchive: boolean;
  parseWarnings?: string[];
  workflow?: ProcWorkflowMeta;
  department: { id: string; name: string };
  initiator: { fullName: string };
  documents: { id: string; code: string; title: string; present: boolean; note: string | null; fileName: string | null; storedName: string | null }[];
  quotes: { id: string; supplierName: string; amount: string | null; fileName: string; createdAt: string }[];
  payments?: {
    id: string;
    amount: string | null;
    paidAt: string | null;
    addressee: string;
    memoText: string | null;
    note: string | null;
    files: { id: string; fileName: string }[];
    createdBy: { fullName: string } | null;
  }[];
  memos: {
    id: string;
    addressee: string;
    addresseePosition?: string | null;
    addresseePositionDative?: string | null;
    addresseeFullName?: string | null;
    addresseeShortName?: string | null;
    addresseeDative?: string | null;
    letterheadKind?: string;
    body: string;
    agreedPosition: string;
    agreedFullName: string;
    fromUser: { fullName: string; position: string | null };
    compiledBy: { fullName: string; position: string | null };
    createdAt: string;
  }[];
};

const AUCTION_FLOW = [
  "draft",
  "collecting_quotes",
  "memo",
  "approval",
  "transferred",
  "returned",
  "published",
  "bidding",
  "contracted",
  "execution",
  "acceptance_window",
  "completed",
  "rejected",
];

const PHASE_NUMERALS = ["I", "II", "III", "IV", "V"];

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="sec">
      <div className="sec-head">
        <div>
          <h2 className="sec-title">{title}</h2>
          {hint && <p className="muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Procurement() {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState<Proc | null>(null);
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [showMemoForm, setShowMemoForm] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [memoSignatories, setMemoSignatories] = useState<{ director: MemoSignatory | null; deputy: MemoSignatory | null }>({
    director: null,
    deputy: null,
  });
  const [people, setPeople] = useState<Brief[]>([]);
  const [status, setStatus] = useState("");
  const [comment, setComment] = useState("");
  const [quote, setQuote] = useState({
    supplierName: "",
    supplierId: "",
    inn: "",
    phone: "",
    comment: "",
    amount: "",
    file: null as File | null,
  });
  const [memo, setMemo] = useState({
    addressee: "director",
    fromUserId: "",
    agreedUserId: "",
    agreedPosition: "",
    agreedFullName: "",
    compiledById: "",
    letterheadKind: "department",
    body: "",
  });
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [payAddressees, setPayAddressees] = useState<string[]>([]);
  const [dates, setDates] = useState({
    contractNumber: "",
    contractDate: "",
    contractAmount: "",
    deliveryUntil: "",
    acceptanceStartAt: "",
    acceptanceDueAt: "",
    contractDeptNote: "",
    publishedAt: "",
    biddingStartAt: "",
    biddingEndAt: "",
    validUntil: "",
    actualDeliveryAt: "",
    executorName: "",
    executorUserId: "",
    performanceDays: "",
    acceptanceDays: "10",
    contractKind: "",
    contractComment: "",
  });

  async function load() {
    const row = await api<Proc>(`/api/procurements/${id}`);
    setP(row);
    setStatus(row.status);
    setDates({
      contractNumber: row.contractNumber || "",
      contractDate: row.contractDate ? row.contractDate.slice(0, 10) : "",
      contractAmount: row.contractAmount || "",
      deliveryUntil: row.deliveryUntil ? row.deliveryUntil.slice(0, 10) : "",
      acceptanceStartAt: row.acceptanceStartAt ? row.acceptanceStartAt.slice(0, 10) : "",
      acceptanceDueAt: row.acceptanceDueAt ? row.acceptanceDueAt.slice(0, 10) : "",
      contractDeptNote: row.contractDeptNote || "",
      publishedAt: row.publishedAt ? row.publishedAt.slice(0, 10) : "",
      biddingStartAt: row.biddingStartAt ? row.biddingStartAt.slice(0, 10) : "",
      biddingEndAt: row.biddingEndAt ? row.biddingEndAt.slice(0, 10) : "",
      validUntil: row.validUntil ? row.validUntil.slice(0, 10) : "",
      actualDeliveryAt: row.actualDeliveryAt ? row.actualDeliveryAt.slice(0, 10) : "",
      executorName: row.executorName || "",
      executorUserId: row.executorUserId || "",
      performanceDays: row.performanceDays != null ? String(row.performanceDays) : "",
      acceptanceDays: row.acceptanceDays != null ? String(row.acceptanceDays) : "10",
      contractKind: row.contractKind || "",
      contractComment: row.contractComment || "",
    });
    setShowMemoForm(row.memos.length === 0);
    setShowQuoteForm(row.quotes.length === 0);
  }

  useEffect(() => {
    load();
    api<Me>("/api/auth/me").then((s) => setMe(s.user));
    api<Brief[]>("/api/users/brief").then((list) => {
      setPeople(list);
      setMemo((m) => ({
        ...m,
        fromUserId: m.fromUserId || list[0]?.id || "",
        compiledById: m.compiledById || list[0]?.id || "",
      }));
    });
    api<Record<string, string>>("/api/settings")
      .then((s) => {
        setMemoSignatories({
          director: parseMemoSignatory(s[MEMO_SIGNATORY_SETTING_KEYS.director]),
          deputy: parseMemoSignatory(s[MEMO_SIGNATORY_SETTING_KEYS.deputy]),
        });
        try {
          const names = JSON.parse(s.payment_addressees || "[]");
          if (Array.isArray(names)) setPayAddressees(names.map(String).filter(Boolean));
        } catch {
          setPayAddressees([]);
        }
      })
      .catch(() => null);
  }, [id]);

  if (!p) {
    return (
      <div className="page proc-page">
        <p className="muted">Загрузка карточки…</p>
      </div>
    );
  }

  const canWrite = me ? canWriteContracts(me, p.department.id) : false;
  const readOnly = Boolean(me && !canWrite);
  const isEshop = p.method === "electronic_shop";
  const flowOptions = isEshop && p.workflow?.flow ? [...p.workflow.flow, "rejected"] : AUCTION_FLOW;
  const docsReady = p.documents.filter((d) => d.present).length;
  const docsTotal = p.documents.length;

  async function saveCategory(category: string) {
    await api(`/api/procurements/${id}`, { method: "PATCH", body: JSON.stringify({ category }) });
    await load();
  }

  async function saveStatus(e: FormEvent) {
    e.preventDefault();
    await api(`/api/procurements/${id}/status`, { method: "POST", body: JSON.stringify({ status, comment }) });
    setComment("");
    await load();
  }

  async function saveDates(e: FormEvent) {
    e.preventDefault();
    const miss: Record<string, boolean> = {};
    if (!dates.contractDate) miss.contractDate = true;
    if (!dates.validUntil && !dates.deliveryUntil) miss.validUntil = true;
    setInvalid(miss);
    if (Object.keys(miss).length) {
      toast("Заполните подсвеченные поля");
      return;
    }
    try {
      await api(`/api/procurements/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          contractNumber: dates.contractNumber || null,
          contractAmount: dates.contractAmount ? Number(dates.contractAmount) : null,
          contractDate: dates.contractDate || null,
          deliveryUntil: dates.deliveryUntil || null,
          acceptanceStartAt: dates.acceptanceStartAt || null,
          acceptanceDueAt: dates.acceptanceDueAt || null,
          validUntil: dates.validUntil || null,
          actualDeliveryAt: dates.actualDeliveryAt || null,
          executorName: dates.executorName || null,
          executorUserId: dates.executorUserId || null,
          performanceDays: dates.performanceDays ? Number(dates.performanceDays) : null,
          acceptanceDays: dates.acceptanceDays ? Number(dates.acceptanceDays) : 10,
          contractKind: (dates.contractKind || null) as "renewable" | "onetime" | null,
          contractComment: dates.contractComment || null,
        }),
      });
      setInvalid({});
      toast("Сохранено", "ok");
      await load();
    } catch (err) {
      const fields = (err as { fields?: string[] }).fields || [];
      const next: Record<string, boolean> = {};
      for (const f of fields) next[f] = true;
      setInvalid(next);
      toast(err instanceof Error ? err.message : "Не удалось сохранить");
    }
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
      await api(`/api/procurements/${id}/quotes`, { method: "POST", body: fd });
      setQuote({ supplierName: "", supplierId: "", inn: "", phone: "", comment: "", amount: "", file: null });
      setShowQuoteForm(false);
      setInvalid({});
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось загрузить КП");
    }
  }

  async function createMemo(e: FormEvent) {
    e.preventDefault();
    try {
      if (editingMemoId) {
        await api(`/api/procurements/${id}/memos/${editingMemoId}`, { method: "PATCH", body: JSON.stringify(memo) });
        toast("СЗ исправлена", "ok");
      } else {
        await api(`/api/procurements/${id}/memos`, { method: "POST", body: JSON.stringify(memo) });
      }
      setShowMemoForm(false);
      setEditingMemoId(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить СЗ");
    }
  }

  async function toggleDoc(doc: Proc["documents"][0]) {
    await api(`/api/procurements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ documents: [{ id: doc.id, present: !doc.present }] }),
    });
    await load();
  }

  async function uploadContract(file?: File) {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api<{ parsed?: { warnings?: string[] } }>(`/api/procurements/${id}/contract-file`, {
        method: "POST",
        body: fd,
      });
      setParseWarnings(res.parsed?.warnings || []);
      toast("Файл загружен, проверьте реквизиты", "ok");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось загрузить договор");
    }
  }

  async function uploadDocFile(doc: Proc["documents"][0], file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/api/procurements/${id}/documents/${doc.id}/file`, { method: "POST", body: fd });
      toast(`Файл «${doc.title}» прикреплён`, "ok");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось загрузить файл");
    }
  }

  async function removeDocFile(doc: Proc["documents"][0]) {
    if (!confirm(`Удалить файл «${doc.fileName}»?`)) return;
    try {
      await api(`/api/procurements/${id}/documents/${doc.id}/file`, { method: "DELETE" });
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось удалить файл");
    }
  }

  async function remove() {
    if (!p) return;
    if (!confirm(`Удалить закупку «${p.title}»? Это действие необратимо.`)) return;
    await api(`/api/procurements/${id}`, { method: "DELETE" });
    nav("/procurements");
  }

  function pickAgreed(userId: string) {
    const u = people.find((x) => x.id === userId);
    setMemo({
      ...memo,
      agreedUserId: userId,
      agreedFullName: u?.fullName || "",
      agreedPosition: u?.position || memo.agreedPosition,
    });
  }

  function pickExecutor(userId: string) {
    const u = people.find((x) => x.id === userId);
    setDates((d) => ({
      ...d,
      executorUserId: userId,
      executorName: userId ? u?.fullName || d.executorName : d.executorName,
    }));
    setInvalid((inv) => ({ ...inv, executorName: false }));
  }

  function startEditMemo(m: Proc["memos"][0]) {
    setEditingMemoId(m.id);
    setMemo({
      addressee: m.addressee,
      fromUserId: people.find((p) => p.fullName === m.fromUser.fullName)?.id || memo.fromUserId,
      agreedUserId: "",
      agreedPosition: m.agreedPosition,
      agreedFullName: m.agreedFullName,
      compiledById: people.find((p) => p.fullName === m.compiledBy.fullName)?.id || memo.compiledById,
      letterheadKind: m.letterheadKind === "management" ? "management" : "department",
      body: m.body,
    });
    setShowMemoForm(true);
  }

  const selectedSignatory =
    memo.addressee === "director" ? memoSignatories.director : memoSignatories.deputy;

  const normStatus = p.status === "approval" ? "supervisor_approval" : p.status;
  const requireItems: { text: string; danger: boolean }[] = [];
  for (const b of p.workflow?.blockers || []) requireItems.push({ text: b, danger: true });
  for (const w of p.workflow?.warnings || []) requireItems.push({ text: w, danger: false });
  if (p.acceptanceDueAt && new Date(p.acceptanceDueAt) < new Date() && p.status === "acceptance_window") {
    requireItems.push({ text: "истёк срок приёмки документов — зафиксируйте результат", danger: true });
  }

  return (
    <div className="page proc-page">
      <p className="page-cap">
        {p.department.name} · {(CATEGORY[p.category] || p.category).toLowerCase()} · создана <b>{day(p.createdAt)}</b>
        {p.executorName ? ` · исполнитель ${p.executorName}` : ""}
      </p>
      <div className="crumbs proc-crumbs">
        <span>
          <Link to="/procurements">← Реестр договоров</Link> · {procIdentity(p.serialNo, p.createdAt)} ·{" "}
          <span className="st st--work">{STATUS[p.status] || p.status}</span>
          {readOnly && <span className="st st--muted"> · только просмотр</span>}
        </span>
        <span className="crumbs-actions">
          <a className="btn ghost btn-sm" href={`/api/procurements/${id}/archive`}>
            Скачать все файлы
          </a>
          <HistoryButton onClick={() => setHistoryOpen(true)} />
          {me && canDeleteContracts(me, p.department.id) && <DeleteButton onClick={remove} title="Удалить закупку" />}
        </span>
      </div>

      {historyOpen && id && <HistoryModal procurementId={id} onClose={() => setHistoryOpen(false)} />}
      {preview && (
        <ProcFilePreviewModal url={preview.url} fileName={preview.name} onClose={() => setPreview(null)} />
      )}

      <div className="wf">
        {ESHOP_PHASES.map((phase, i) => {
          const st = phaseState(p.status, i);
          return (
            <div key={phase.id} className={`wf-step${st === "done" ? " done" : st === "active" ? " now" : ""}`}>
              <div className="t">
                {PHASE_NUMERALS[i]}. {phase.label}
              </div>
              <div className="s">{st === "active" ? STATUS[normStatus] || normStatus : st === "done" ? "завершён" : "—"}</div>
            </div>
          );
        })}
      </div>

      <div className="stats" style={{ marginTop: 22 }}>
        <div className="stat">
          <div className="stat-v">{money(p.contractAmount || p.estimatedAmount)}</div>
          <div className="stat-l">сумма договора</div>
        </div>
        <div className="stat">
          <div className="stat-v">{p.quotes.length}</div>
          <div className="stat-l">КП получено</div>
        </div>
        <div className="stat">
          <div className="stat-v">
            {docsReady} <small>/ {docsTotal}</small>
          </div>
          <div className="stat-l">комплект документов</div>
        </div>
        <div className={`stat${requireItems.some((r) => r.danger) ? " stat--danger" : " stat--gold"}`}>
          <div className="stat-v">
            {p.performanceDays ?? "—"} <small>дн.</small>
          </div>
          <div className="stat-l">срок исполнения</div>
        </div>
      </div>

      {requireItems.length > 0 && (
        <div className="require">
          <span className="stamp">К исполнению</span>
          <p className="require-t">Текущее действие</p>
          <ul>
            {requireItems.map((r, i) => (
              <li key={i}>
                <span className={r.danger ? "cnt" : "cnt cnt--calm"}>{i + 1}</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isEshop && (
        <ProcWorkflowPanel
          proc={p}
          me={me}
          readOnly={readOnly}
          stageFields={{
            publishedAt: dates.publishedAt,
            biddingStartAt: dates.biddingStartAt,
            biddingEndAt: dates.biddingEndAt,
            contractDeptNote: dates.contractDeptNote,
          }}
          onStagePatch={(patch) => setDates((d) => ({ ...d, ...patch }))}
          onRefresh={load}
        />
      )}

      <div className="proc-doc">
        <div className="proc-main">
          <section className="sec">
            <div className="sec-head">
              <h2 className="sec-title">Общие сведения</h2>
            </div>
            <div className="kv">
              <div className="k">Закупка</div>
              <div className="v">{p.title}</div>
              <div className="k">Тип договора</div>
              <div className="v">
                <select
                  className="kv-select"
                  value={p.category}
                  onChange={(e) => saveCategory(e.target.value)}
                  disabled={readOnly}
                >
                  {CATEGORY_IDS.map((cid) => (
                    <option key={cid} value={cid}>
                      {CATEGORY[cid]}
                    </option>
                  ))}
                </select>
                <span className="muted"> · {METHOD[p.method]}</span>
              </div>
              <div className="k">Подразделение</div>
              <div className="v">{p.department.name}</div>
              <div className="k">Инициатор</div>
              <div className="v">{p.initiator.fullName}</div>
              <div className="k">Начальная цена</div>
              <div className="v">{money(p.estimatedAmount)}</div>
              <div className="k">Комплект документов</div>
              <div>
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
                                    ? setPreview({ url: `/api/proc-documents/${d.id}/file`, name: d.fileName || d.title })
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
            {!isEshop && !readOnly && (
              <form onSubmit={saveStatus} className="proc-compact-form proc-status-form">
                <div className="field">
                  <label>Этап</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {flowOptions.map((s) => (
                      <option key={s} value={s}>
                        {STATUS[s] || s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Комментарий</label>
                  <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Необязательно" />
                </div>
                <button className="btn" type="submit">
                  Обновить статус
                </button>
              </form>
            )}
          </section>

          <Section
            title="Коммерческие предложения"
            hint={isEshop ? "Загрузите КП от поставщиков" : undefined}
            action={
              !readOnly ? (
              <button className="btn ghost btn-sm" type="button" onClick={() => setShowQuoteForm((v) => !v)}>
                {showQuoteForm ? "Скрыть" : "+ Добавить КП"}
              </button>
              ) : undefined
            }
          >
            {showQuoteForm && !readOnly && (
              <form onSubmit={uploadQuote} className="proc-inline-form proc-quote-form">
                <SupplierCombo
                  value={quote.supplierName}
                  supplierId={quote.supplierId}
                  extra={{ inn: quote.inn, phone: quote.phone, comment: quote.comment }}
                  required
                  invalid={Boolean(invalid.supplierName)}
                  onChange={(next) => {
                    setQuote({ ...quote, supplierName: next.name, supplierId: next.supplierId, inn: next.inn, phone: next.phone, comment: next.comment });
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
                              ? setPreview({ url: `/api/quotes/${q.id}/file`, name: q.fileName })
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
          </Section>

          <Section
            title="Служебная записка"
            hint={isEshop ? "Подготовьте и согласуйте СЗ" : undefined}
            action={
              !readOnly ? (
              <button className="btn ghost btn-sm" type="button" onClick={() => setShowMemoForm((v) => !v)}>
                {showMemoForm ? "Скрыть форму" : "+ Новая СЗ"}
              </button>
              ) : undefined
            }
          >
            {showMemoForm && !readOnly && (
              <form onSubmit={createMemo} className="proc-form-grid">
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
                        setShowMemoForm(false);
                      }}
                    >
                      Отмена
                    </button>
                  )}
                </div>
              </form>
            )}
            {p.memos.length === 0 && !showMemoForm && <p className="muted proc-empty">СЗ не сформирована</p>}
          </Section>

          <Section title="Заключение контракта" hint="Исполнитель, реквизиты, файл договора и сроки">
            <form onSubmit={saveDates} className="proc-form-grid">
              <div className="field proc-span-2">
                <label>Документ договора</label>
                {p.contractStoredName ? (
                  <div className="proc-file-row">
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() =>
                        procFileCanPreview(p.contractFileName || "contract")
                          ? setPreview({ url: `/api/procurements/${p.id}/contract-file`, name: p.contractFileName || "Договор" })
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
                    <input
                      type="file"
                      accept=".doc,.docx,.pdf"
                      onChange={(e) => uploadContract(e.target.files?.[0])}
                    />
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
              <div className="field">
                <label>№ контракта</label>
                <input value={dates.contractNumber} onChange={(e) => setDates({ ...dates, contractNumber: e.target.value })} disabled={readOnly} />
              </div>
              <div className={invalid.contractDate ? "field field-invalid" : "field"}>
                <label>Дата заключения</label>
                <input
                  type="date"
                  value={dates.contractDate}
                  onChange={(e) => {
                    setDates({ ...dates, contractDate: e.target.value });
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
                    setDates({ ...dates, validUntil: e.target.value });
                    setInvalid((inv) => ({ ...inv, validUntil: false }));
                  }}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label>Сумма по итогам торгов, ₽</label>
                <input type="number" step="0.01" value={dates.contractAmount} onChange={(e) => setDates({ ...dates, contractAmount: e.target.value })} disabled={readOnly} />
              </div>
              <div className={invalid.deliveryUntil ? "field field-invalid" : "field"}>
                <label>Исполнить до</label>
                <input
                  type="date"
                  value={dates.deliveryUntil}
                  onChange={(e) => {
                    setDates({ ...dates, deliveryUntil: e.target.value });
                    setInvalid((inv) => ({ ...inv, deliveryUntil: false }));
                  }}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label>Срок исполнения, дней</label>
                <input type="number" value={dates.performanceDays} onChange={(e) => setDates({ ...dates, performanceDays: e.target.value })} disabled={readOnly} />
              </div>
              <div className="field">
                <label>Срок приёмки, дней</label>
                <input type="number" value={dates.acceptanceDays} onChange={(e) => setDates({ ...dates, acceptanceDays: e.target.value })} disabled={readOnly} />
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
                    setDates({ ...dates, executorName: e.target.value, executorUserId: dates.executorUserId && people.find((x) => x.id === dates.executorUserId)?.fullName === e.target.value ? dates.executorUserId : "" });
                    setInvalid((inv) => ({ ...inv, executorName: false }));
                  }}
                  disabled={readOnly}
                  placeholder="если не из списка — введите вручную"
                />
              </div>
              <div className="field">
                <label>Тип договора</label>
                <select value={dates.contractKind} onChange={(e) => setDates({ ...dates, contractKind: e.target.value })} disabled={readOnly}>
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
                  onChange={(e) => setDates({ ...dates, contractComment: e.target.value })}
                  disabled={readOnly}
                  placeholder="примечания по договору"
                />
              </div>
              {!readOnly && (
                <div className="proc-form-actions proc-span-2">
                  <button className="btn" type="submit">
                    Сохранить
                  </button>
                </div>
              )}
            </form>
          </Section>

          <Section
            title="Контроль поставки"
            hint={
              p.category === "supply"
                ? "Зафиксируйте фактическую дату поставки. Пеня считается от срока поставки, а не от срока действия договора до конца года."
                : "Фактическая дата исполнения и ориентир приёмки документов."
            }
          >
            <form onSubmit={saveDates} className="proc-form-grid">
              <div className="field">
                <label>По договору исполнить до</label>
                <input type="date" value={dates.deliveryUntil} disabled />
              </div>
              <div className="field">
                <label>Фактическая дата поставки</label>
                <input
                  type="date"
                  value={dates.actualDeliveryAt}
                  onChange={(e) => setDates({ ...dates, actualDeliveryAt: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label>Срок приёмки, дней</label>
                <input
                  type="number"
                  value={dates.acceptanceDays}
                  onChange={(e) => setDates({ ...dates, acceptanceDays: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="field">
                <label>Ориентир приёмки документов</label>
                <input type="date" value={dates.acceptanceDueAt} disabled />
                <p className="muted">Считается от фактической поставки + {dates.acceptanceDays || 10} дн., не от даты заключения.</p>
              </div>
              {!readOnly && (
                <div className="proc-form-actions proc-span-2">
                  <button className="btn" type="submit">
                    Сохранить
                  </button>
                </div>
              )}
            </form>
          </Section>

          <ProcPaymentsPanel
            procurementId={p.id}
            payments={p.payments || []}
            addressees={payAddressees}
            readOnly={readOnly}
            onRefresh={load}
          />
        </div>
      </div>

      {p.memos.map((m) => (
        <div key={m.id} className="doc">
          <div className="org">
            {m.letterheadKind === "management" ? (
              <>
                Бюджетное учреждение города Омска
                <br />
                «Управление дорожного хозяйства и благоустройства»
              </>
            ) : (
              <>
                {p.department.name}
                <br />
                Бюджетное учреждение города Омска «УДХБ»
              </>
            )}
          </div>
          <h3>СЛУЖЕБНАЯ ЗАПИСКА</h3>
          <div className="meta">
            <div className="memo-addressee-doc">
              <b>Кому:</b>
              {memoAddresseeLines(m).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <div>
              <b>От:</b> {m.fromUser.position || "сотрудник"}, {m.fromUser.fullName}
            </div>
            <div>
              <b>Согласовано:</b> {m.agreedPosition}, {m.agreedFullName}
            </div>
          </div>
          <div className="body">{m.body}</div>
          <div className="sign">
            Составил: {m.compiledBy.position || "сотрудник"}, {m.compiledBy.fullName}
            <br />
            {day(m.createdAt)}
          </div>
          <p className="muted no-print proc-memo-actions">
            <a className="btn ghost btn-sm" href={`/api/procurements/${p.id}/memos/${m.id}/docx`}>
              Скачать DOCX
            </a>
            {!readOnly && (
              <button type="button" className="btn ghost btn-sm" onClick={() => startEditMemo(m)}>
                Исправить
              </button>
            )}
            Печать — Ctrl+P
          </p>
        </div>
      ))}
    </div>
  );
}
