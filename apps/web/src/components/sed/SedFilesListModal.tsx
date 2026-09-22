import { useEffect, useState } from "react";
import type { SedDocumentFile } from "../../lib/sedFiles";
import { sedFileCanPreview, sedFileKindClass, sedFileKindLabel } from "../../lib/sedFiles";
import { IconDownload } from "../../lib/sedFileIcons";
import { downloadSedFile } from "../../lib/sedDownload";
import { SedFilePreviewModal } from "./SedFilePreviewModal";

export function SedFilesListModal({
  docId,
  files,
  loading = false,
  onClose,
}: {
  docId: string;
  files: SedDocumentFile[];
  loading?: boolean;
  onClose: () => void;
}) {
  const [previewFile, setPreviewFile] = useState<SedDocumentFile | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !previewFile) {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, previewFile]);

  async function handleDownload(file: SedDocumentFile) {
    setDownloadingId(file.id);
    try {
      await downloadSedFile(docId, file);
    } catch {
      /* ignore */
    } finally {
      setDownloadingId(null);
    }
  }

  const archiveUrl = `/api/sed/documents/${docId}/files/archive`;

  return (
    <>
      <div className="modal-backdrop sed-files-list-backdrop" onClick={onClose} role="presentation">
        <div
          className="sed-files-list-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sed-files-list-title"
        >
          <header className="sed-files-list-head">
            <div>
              <h2 id="sed-files-list-title">Вложения</h2>
              <p className="sed-files-list-meta muted">
                {loading ? "Загрузка списка…" : `${files.length} файл(ов)`}
              </p>
            </div>
            <div className="sed-files-list-head-actions">
              {files.length > 1 && (
                <a href={archiveUrl} className="btn ghost btn-sm" download>
                  Скачать ZIP
                </a>
              )}
              <button type="button" className="icon-btn sed-doc-close-btn" onClick={onClose} aria-label="Закрыть">
                ×
              </button>
            </div>
          </header>
          {loading ? (
            <p className="sed-files-list-loading muted">Загрузка вложений из СЭД…</p>
          ) : files.length === 0 ? (
            <p className="sed-files-list-empty muted">Вложений нет</p>
          ) : (
          <ul className="sed-files-list">
            {files.map((f) => (
              <li key={f.id} className="sed-files-list-item">
                <button
                  type="button"
                  className="sed-files-list-main"
                  onClick={() => sedFileCanPreview(f) && setPreviewFile(f)}
                  disabled={!sedFileCanPreview(f)}
                  title={sedFileCanPreview(f) ? "Открыть предпросмотр" : "Предпросмотр недоступен"}
                >
                  <span className={`sed-doc-file-badge sed-doc-file-badge--${sedFileKindClass(f)}`}>
                    {sedFileKindLabel(f)}
                  </span>
                  <span className="sed-files-list-name">{f.name}</span>
                  {f.size && <span className="sed-files-list-size">{f.size}</span>}
                </button>
                <div className="sed-files-list-actions">
                  {sedFileCanPreview(f) && (
                    <button type="button" className="btn ghost btn-sm" onClick={() => setPreviewFile(f)}>
                      Просмотр
                    </button>
                  )}
                  <button
                    type="button"
                    className="sed-files-list-dl"
                    title={`Скачать ${f.name}`}
                    aria-label={`Скачать ${f.name}`}
                    disabled={downloadingId === f.id}
                    onClick={() => void handleDownload(f)}
                  >
                    <IconDownload className="sed-files-list-dl-icon" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          )}
        </div>
      </div>
      {previewFile && (
        <SedFilePreviewModal docId={docId} file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </>
  );
}
