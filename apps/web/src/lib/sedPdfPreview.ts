let workerReady: Promise<void> | null = null;

async function ensurePdfWorker() {
  if (!workerReady) {
    workerReady = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const PdfWorker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?worker")).default;
      pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    })();
  }
  await workerReady;
  return import("pdfjs-dist");
}

export async function renderPdfPreview(buffer: ArrayBuffer, container: HTMLElement) {
  const pdfjs = await ensurePdfWorker();

  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "sed-pdf-preview-pages";
  container.appendChild(wrap);

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const hostWidth = container.clientWidth > 0 ? container.clientWidth - 32 : 760;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(0.6, hostWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });

    const pageWrap = document.createElement("div");
    pageWrap.className = "sed-pdf-preview-page";

    if (pdf.numPages > 1) {
      const label = document.createElement("div");
      label.className = "sed-pdf-preview-page-label";
      label.textContent = `Страница ${pageNum} из ${pdf.numPages}`;
      pageWrap.appendChild(label);
    }

    const canvas = document.createElement("canvas");
    canvas.className = "sed-pdf-preview-canvas";
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    pageWrap.appendChild(canvas);
    wrap.appendChild(pageWrap);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  }
}
