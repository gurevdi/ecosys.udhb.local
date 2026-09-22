import { useEffect, useRef, useState } from "react";
import type { SedDocumentFile } from "../../lib/sedFiles";
import { fetchSedFileBuffer } from "../../lib/sedFileFetch";
import { renderPdfPreview } from "../../lib/sedPdfPreview";

export function SedPdfPreviewPane({ docId, file }: { docId: string; file: SedDocumentFile }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    container.innerHTML = "";

    (async () => {
      try {
        const buf = await fetchSedFileBuffer(docId, file);
        if (cancelled) return;
        await renderPdfPreview(buf, container);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка предпросмотра PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId, file]);

  return (
    <div className="sed-pdf-preview">
      {loading && <p className="sed-pdf-preview-loading">Загрузка PDF…</p>}
      {error && (
        <div className="sed-pdf-preview-error">
          <p className="form-msg err">{error}</p>
        </div>
      )}
      <div ref={containerRef} className={`sed-pdf-preview-content${loading ? " sed-pdf-preview-content--loading" : ""}`} />
    </div>
  );
}
