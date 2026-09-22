import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../api";
import { SedFilePreviewModal } from "./sed/SedFilePreviewModal";
import type { SedDocumentFile } from "../lib/sedFiles";
import { sedFileCanPreview, sedFileKindClass, sedFileKindLabel } from "../lib/sedFiles";
import { IconDownload, IconPreview } from "../lib/sedFileIcons";
import { downloadSedFile } from "../lib/sedDownload";

export type { SedDocumentFile } from "../lib/sedFiles";
export type SedDocumentPage = { id: string; body: string };
export type SedDocumentCardMain = {
  docNumber: string | null;
  docDate: string | null;
  signature: string | null;
  executor: string | null;
  to: string | null;
  docKind: string | null;
  regPlace: string | null;
};
export type SedExecutionItem = {
  text: string;
  author: string | null;
  date: string | null;
  status: string | null;
};
export type SedDocumentCard = {
  id: string;
  title: string | null;
  summary: string | null;
  main: SedDocumentCardMain;
  files: SedDocumentFile[];
  pages: SedDocumentPage[];
  execution: SedExecutionItem[];
  sedUrl: string;
  fetchedAt: string;
};

type DocTab = "text" | "files" | "execution";

function fmtFetched(v: string) {
  return new Date(v).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function kindBadgeClass(kind: string | null) {
  const k = (kind || "").toLowerCase();
  if (k.includes("вход")) return "in";
  if (k.includes("исход")) return "out";
  if (k.includes("служеб")) return "memo";
  return "other";
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="sed-doc-meta-row">
      <span className="sed-doc-meta-label">{label}</span>
      <span className="sed-doc-meta-value">{value}</span>
    </div>
  );
}

function SedDocSkeleton() {
  return (
    <div className="sed-doc-modal-layout sed-doc-modal-layout--loading" aria-hidden="true">
      <aside className="sed-doc-modal-aside">
        <div className="sed-doc-meta-card sed-doc-skeleton-block" />
        <div className="sed-doc-meta-card sed-doc-skeleton-block sed-doc-skeleton-block--sm" />
      </aside>
      <main className="sed-doc-modal-main">
        <div className="sed-doc-summary-box sed-doc-skeleton-block sed-doc-skeleton-block--summary" />
        <div className="sed-doc-skeleton-tabs" />
        <div className="sed-doc-skeleton-block sed-doc-skeleton-block--panel" />
      </main>
    </div>
  );
}

export function SedDocumentModal({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [card, setCard] = useState<SedDocumentCard | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<SedDocumentFile | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [tab, setTab] = useState<DocTab>("text");

  useEffect(() => {
    setLoading(true);
    setErr("");
    setCard(null);
    api<SedDocumentCard>(`/api/sed/documents/${documentId}`)
      .then(setCard)
      .catch((e) => setErr(formatApiError(e).message))
      .finally(() => setLoading(false));
  }, [documentId]);

  const defaultTab = useMemo((): DocTab => {
    if (!card) return "text";
    if (card.pages.length > 0) return "text";
    if (card.files.length > 0) return "files";
    if (card.execution.length > 0) return "execution";
    return "text";
  }, [card]);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  const handleClose = useCallback(() => {
    if (previewFile) {
      setPreviewFile(null);
      return;
    }
    onClose();
  }, [previewFile, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  async function handleFileDownload(file: SedDocumentFile) {
    if (!card) return;
    setDownloadingId(file.id);
    try {
      await downloadSedFile(card.id, file);
    } catch {
      /* ignore */
    } finally {
      setDownloadingId(null);
    }
  }

  const main = card?.main;
  const hasParticipants = main && (main.signature || main.executor || main.to);
  const hasRegistration = main && (main.docKind || main.regPlace);
  const heroTitle =
    [main?.docNumber, main?.docDate].filter(Boolean).join(" · ") ||
    card?.title ||
    `Документ ${documentId}`;

  const allTabs: { id: DocTab; label: string; count?: number; hidden?: boolean }[] = [
    { id: "text", label: "Текст", count: card?.pages.length, hidden: !card?.pages.length },
    { id: "files", label: "Вложения", count: card?.files.length, hidden: !card?.files.length },
    { id: "execution", label: "Исполнение", count: card?.execution.length, hidden: !card?.execution.length },
  ];
  const tabs = allTabs.filter((t) => !t.hidden);

  return (
    <>
      <div className="modal-backdrop sed-doc-backdrop" onClick={handleClose} role="presentation">
        <div
          className="sed-doc-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sed-doc-title"
        >
          <header className="sed-doc-modal-hero">
            <div className="sed-doc-modal-hero-main">
              <p className="sed-page-kicker">СЭД · регистрационная карточка</p>
              <div className="sed-doc-modal-hero-row">
                <h2 id="sed-doc-title">{loading ? "Загрузка документа…" : heroTitle}</h2>
                {main?.docKind && (
                  <span className={`sed-doc-kind-badge sed-doc-kind-badge--${kindBadgeClass(main.docKind)}`}>
                    {main.docKind}
                  </span>
                )}
              </div>
              {card?.title && card.title !== heroTitle && (
                <p className="sed-doc-modal-hero-sub">{card.title}</p>
              )}
            </div>
            <div className="sed-doc-modal-hero-actions">
              {card?.sedUrl && (
                <a href={card.sedUrl} target="_blank" rel="noreferrer" className="btn ghost btn-sm sed-doc-ext-link">
                  Открыть в СЭД ↗
                </a>
              )}
              <button type="button" className="icon-btn sed-doc-close-btn" onClick={handleClose} aria-label="Закрыть">
                ×
              </button>
            </div>
          </header>

          <div className="sed-doc-modal-body">
            {loading && <SedDocSkeleton />}
            {err && (
              <div className="sed-doc-error">
                <p className="form-msg err">{err}</p>
                <button type="button" className="btn btn-sm" onClick={handleClose}>
                  Закрыть
                </button>
              </div>
            )}

            {card && !loading && !err && (
              <div className="sed-doc-modal-layout">
                <aside className="sed-doc-modal-aside">
                  {(main?.docNumber || main?.docDate) && (
                    <section className="sed-doc-meta-card">
                      <h3 className="sed-doc-meta-card-title">Реквизиты</h3>
                      <MetaRow label="№ документа" value={main?.docNumber} />
                      <MetaRow label="Дата документа" value={main?.docDate} />
                    </section>
                  )}

                  {hasParticipants && (
                    <section className="sed-doc-meta-card">
                      <h3 className="sed-doc-meta-card-title">Участники</h3>
                      <MetaRow label="Подпись" value={main?.signature} />
                      <MetaRow label="Исполнитель" value={main?.executor} />
                      <MetaRow label="Кому" value={main?.to} />
                    </section>
                  )}

                  {hasRegistration && (
                    <section className="sed-doc-meta-card">
                      <h3 className="sed-doc-meta-card-title">Регистрация</h3>
                      <MetaRow label="Вид документа" value={main?.docKind} />
                      <MetaRow label="Место регистрации" value={main?.regPlace} />
                    </section>
                  )}

                  <section className="sed-doc-meta-card sed-doc-meta-card--stats">
                    <div className="sed-doc-stat-mini">
                      <span className="sed-doc-stat-mini-value">{card.pages.length}</span>
                      <span className="sed-doc-stat-mini-label">страниц текста</span>
                    </div>
                    <div className="sed-doc-stat-mini">
                      <span className="sed-doc-stat-mini-value">{card.files.length}</span>
                      <span className="sed-doc-stat-mini-label">вложений</span>
                    </div>
                    <div className="sed-doc-stat-mini">
                      <span className="sed-doc-stat-mini-value">{card.execution.length}</span>
                      <span className="sed-doc-stat-mini-label">записей исполнения</span>
                    </div>
                  </section>
                </aside>

                <main className="sed-doc-modal-main">
                  {card.summary && (
                    <section className="sed-doc-summary-box" aria-label="Краткое содержание">
                      <span className="sed-doc-summary-kicker">Краткое содержание</span>
                      <p className="sed-doc-summary-text">{card.summary}</p>
                    </section>
                  )}

                  {tabs.length > 0 && (
                    <>
                      <nav className="sed-doc-tabs" role="tablist" aria-label="Разделы документа">
                        {tabs.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === t.id}
                            className={`sed-doc-tab${tab === t.id ? " sed-doc-tab--active" : ""}`}
                            onClick={() => setTab(t.id)}
                          >
                            {t.label}
                            {t.count != null && t.count > 0 && <span className="sed-doc-tab-count">{t.count}</span>}
                          </button>
                        ))}
                      </nav>

                      <div className="sed-doc-tab-panel" role="tabpanel">
                        {tab === "text" &&
                          (card.pages.length > 0 ? (
                            card.pages.map((p, i) => (
                              <article key={p.id} className="sed-doc-text-page">
                                {card.pages.length > 1 && (
                                  <header className="sed-doc-text-page-head">
                                    <span>Страница {i + 1}</span>
                                  </header>
                                )}
                                <pre className="sed-doc-page-text">{p.body}</pre>
                              </article>
                            ))
                          ) : (
                            <p className="sed-doc-empty muted">Текст документа не найден в карточке СЭД.</p>
                          ))}

                        {tab === "files" && (
                          <>
                            {card.files.length > 1 && (
                              <p className="sed-files-archive-bar">
                                <a
                                  href={`/api/sed/documents/${card.id}/files/archive`}
                                  className="btn ghost btn-sm"
                                  download
                                >
                                  Скачать все в ZIP
                                </a>
                              </p>
                            )}
                            <ul className="sed-doc-file-list">
                              {card.files.map((f) => (
                                <li key={f.id} className="sed-doc-file-row">
                                  <span className={`sed-doc-file-badge sed-doc-file-badge--${sedFileKindClass(f)}`}>
                                    {sedFileKindLabel(f)}
                                  </span>
                                  <div className="sed-doc-file-row-main">
                                    <span className="sed-doc-file-name">{f.name}</span>
                                    {f.size && <span className="sed-doc-file-size">{f.size}</span>}
                                  </div>
                                  <div className="sed-doc-file-row-actions">
                                    {sedFileCanPreview(f) && (
                                      <button
                                        type="button"
                                        className="sed-doc-file-icon-btn"
                                        title="Просмотр"
                                        aria-label={`Просмотр ${f.name}`}
                                        onClick={() => setPreviewFile(f)}
                                      >
                                        <IconPreview className="sed-doc-file-icon-btn-svg" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      className="sed-doc-file-icon-btn"
                                      title="Скачать"
                                      aria-label={`Скачать ${f.name}`}
                                      disabled={downloadingId === f.id}
                                      onClick={() => void handleFileDownload(f)}
                                    >
                                      <IconDownload className="sed-doc-file-icon-btn-svg" />
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}

                        {tab === "execution" && (
                          <ol className="sed-doc-timeline">
                            {card.execution.map((item, i) => (
                              <li key={`${item.text.slice(0, 40)}-${i}`} className="sed-doc-timeline-item">
                                <div className="sed-doc-timeline-marker" aria-hidden="true" />
                                <div className="sed-doc-timeline-body">
                                  <p className="sed-doc-timeline-text">{item.text}</p>
                                  {(item.author || item.date || item.status) && (
                                    <div className="sed-doc-timeline-meta">
                                      {item.author && <span className="sed-doc-chip">{item.author}</span>}
                                      {item.date && <span className="sed-doc-chip sed-doc-chip--muted">{item.date}</span>}
                                      {item.status && (
                                        <span className="sed-doc-chip sed-doc-chip--status">{item.status}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </>
                  )}

                  {tabs.length === 0 && !card.summary && (
                    <p className="sed-doc-empty muted">Дополнительные материалы в карточке отсутствуют.</p>
                  )}
                </main>
              </div>
            )}
          </div>

          {card && (
            <footer className="sed-doc-modal-foot">
              <span className="muted">Данные из СЭД · {fmtFetched(card.fetchedAt)}</span>
              <span className="sed-doc-modal-foot-id">ID {card.id}</span>
            </footer>
          )}
        </div>
      </div>

      {previewFile && card && (
        <SedFilePreviewModal docId={card.id} file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </>
  );
}
