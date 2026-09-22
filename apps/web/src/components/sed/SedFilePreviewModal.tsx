import { useEffect, useState } from "react";
import type { SedDocumentFile } from "../../lib/sedFiles";
import { sedFileKindClass, sedFileKindLabel, sedFilePreviewMode } from "../../lib/sedFiles";
import { downloadSedFile } from "../../lib/sedDownload";
import { SedOfficePreviewPane } from "./SedOfficePreviewPane";
import { SedPdfPreviewPane } from "./SedPdfPreviewPane";

export function SedFilePreviewModal({
  docId,
  file,
  onClose,
}: {
  docId: string;
  file: SedDocumentFile;
  onClose: () => void;
}) {
  const previewUrl = `/api/sed/documents/${docId}/files/${file.id}?name=${encodeURIComponent(file.name)}`;
  const mode = sedFilePreviewMode(file);
  const [downloading, setDownloading] = useState(false);
  const [dlErr, setDlErr] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleDownload() {
    setDownloading(true);
    setDlErr("");
    try {
      await downloadSedFile(docId, file);
    } catch {
      setDlErr("Не удалось скачать файл");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="modal-backdrop sed-file-preview-backdrop" onClick={onClose} role="presentation">
      <div
        className="sed-file-preview-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sed-file-preview-title"
      >
        <header className="sed-file-preview-head">
          <div className="sed-file-preview-head-main">
            <span className={`sed-doc-file-badge sed-doc-file-badge--${sedFileKindClass(file)}`}>
              {sedFileKindLabel(file)}
            </span>
            <div>
              <h2 id="sed-file-preview-title">{file.name}</h2>
              {file.size && <p className="sed-file-preview-meta">{file.size}</p>}
            </div>
          </div>
          <div className="sed-file-preview-actions">
            <button type="button" className="btn btn-sm" disabled={downloading} onClick={handleDownload}>
              {downloading ? "Загрузка…" : "Скачать"}
            </button>
            <button type="button" className="icon-btn sed-doc-close-btn" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </header>
        <div className="sed-file-preview-body">
          {mode === "pdf" && <SedPdfPreviewPane docId={docId} file={file} />}
          {mode === "image" && <img src={previewUrl} alt={file.name} className="sed-file-preview-img" />}
          {mode === "word" && <SedOfficePreviewPane docId={docId} file={file} mode="word" />}
          {mode === "sheet" && <SedOfficePreviewPane docId={docId} file={file} mode="sheet" />}
          {mode === "none" && (
            <div className="sed-file-preview-fallback">
              <p>Предпросмотр недоступен для этого типа файла.</p>
              <button type="button" className="btn btn-sm" disabled={downloading} onClick={handleDownload}>
                Скачать файл
              </button>
              {dlErr && <p className="form-msg err">{dlErr}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
