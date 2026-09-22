import { useEffect, useState } from "react";
import { api } from "../../api";
import type { SedDocumentFile } from "../../lib/sedFiles";
import { sedFileKindClass } from "../../lib/sedFiles";
import { IconDownload } from "../../lib/sedFileIcons";
import { downloadSedFile } from "../../lib/sedDownload";
import { SedFilePreviewModal } from "./SedFilePreviewModal";
import { SedFilesListModal } from "./SedFilesListModal";

type Props = {
  docId: string;
  files?: SedDocumentFile[];
  /** compact — кнопка «Посмотреть файлы» в колонке таблицы */
  variant?: "compact" | "full";
};

export function SedAttachmentsCell({ docId, files: initialFiles, variant = "compact" }: Props) {
  const [files, setFiles] = useState<SedDocumentFile[]>(initialFiles || []);
  const [loaded, setLoaded] = useState(Boolean(initialFiles?.length));
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<SedDocumentFile | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (initialFiles?.length) {
      setFiles(initialFiles);
      setLoaded(true);
    }
  }, [initialFiles]);

  async function ensureFiles() {
    if (loaded) return files;
    setLoading(true);
    try {
      const res = await api<{ files: SedDocumentFile[] }>(`/api/sed/documents/${docId}/files`);
      setFiles(res.files);
      setLoaded(true);
      return res.files;
    } catch {
      setFiles([]);
      setLoaded(true);
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function openFilesList(e: React.MouseEvent) {
    e.stopPropagation();
    setListOpen(true);
    if (!loaded) await ensureFiles();
  }

  async function handleDownload(file: SedDocumentFile) {
    setDownloadingId(file.id);
    try {
      await downloadSedFile(docId, file);
    } catch {
      /* retry from preview */
    } finally {
      setDownloadingId(null);
    }
  }

  const archiveUrl = `/api/sed/documents/${docId}/files/archive`;

  if (variant === "compact") {
    return (
      <>
        <button type="button" className="sed-attach-view-btn" disabled={loading} onClick={(e) => void openFilesList(e)}>
          {loading ? "Загрузка…" : "Посмотреть файлы"}
          {loaded && files.length > 0 && <span className="sed-attach-view-count">{files.length}</span>}
        </button>
        {listOpen && (
          <SedFilesListModal
            docId={docId}
            files={files}
            loading={loading}
            onClose={() => setListOpen(false)}
          />
        )}
      </>
    );
  }

  if (!loaded) {
    return (
      <button type="button" className="btn ghost btn-sm" disabled={loading} onClick={() => void ensureFiles()}>
        {loading ? "Вложения…" : "Показать вложения"}
      </button>
    );
  }

  if (!files.length) return null;

  return (
    <>
      <div className="sed-attach-list" onClick={(e) => e.stopPropagation()}>
        {files.map((f) => (
          <div key={f.id} className="sed-attach-item">
            <button type="button" className="sed-attach-file" title={f.name} onClick={() => setPreviewFile(f)}>
              <span className={`sed-attach-icon sed-attach-icon--${sedFileKindClass(f)}`} aria-hidden>
                {f.name.split(".").pop()?.toUpperCase().slice(0, 3) || "FILE"}
              </span>
              <span className="sed-attach-name">{f.name}</span>
            </button>
            <button
              type="button"
              className="sed-attach-dl"
              title={`Скачать ${f.name}`}
              disabled={downloadingId === f.id}
              onClick={(e) => {
                e.stopPropagation();
                void handleDownload(f);
              }}
            >
              <IconDownload className="sed-attach-dl-icon" />
            </button>
          </div>
        ))}
        {files.length > 1 && (
          <a href={archiveUrl} className="sed-attach-zip" download onClick={(e) => e.stopPropagation()}>
            Скачать все ({files.length})
          </a>
        )}
      </div>
      {previewFile && <SedFilePreviewModal docId={docId} file={previewFile} onClose={() => setPreviewFile(null)} />}
    </>
  );
}
