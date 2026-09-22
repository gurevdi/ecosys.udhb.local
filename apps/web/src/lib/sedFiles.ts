export type SedDocumentFile = { id: string; name: string; size: string | null; mime: string | null };

export function sedFileExt(name: string) {
  const p = name.split(".").pop();
  return p && p !== name ? p.toLowerCase() : "";
}

export function sedFileKindLabel(file: SedDocumentFile) {
  const ext = sedFileExt(file.name);
  if (file.mime === "application/pdf" || ext === "pdf") return "PDF";
  if (file.mime?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "IMG";
  if (["doc", "docx", "rtf"].includes(ext)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (["ppt", "pptx"].includes(ext)) return "PPT";
  if (ext === "zip" || ext === "rar" || ext === "7z") return "ZIP";
  return ext.toUpperCase().slice(0, 4) || "FILE";
}

export function sedFileKindClass(file: SedDocumentFile) {
  return sedFileKindLabel(file).toLowerCase();
}

export function sedFileCanPreview(file: SedDocumentFile) {
  const ext = sedFileExt(file.name);
  if (file.mime === "application/pdf" || ext === "pdf") return true;
  if (file.mime?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return true;
  if (["doc", "docx", "xls", "xlsx", "rtf", "ppt", "pptx"].includes(ext)) return true;
  return false;
}

export function sedFilePreviewMode(file: SedDocumentFile): "pdf" | "image" | "word" | "sheet" | "none" {
  const ext = sedFileExt(file.name);
  if (file.mime === "application/pdf" || ext === "pdf") return "pdf";
  if (file.mime?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx"].includes(ext)) return "sheet";
  if (["rtf", "ppt", "pptx", "csv"].includes(ext)) return "none";
  return "none";
}
