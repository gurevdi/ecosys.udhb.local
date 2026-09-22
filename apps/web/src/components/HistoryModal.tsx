import { useEffect, useState } from "react";
import { api, day } from "../api";

export type HistoryRow = {
  id: string;
  section: string;
  action: string;
  summary: string;
  details: string | null;
  createdAt: string;
  user: { fullName: string; position: string | null };
};

function HistoryLine({ summary, details }: { summary: string; details: string | null }) {
  const [open, setOpen] = useState(false);
  const hasMore = Boolean(details && details.trim() && details.trim() !== summary.trim());
  return (
    <div className="history-line">
      <span>{summary}</span>
      {hasMore && !open && (
        <button type="button" className="history-more" onClick={() => setOpen(true)} title="Подробнее">
          …
        </button>
      )}
      {hasMore && open && <div className="history-details">{details}</div>}
    </div>
  );
}

export function HistoryModal({ procurementId, onClose }: { procurementId: string; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<HistoryRow[]>(`/api/procurements/${procurementId}/history`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [procurementId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div className="modal-head">
          <h2 id="history-title">История изменений</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="modal-body">
          {loading && <p className="muted">Загрузка…</p>}
          {!loading && rows.length === 0 && <p className="muted">Записей пока нет.</p>}
          {rows.map((r) => (
            <article key={r.id} className="history-item">
              <div className="history-meta">
                <time>{day(r.createdAt)}</time>
                <span>{r.user.fullName}</span>
                <span className="pill">{r.section}</span>
              </div>
              <HistoryLine summary={r.summary} details={r.details} />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
