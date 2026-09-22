import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../api";
import { SedDocumentModal } from "../components/SedDocumentModal";
import { SedAttachmentsCell } from "../components/sed/SedAttachmentsCell";
import { SedCorrespondentCell } from "../components/sed/SedCorrespondentCell";
import { SedReviewMetrics } from "../components/sed/SedReviewMetrics";
import type { SedDocumentFile } from "../lib/sedFiles";
import { parseReviewMetricKey, sedReviewFollowPath, type SedReviewDashboard, type SedReviewMetricKey } from "../lib/sedReviewMetrics";
import type { SedIntegration } from "../components/sed/SedIntegrationPanel";

type SedPendingDocument = {
  id: string;
  kind: string | null;
  number: string | null;
  regDate: string | null;
  outNumber: string | null;
  outDate: string | null;
  correspondent: string | null;
  title: string | null;
  url: string;
  files: SedDocumentFile[];
};

type SedPendingPeriod = {
  shownText: string | null;
  toggleLabel: string | null;
  toggleUrl: string | null;
  wholePeriod: boolean;
};

type SedPaginationLink = {
  page: number;
  label: string;
  followUrl: string;
  current: boolean;
};

type SedPendingPagination = {
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  pages: SedPaginationLink[];
  prevUrl: string | null;
  nextUrl: string | null;
};

type SedPendingList = {
  items: SedPendingDocument[];
  total: number;
  fetchedAt: string;
  period: SedPendingPeriod;
  pagination: SedPendingPagination;
  listPath: string;
  dashboard: SedReviewDashboard | null;
  pageSize: number;
  searchMode?: boolean;
  searchQuery?: string | null;
  matchedCount?: number;
};

function fmtWhen(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function stripPageParam(path?: string) {
  if (!path) return undefined;
  return path.replace(/([?&])page=\d+/gi, "$1").replace(/[?&]$/, "") || undefined;
}

export default function Sed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeReview = parseReviewMetricKey(searchParams.get("review"));
  const [integration, setIntegration] = useState<SedIntegration | null>(null);
  const [config, setConfig] = useState<{ baseUrl: string } | null>(null);
  const [docs, setDocs] = useState<SedPendingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [docsBusy, setDocsBusy] = useState(false);
  const [err, setErr] = useState("");
  const [docsErr, setDocsErr] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [docId, setDocId] = useState<string | null>(null);
  const [listPath, setListPath] = useState<string | undefined>();
  const [pageSize, setPageSize] = useState<number | undefined>();
  const searchGen = useRef(0);

  useEffect(() => {
    Promise.all([
      api<SedIntegration>("/api/sed/integration"),
      api<{ baseUrl: string }>("/api/sed/config").catch(() => ({ baseUrl: "http://sed.omskgov.ru" })),
    ])
      .then(([integ, cfg]) => { setIntegration(integ); setConfig(cfg); })
      .catch((e) => setErr(formatApiError(e).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadDocs(opts?: { follow?: string | null; search?: string }) {
    if (!integration?.lastTestOk) return;
    if (docsBusy) return;
    const search = opts && "search" in opts ? opts.search : searchQuery;
    let follow: string | undefined;
    if (opts && "follow" in opts) follow = opts.follow ?? undefined;
    else if (search) follow = stripPageParam(listPath);
    else follow = listPath;
    const gen = ++searchGen.current;
    setDocsBusy(true); setDocsErr("");
    try {
      const params = new URLSearchParams();
      if (follow) params.set("follow", follow);
      if (pageSize) params.set("pageSize", String(pageSize));
      if (search) params.set("search", search);
      const qs = params.toString() ? `?${params}` : "";
      const data = await api<SedPendingList>(`/api/sed/documents/pending${qs}`);
      if (gen !== searchGen.current) return;
      setDocs(data);
      if (data.pageSize) setPageSize(data.pageSize);
      if (!search) setListPath(follow ?? data.listPath);
    } catch (e) {
      if (gen !== searchGen.current) return;
      setDocs(null); setDocsErr(formatApiError(e).message);
    } finally {
      if (gen === searchGen.current) setDocsBusy(false);
    }
  }

  useEffect(() => {
    if (!integration?.lastTestOk) return;
    const follow = searchQuery ? stripPageParam(listPath) : sedReviewFollowPath(activeReview);
    loadDocs({ search: searchQuery, follow });
  }, [integration?.lastTestOk, searchQuery, activeReview]);

  function selectReview(key: SedReviewMetricKey) {
    setSearchInput(""); setSearchQuery(""); setListPath(undefined);
    const next = new URLSearchParams(searchParams);
    if (key === "all") next.delete("review"); else next.set("review", key);
    setSearchParams(next, { replace: true });
  }

  function togglePeriod() {
    const url = docs?.period.toggleUrl;
    if (!url) return;
    setSearchInput(""); setSearchQuery("");
    loadDocs({ follow: url, search: "" });
  }

  function goPage(followUrl: string | null) {
    if (!followUrl || docsBusy || searchQuery) return;
    loadDocs({ follow: followUrl, search: "" });
  }

  if (loading) return <div className="page"><p className="muted">Загрузка…</p></div>;
  if (err) return <div className="page"><p className="error">{err}</p></div>;

  if (!integration?.lastTestOk) {
    return (
      <div className="page">
        <div className="note">
          <p>Подсистема доступна после настройки и успешной проверки подключения к{" "}
            <a href={config?.baseUrl || "http://sed.omskgov.ru"} target="_blank" rel="noreferrer">sed.omskgov.ru</a>.
          </p>
          <Link to="/profile" className="btn">Настроить в профиле</Link>
        </div>
      </div>
    );
  }

  const period = docs?.period;
  const items = docs?.items ?? [];
  const isSearch = Boolean(docs?.searchMode && searchQuery);
  const sedHost = (config?.baseUrl || "sed.omskgov.ru").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  return (
    <div className="page">
      <p className="page-cap">
        Синхронизация с <b>{sedHost}</b>
        {docs ? ` · обновлено ${fmtWhen(docs.fetchedAt)}` : ""} · {integration.groupName || "—"} · {integration.login}
        {period?.shownText ? ` · ${period.shownText}` : ""}
        {period?.toggleLabel && period.toggleUrl && (
          <>{" · "}<button type="button" className="linkish" disabled={docsBusy} onClick={togglePeriod}>{period.toggleLabel}</button></>
        )}
      </p>

      <div className="pagehead">
        <div className="searchbox">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            className="f-input"
            placeholder="Поиск: номер, корреспондент, содержание…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="pagehead-actions">
          <button type="button" className="btn btn-sm" disabled={docsBusy} onClick={() => loadDocs({ follow: searchQuery ? stripPageParam(listPath) : listPath ?? sedReviewFollowPath(activeReview), search: searchQuery })}>
            {docsBusy ? "Обновление…" : "Обновить из СЭД"}
          </button>
        </div>
      </div>

      <SedReviewMetrics dashboard={docs?.dashboard} fallbackTotal={docs?.total} activeKey={activeReview} onSelect={selectReview} busy={docsBusy} />

      {docsErr && <p className="error">{docsErr}</p>}
      {docsBusy && !docs && <p className="muted">Загрузка документов из СЭД…</p>}

      {docs && items.length === 0 && !docsBusy && (
        <div className="note">
          {searchQuery
            ? <><p>Ничего не найдено по запросу «{searchQuery}».</p><button type="button" className="btn ghost btn-sm" onClick={() => { setSearchInput(""); setSearchQuery(""); }}>Сбросить поиск</button></>
            : <p>Документов на рассмотрении нет.</p>}
        </div>
      )}

      {items.length > 0 && (
        <>
          <table className="reg">
            <thead>
              <tr>
                <th>Тип</th>
                <th>№</th>
                <th>Дата</th>
                <th>Корреспондент</th>
                <th>Содержание</th>
                <th>Файлы</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <tr key={doc.id} style={{ cursor: "pointer" }} onClick={() => setDocId(doc.id)}>
                  <td><span className="muted">{doc.kind || "—"}</span></td>
                  <td className="num">
                    <button type="button" className="linkish" onClick={() => setDocId(doc.id)}>{doc.number || doc.id}</button>
                    {(doc.outNumber || doc.outDate) && <div className="sub">{doc.outNumber ? `исх. ${doc.outNumber}` : ""}{doc.outDate ? ` от ${doc.outDate}` : ""}</div>}
                  </td>
                  <td>{doc.regDate || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}><SedCorrespondentCell text={doc.correspondent} /></td>
                  <td>{doc.title || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}><SedAttachmentsCell docId={doc.id} files={doc.files} variant="compact" /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6}>Итого {items.length} документов{docs ? ` из ${docs.matchedCount ?? docs.total}` : ""}</td></tr>
            </tfoot>
          </table>
          <div className="regfoot">
            <span>
              {docs ? `Страница ${docs.pagination.currentPage} из ${docs.pagination.totalPages}` : ""}
              {docs?.fetchedAt ? ` · синхронизировано ${fmtWhen(docs.fetchedAt)}` : ""}
            </span>
            {docs && !isSearch && docs.pagination.nextUrl && (
              <button type="button" className="linkish" disabled={docsBusy} onClick={() => goPage(docs.pagination.nextUrl)}>Следующая страница →</button>
            )}
          </div>
        </>
      )}

      {docId && <SedDocumentModal documentId={docId} onClose={() => setDocId(null)} />}
    </div>
  );
}
