export function procFileExt(name: string) {
  const p = name.split(".").pop();
  return p && p !== name ? p.toLowerCase() : "";
}

export function procFilePreviewMode(fileName: string): "pdf" | "image" | "word" | "sheet" | "none" {
  const ext = procFileExt(fileName);
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return "image";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx"].includes(ext)) return "sheet";
  return "none";
}

export function procFileCanPreview(fileName: string) {
  return procFilePreviewMode(fileName) !== "none";
}

export function procFileKindLabel(fileName: string) {
  const ext = procFileExt(fileName);
  if (ext === "pdf") return "PDF";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "IMG";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx"].includes(ext)) return "XLS";
  return ext.toUpperCase() || "FILE";
}
