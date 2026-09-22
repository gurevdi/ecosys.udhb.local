import type { SedDocumentFile } from "./sedFiles";

/** Скачивание вложения СЭД с корректным UTF-8 именем файла */
export async function downloadSedFile(docId: string, file: SedDocumentFile) {
  const q = new URLSearchParams({ download: "1", name: file.name });
  const res = await fetch(`/api/sed/documents/${docId}/files/${file.id}?${q.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Не удалось скачать файл");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function sedFileDownloadUrl(docId: string, file: SedDocumentFile) {
  const q = new URLSearchParams({ download: "1", name: file.name });
  return `/api/sed/documents/${docId}/files/${file.id}?${q.toString()}`;
}
