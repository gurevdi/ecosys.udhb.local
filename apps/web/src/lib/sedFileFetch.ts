import type { SedDocumentFile } from "./sedFiles";

export async function fetchSedFileBuffer(docId: string, file: SedDocumentFile) {
  const q = new URLSearchParams({ name: file.name });
  const res = await fetch(`/api/sed/documents/${docId}/files/${file.id}?${q.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Не удалось загрузить файл");
  return res.arrayBuffer();
}

export async function fetchSedDocPreviewHtml(docId: string, file: SedDocumentFile) {
  const q = new URLSearchParams({ name: file.name });
  const res = await fetch(`/api/sed/documents/${docId}/files/${file.id}/preview?${q.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Не удалось загрузить предпросмотр");
  }
  const data = (await res.json()) as { html: string };
  return data.html;
}
