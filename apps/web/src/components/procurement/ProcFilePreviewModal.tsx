import { useEffect, useRef, useState } from "react";
import { renderDocxPreview, renderSheetPreview } from "../../lib/sedOfficePreview";
import { renderPdfPreview } from "../../lib/sedPdfPreview";
import { procFilePreviewMode } from "../../lib/procFiles";

async function fetchBuffer(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Не удалось загрузить файл");
  return res.arrayBuffer();
}

function PdfPane({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    el.innerHTML = "";
    fetchBuffer(url)
      .then((buf) => {
        if (cancelled) return;
        return renderPdfPreview(buf, el);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка PDF");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="proc-preview-pdf">
      {loading && <p className="muted">Загрузка PDF…</p>}
      {error && <p className="form-msg err">{error}</p>}
      <div ref={ref} className={loading ? "proc-preview-hidden" : ""} />
    </div>
  );
}

function OfficePane({ url, mode }: { url: string; mode: "word" | "sheet" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    el.innerHTML = "";
    fetchBuffer(url)
      .then(async (buf) => {
        if (cancelled) return;
        if (mode === "word") await renderDocxPreview(buf, el);
        else await renderSheetPreview(buf, el);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка предпросмотра");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, mode]);

  return (
    <div className="proc-preview-office">
      {loading && <p className="muted">Загрузка…</p>}
      {error && <p className="form-msg err">{error}</p>}
      <div ref={ref} className={loading ? "proc-preview-hidden" : ""} />
    </div>
  );
}

export function ProcFilePreviewModal({
  url,
  fileName,
  onClose,
}: {
  url: string;
  fileName: string;
  onClose: () => void;
}) {
  const mode = procFilePreviewMode(fileName);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop proc-preview-backdrop" onClick={onClose} role="presentation">
      <div className="proc-preview-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="proc-preview-head">
          <h2>{fileName}</h2>
          <div className="proc-preview-head-actions">
            <a href={url} className="btn btn-sm ghost" download={fileName}>
              Скачать
            </a>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </header>
        <div className="proc-preview-body">
          {mode === "pdf" && <PdfPane url={url} />}
          {mode === "image" && <img src={url} alt={fileName} className="proc-preview-img" />}
          {mode === "word" && <OfficePane url={url} mode="word" />}
          {mode === "sheet" && <OfficePane url={url} mode="sheet" />}
          {mode === "none" && (
            <div className="proc-preview-fallback">
              <p className="muted">Предпросмотр недоступен.</p>
              <a href={url} className="btn btn-sm" download={fileName}>
                Скачать файл
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
