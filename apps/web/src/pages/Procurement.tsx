import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, canWriteContracts } from "../api";
import { parseMemoSignatory, type MemoSignatory, MEMO_SIGNATORY_SETTING_KEYS } from "../lib/memo-signatories";
import {
  sectionVisibility,
  type ProcCardSectionId,
  type WorkflowCheck,
} from "../lib/proc-workflow";
import { HistoryModal } from "../components/HistoryModal";
import { ProcCardHeader } from "../components/procurement/ProcCardHeader";
import { ProcContract } from "../components/procurement/ProcContract";
import { ProcExecution } from "../components/procurement/ProcExecution";
import { ProcFilePreviewModal } from "../components/procurement/ProcFilePreviewModal";
import { ProcMemoSection } from "../components/procurement/ProcMemoSection";
import { ProcOverview } from "../components/procurement/ProcOverview";
import { ProcProgress } from "../components/procurement/ProcProgress";
import { ProcPurchase } from "../components/procurement/ProcPurchase";
import { ProcQuotes } from "../components/procurement/ProcQuotes";
import { ProcRequire } from "../components/procurement/ProcRequire";
import type { Brief, Proc, ProcDates } from "../components/procurement/procTypes";
import type { Me } from "../App";

function emptyDates(): ProcDates {
  return {
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
    estimatedAmount: "",
    title: "",
  };
}

const SECTION_ORDER: ProcCardSectionId[] = ["overview", "quotes", "memo", "purchase", "contract", "execution"];

export default function Procurement() {
  const { id } = useParams();
  const nav = useNavigate();
  const [p, setP] = useState<Proc | null>(null);
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [memoSignatories, setMemoSignatories] = useState<{ director: MemoSignatory | null; deputy: MemoSignatory | null }>({
    director: null,
    deputy: null,
  });
  const [people, setPeople] = useState<Brief[]>([]);
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [payAddressees, setPayAddressees] = useState<string[]>([]);
  const [dates, setDates] = useState<ProcDates>(emptyDates);
  const [showAll, setShowAll] = useState(false);
  const [forceSection, setForceSection] = useState<ProcCardSectionId | null>(null);
  const [openQuoteForm, setOpenQuoteForm] = useState(false);
  const [openMemoForm, setOpenMemoForm] = useState(false);

  async function load() {
    const row = await api<Proc>(`/api/procurements/${id}`);
    setP(row);
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
      estimatedAmount: row.estimatedAmount || "",
      title: row.title || "",
    });
    if (row.parseWarnings?.length) setParseWarnings(row.parseWarnings);
  }

  useEffect(() => {
    load();
    api<Me>("/api/auth/me").then((s) => setMe(s.user));
    api<Brief[]>("/api/users/brief").then(setPeople);
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
      <div className="page proc-page proc-page--lean">
        <p className="muted">Загрузка карточки…</p>
      </div>
    );
  }

  const canWrite = me ? canWriteContracts(me, p.department.id) : false;
  const readOnly = Boolean(me && !canWrite);
  const docsReady = p.documents.filter((d) => d.present || d.storedName).length;
  const docsTotal = p.documents.length;

  const checks: WorkflowCheck[] = p.workflow?.checks || [];
  const extraRequire: { text: string; danger: boolean; section?: ProcCardSectionId }[] = [];
  if (p.acceptanceDueAt && new Date(p.acceptanceDueAt) < new Date() && p.status === "acceptance_window") {
    extraRequire.push({
      text: "истёк срок приёмки документов — зафиксируйте результат",
      danger: true,
      section: "execution",
    });
  }

  function vis(section: ProcCardSectionId) {
    return sectionVisibility(p!.status, section, showAll);
  }

  function focusSection(section: ProcCardSectionId, focus?: string) {
    setForceSection(section);
    if (vis(section) === "stub") setShowAll(true);
    if (focus === "quote-form") setOpenQuoteForm(true);
    if (focus === "memo-form") setOpenMemoForm(true);
    requestAnimationFrame(() => {
      const el =
        (focus && document.getElementById(`proc-focus-${focus}`)) ||
        document.getElementById(`proc-sec-${section}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (focus === "approve") {
        document.getElementById("proc-focus-approve")?.focus();
      }
    });
  }

  async function remove() {
    if (!p) return;
    if (!confirm(`Удалить закупку «${p.title}»? Это действие необратимо.`)) return;
    await api(`/api/procurements/${id}`, { method: "DELETE" });
    nav("/procurements");
  }

  const visible = SECTION_ORDER.filter((id) => {
    const v = vis(id);
    return v !== "stub" || forceSection === id;
  });

  return (
    <div className="page proc-page proc-page--lean">
      <ProcCardHeader
        p={p}
        me={me}
        readOnly={readOnly}
        docsReady={docsReady}
        docsTotal={docsTotal}
        onHistory={() => setHistoryOpen(true)}
        onDelete={remove}
      />

      {historyOpen && id && <HistoryModal procurementId={id} onClose={() => setHistoryOpen(false)} />}
      {preview && (
        <ProcFilePreviewModal url={preview.url} fileName={preview.name} onClose={() => setPreview(null)} />
      )}

      <ProcProgress proc={p} me={me} readOnly={readOnly} onRefresh={load} />

      <ProcRequire checks={checks} extra={extraRequire} onFocus={focusSection} />

      <div className="proc-doc">
        <div className="proc-main">
          {visible.includes("overview") && (
            <ProcOverview
              p={p}
              vis={forceSection === "overview" ? "active" : vis("overview")}
              forceOpen={forceSection === "overview"}
              readOnly={readOnly}
              dates={dates}
              setDates={setDates}
              invalid={invalid}
              setInvalid={setInvalid}
              onPreview={(url, name) => setPreview({ url, name })}
              onRefresh={load}
            />
          )}

          {visible.includes("quotes") && (
            <ProcQuotes
              p={p}
              vis={forceSection === "quotes" ? "active" : vis("quotes")}
              forceOpen={forceSection === "quotes"}
              readOnly={readOnly}
              openForm={openQuoteForm}
              onOpenForm={setOpenQuoteForm}
              onPreview={(url, name) => setPreview({ url, name })}
              onRefresh={load}
            />
          )}

          {visible.includes("memo") && (
            <ProcMemoSection
              p={p}
              vis={forceSection === "memo" ? "active" : vis("memo")}
              forceOpen={forceSection === "memo"}
              readOnly={readOnly}
              people={people}
              memoSignatories={memoSignatories}
              openForm={openMemoForm}
              onOpenForm={setOpenMemoForm}
              onRefresh={load}
            />
          )}

          {visible.includes("purchase") && (
            <ProcPurchase
              p={p}
              vis={forceSection === "purchase" ? "active" : vis("purchase")}
              forceOpen={forceSection === "purchase"}
              readOnly={readOnly}
              dates={dates}
              setDates={setDates}
              onRefresh={load}
            />
          )}

          {visible.includes("contract") && (
            <ProcContract
              p={p}
              vis={forceSection === "contract" ? "active" : vis("contract")}
              forceOpen={forceSection === "contract"}
              readOnly={readOnly}
              people={people}
              dates={dates}
              setDates={setDates}
              invalid={invalid}
              setInvalid={setInvalid}
              parseWarnings={parseWarnings}
              setParseWarnings={setParseWarnings}
              onPreview={(url, name) => setPreview({ url, name })}
              onRefresh={load}
            />
          )}

          {visible.includes("execution") && (
            <ProcExecution
              p={p}
              vis={forceSection === "execution" ? "active" : vis("execution")}
              forceOpen={forceSection === "execution"}
              readOnly={readOnly}
              dates={dates}
              setDates={setDates}
              payAddressees={payAddressees}
              onRefresh={load}
            />
          )}

          <p className="proc-show-all">
            <button
              type="button"
              className="btn ghost btn-sm"
              onClick={() => {
                setShowAll((v) => !v);
                setForceSection(null);
              }}
            >
              {showAll ? "Только текущий этап" : "Все разделы"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
