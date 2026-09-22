import { useEffect, useRef, useState } from "react";
import type { SedDocumentFile } from "../../lib/sedFiles";
import { sedFileExt } from "../../lib/sedFiles";
import { fetchSedDocPreviewHtml, fetchSedFileBuffer } from "../../lib/sedFileFetch";
import { renderDocxPreview, renderSheetPreview } from "../../lib/sedOfficePreview";

export function SedOfficePreviewPane({
  docId,
  file,
  mode,
}: {
  docId: string;
  file: SedDocumentFile;
  mode: "word" | "sheet";
}) {
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
        const ext = sedFileExt(file.name);
        if (mode === "word") {
          if (ext === "doc") {
            const html = await fetchSedDocPreviewHtml(docId, file);
            if (cancelled) return;
            container.innerHTML = html;
          } else if (ext === "docx") {
            const buf = await fetchSedFileBuffer(docId, file);
            if (cancelled) return;
            await renderDocxPreview(buf, container);
          } else {
            throw new Error("Предпросмотр недоступен для этого формата Word");
          }
        } else {
          const buf = await fetchSedFileBuffer(docId, file);
          if (cancelled) return;
          await renderSheetPreview(buf, container);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка предпросмотра");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docId, file, mode]);

  return (
    <div className="sed-office-preview">
      {loading && <p className="sed-office-preview-loading">Загрузка предпросмотра…</p>}
      {error && (
        <div className="sed-office-preview-error">
          <p className="form-msg err">{error}</p>
        </div>
      )}
      <div ref={containerRef} className={`sed-office-preview-content${loading ? " sed-office-preview-content--loading" : ""}`} />
    </div>
  );
}
