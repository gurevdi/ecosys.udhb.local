export async function renderDocxPreview(buffer: ArrayBuffer, container: HTMLElement) {
  const { renderAsync } = await import("docx-preview");
  container.innerHTML = "";
  await renderAsync(new Blob([buffer]), container, undefined, {
    className: "docx-preview-sed",
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    breakPages: true,
  });
}

export async function renderSheetPreview(buffer: ArrayBuffer, container: HTMLElement) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array", codepage: 1251 });
  container.innerHTML = "";

  if (!wb.SheetNames.length) {
    container.textContent = "Таблица пуста";
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "sed-sheet-preview";

  const tableHost = document.createElement("div");
  tableHost.className = "sed-sheet-table-wrap";

  function showSheet(name: string) {
    const ws = wb.Sheets[name];
    if (!ws) {
      tableHost.innerHTML = "<p class=\"muted\">Лист пуст</p>";
      return;
    }
    tableHost.innerHTML = XLSX.utils.sheet_to_html(ws, { id: "sed-sheet-table", editable: false });
  }

  if (wb.SheetNames.length > 1) {
    const tabs = document.createElement("div");
    tabs.className = "sed-sheet-tabs";
    tabs.setAttribute("role", "tablist");

    wb.SheetNames.forEach((name, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `sed-sheet-tab${i === 0 ? " sed-sheet-tab--active" : ""}`;
      btn.textContent = name;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", i === 0 ? "true" : "false");
      btn.onclick = () => {
        tabs.querySelectorAll(".sed-sheet-tab").forEach((el) => {
          el.classList.remove("sed-sheet-tab--active");
          el.setAttribute("aria-selected", "false");
        });
        btn.classList.add("sed-sheet-tab--active");
        btn.setAttribute("aria-selected", "true");
        showSheet(name);
      };
      tabs.appendChild(btn);
    });

    wrap.appendChild(tabs);
  }

  wrap.appendChild(tableHost);
  container.appendChild(wrap);
  showSheet(wb.SheetNames[0]!);
}
