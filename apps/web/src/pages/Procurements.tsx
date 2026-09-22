import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  canDeleteContracts,
  canManageFolders,
  canManageContractRoles,
  canWriteContracts,
  CATEGORY,
  CATEGORY_IDS,
  day,
  METHOD,
  money,
  STATUS,
} from "../api";
import { DeleteButton } from "../components/DeleteButton";
import type { Me } from "../App";
import { isContractStage, phaseIndex, type ListWorkflowMeta } from "../lib/proc-workflow";
import { SUBSYSTEM_CONTRACTS } from "../lib/subsystems";

type Dept = { id: string; name: string };
type FolderNode = {
  id: string;
  name: string;
  year: number | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  children: FolderNode[];
  procurementCount: number;
};
type Row = {
  id: string;
  serialNo: number;
  createdAt: string;
  title: string;
  method: string;
  category: string;
  status: string;
  budgetYear: number | null;
  estimatedAmount: string | null;
  contractAmount: string | null;
  contractNumber: string | null;
  contractDate: string | null;
  validUntil: string | null;
  deliveryUntil: string | null;
  acceptanceDueAt: string | null;
  executorName: string | null;
  contractKind: string | null;
  contractComment: string | null;
  fromArchive: boolean;
  selectedQuote: { supplierName: string } | null;
  department: { id: string; name: string };
  folder: { id: string; name: string; year: number | null } | null;
  initiator: { fullName: string };
  payments?: { amount: string | null; paidAt: string | null }[];
  _count: { quotes: number; memos: number; payments?: number };
  workflow?: ListWorkflowMeta;
};

const COLUMN_DEFS: { id: string; label: string; def: boolean }[] = [
  { id: "serial", label: "№", def: true },
  { id: "title", label: "Закупка", def: true },
  { id: "category", label: "Тип", def: true },
  { id: "status", label: "Этап", def: true },
  { id: "supplier", label: "Поставщик", def: true },
  { id: "amount", label: "Сумма", def: true },
  { id: "contractNo", label: "№ контракта", def: false },
  { id: "contractDate", label: "Заключён", def: false },
  { id: "validUntil", label: "Действует до", def: false },
  { id: "executor", label: "Исполнитель", def: false },
  { id: "contractKind", label: "Вид договора", def: false },
  { id: "comment", label: "Комментарий", def: false },
  { id: "payments", label: "Оплаты", def: false },
  { id: "year", label: "Год карточки", def: false },
];

const KIND_LABEL: Record<string, string> = { renewable: "Продляемый", onetime: "Разовый" };

function loadColumns(): string[] {
  try {
    const raw = localStorage.getItem("ecosys-proc-cols");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch {
    /* ignore */
  }
  return COLUMN_DEFS.filter((c) => c.def).map((c) => c.id);
}

function FolderNav({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: {
  nodes: FolderNode[];
  selectedId: string;
  onSelect: (id: string, year: number | null, deptId: string | null) => void;
  depth?: number;
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>
          <button
            type="button"
            className={`toc-item${selectedId === n.id ? " toc-item--on" : ""}${depth === 0 && n.year != null ? " toc-year" : depth > 0 ? " toc-sub" : ""}`}
            style={depth > 1 ? { paddingLeft: depth * 14 + 16 } : undefined}
            onClick={() => onSelect(n.id, n.year, n.departmentId)}
          >
            <span>{n.name}</span>
            {n.procurementCount > 0 && <span className="c">{n.procurementCount}</span>}
          </button>
          {n.children.length > 0 && (
            <FolderNav nodes={n.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  );
}

function resolveFolderForYear(tree: FolderNode[], year: number, departmentId: string) {
  const yearRoot = tree.find((f) => f.year === year);
  if (!yearRoot) return "";
  const deptFolder = yearRoot.children.find((c) => c.departmentId === departmentId);
  return deptFolder?.id || yearRoot.id;
}

function defaultContractYear(defaultYear: number | null | undefined, years: number[]) {
  if (defaultYear != null) return String(defaultYear);
  return years[0] ? String(years[0]) : "";
}

function CreateModal({
  open,
  onClose,
  form,
  setForm,
  deps,
  contractYears,
  onSubmit,
  pickYear,
  pickDepartment,
}: {
  open: boolean;
  onClose: () => void;
  form: {
    title: string;
    method: string;
    category: string;
    departmentId: string;
    folderId: string;
    budgetYear: string;
    description: string;
    estimatedAmount: string;
  };
  setForm: (v: typeof form | ((f: typeof form) => typeof form)) => void;
  deps: Dept[];
  contractYears: number[];
  onSubmit: (e: FormEvent) => void;
  pickYear: (y: string) => void;
  pickDepartment: (id: string) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>Новая закупка</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <form className="modal-body" onSubmit={onSubmit}>
          <div className="proc-form-grid">
            <div className="field proc-span-2">
              <label>Наименование</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
            </div>
            <div className="field">
              <label>Отдел</label>
              <select value={form.departmentId} onChange={(e) => pickDepartment(e.target.value)}>
                {deps.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Год договора</label>
              <select value={form.budgetYear} onChange={(e) => pickYear(e.target.value)} required={contractYears.length > 0}>
                <option value="">— выберите —</option>
                {contractYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Тип договора</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                {CATEGORY_IDS.map((id) => (
                  <option key={id} value={id}>
                    {CATEGORY[id]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Способ</label>
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="electronic_shop">Электронный магазин</option>
                <option value="auction">Аукцион / торги</option>
              </select>
            </div>
            <div className="field">
              <label>Ориентир суммы, ₽</label>
              <input type="number" step="0.01" value={form.estimatedAmount} onChange={(e) => setForm({ ...form, estimatedAmount: e.target.value })} />
            </div>
            <div className="field proc-span-2">
              <label>Описание</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn">
              Создать и открыть
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_SHORT: Record<string, string> = {
  draft: "Черновик",
  collecting_quotes: "Сбор КП",
  memo: "СЗ",
  approval: "Согласование",
  supervisor_approval: "Согл. рук.",
  director_approval: "Согл. дир.",
  transferred: "В договорной",
  returned: "Возврат",
  published: "Размещено",
  bidding: "Торги",
  contracted: "Контракт",
  execution: "Исполнение",
  acceptance_window: "Приёмка",
  completed: "Завершено",
  rejected: "Отклонено",
};

function stOf(status: string) {
  if (status === "completed") return "st--ok";
  if (status === "rejected") return "st--danger";
  if (status === "draft") return "st--muted";
  if (["acceptance_window", "approval", "supervisor_approval", "director_approval", "memo", "returned"].includes(status))
    return "st--gold";
  return "st--work";
}
type SortKey = "serial" | "title" | "category" | "status" | "supplier" | "amount" | "contractDate";
type SortDir = "asc" | "desc";
type QuickFilter = "" | "active" | "done" | "attention" | "mine";

function compareRows(a: Row, b: Row, key: SortKey) {
  if (key === "serial") return a.serialNo - b.serialNo;
  if (key === "title") return a.title.localeCompare(b.title, "ru");
  if (key === "category") {
    return (CATEGORY[a.category] || a.category).localeCompare(CATEGORY[b.category] || b.category, "ru");
  }
  if (key === "status") {
    return (STATUS[a.status] || a.status).localeCompare(STATUS[b.status] || b.status, "ru");
  }
  if (key === "supplier") {
    const as = a.selectedQuote?.supplierName || "";
    const bs = b.selectedQuote?.supplierName || "";
    return as.localeCompare(bs, "ru");
  }
  if (key === "amount") {
    return Number(a.contractAmount || a.estimatedAmount || 0) - Number(b.contractAmount || b.estimatedAmount || 0);
  }
  return (a.contractDate || "").localeCompare(b.contractDate || "");
}

function sortRows(list: Row[], key: SortKey, dir: SortDir) {
  const copy = [...list];
  copy.sort((a, b) => {
    const cmp = compareRows(a, b, key);
    return dir === "asc" ? cmp : -cmp;
  });
  return copy;
}

export default function Procurements() {
  const [rows, setRows] = useState<Row[]>([]);
  const [deps, setDeps] = useState<Dept[]>([]);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [contractYears, setContractYears] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState("folders");
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [yearField, setYearField] = useState<"any" | "budget" | "contract" | "payment">("any");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterSumMin, setFilterSumMin] = useState("");
  const [filterSumMax, setFilterSumMax] = useState("");
  const [cols, setCols] = useState<string[]>(() => loadColumns());
  const [colsOpen, setColsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("");
  const [sort, setSort] = useState<SortKey>("serial");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [searchRows, setSearchRows] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [me, setMe] = useState<Me["user"] | null>(null);
  const filterYearInitialized = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();
  const [form, setForm] = useState({
    title: "",
    method: "electronic_shop",
    category: "service",
    departmentId: "",
    folderId: "",
    budgetYear: "",
    description: "",
    estimatedAmount: "",
  });

  async function load() {
    const params = new URLSearchParams();
    if (selectedFolderId) params.set("folderId", selectedFolderId);
    if (filterDept) params.set("departmentId", filterDept);
    if (filterYear) params.set("year", filterYear);
    if (yearField) params.set("yearField", yearField);
    if (filterSupplier.trim()) params.set("supplier", filterSupplier.trim());
    if (filterStatus) params.set("status", filterStatus);
    if (filterCategory) params.set("category", filterCategory);
    const q = params.toString() ? `?${params}` : "";
    const [list, departments, folders, settings, session, yearsData] = await Promise.all([
      api<Row[]>(`/api/procurements${q}`),
      api<Dept[]>("/api/departments"),
      api<{ tree: FolderNode[] }>("/api/contracts/folders"),
      api<Record<string, string>>("/api/settings"),
      api<Me>("/api/auth/me"),
      api<{ years: number[]; currentYear: number; defaultYear: number | null }>("/api/contracts/years"),
    ]);
    setMe(session.user);
    setRows(list);
    setDeps(departments);
    setFolderTree(folders.tree);
    setContractYears(yearsData.years);
    setViewMode(settings.contracts_view_mode || "folders");
    if (!filterYearInitialized.current && yearsData.years.length) {
      const y = defaultContractYear(yearsData.defaultYear, yearsData.years);
      if (y) setFilterYear(y);
      filterYearInitialized.current = true;
    }
    if (departments[0]) {
      setForm((f) => {
        const departmentId = f.departmentId || departments[0].id;
        const budgetYear = f.budgetYear || defaultContractYear(yearsData.defaultYear, yearsData.years);
        const folderId =
          f.folderId || (budgetYear ? resolveFolderForYear(folders.tree, Number(budgetYear), departmentId) : "");
        return { ...f, departmentId, budgetYear, folderId };
      });
    }
  }

  useEffect(() => {
    load();
  }, [selectedFolderId, filterDept, filterYear, filterStatus, filterCategory, yearField, filterSupplier]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchRows(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api<Row[]>(`/api/procurements?q=${encodeURIComponent(q)}`)
        .then(setSearchRows)
        .catch(() => setSearchRows([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    let list = search.trim() ? searchRows ?? [] : rows;
    if (filterMethod) list = list.filter((r) => r.method === filterMethod);
    if (quickFilter === "active") list = list.filter((r) => !["completed", "rejected"].includes(r.status));
    if (quickFilter === "done") list = list.filter((r) => r.status === "completed");
    if (quickFilter === "attention") {
      list = list.filter((r) => r.workflow?.hasBlockers || r.workflow?.hasWarnings);
    }
    if (quickFilter === "mine" && me) {
      list = list.filter((r) => r.initiator.fullName === me.fullName || r.executorName === me.fullName);
    }
    const min = Number(filterSumMin);
    const max = Number(filterSumMax);
    if (filterSumMin && Number.isFinite(min)) {
      list = list.filter((r) => Number(r.contractAmount || r.estimatedAmount || 0) >= min);
    }
    if (filterSumMax && Number.isFinite(max)) {
      list = list.filter((r) => Number(r.contractAmount || r.estimatedAmount || 0) <= max);
    }
    return sortRows(list, sort, sortDir);
  }, [rows, searchRows, search, filterMethod, quickFilter, sort, sortDir, me, filterSumMin, filterSumMax]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => !["completed", "rejected"].includes(r.status)).length;
    const done = rows.filter((r) => r.status === "completed").length;
    const attention = rows.filter((r) => r.workflow?.hasBlockers || r.workflow?.hasWarnings).length;
    const mine = me ? rows.filter((r) => r.initiator.fullName === me.fullName || r.executorName === me.fullName).length : 0;
    const byCategory = Object.fromEntries(CATEGORY_IDS.map((id) => [id, rows.filter((r) => r.category === id).length]));
    return { total: rows.length, active, done, attention, mine, byCategory };
  }, [rows, me]);

  function pickYear(year: string, departmentId = form.departmentId) {
    const folderId = year ? resolveFolderForYear(folderTree, Number(year), departmentId) : "";
    setForm((f) => ({ ...f, budgetYear: year, folderId }));
  }

  function pickDepartment(departmentId: string) {
    const folderId = form.budgetYear
      ? resolveFolderForYear(folderTree, Number(form.budgetYear), departmentId)
      : form.folderId;
    setForm((f) => ({ ...f, departmentId, folderId }));
  }

  function selectFolder(id: string, year: number | null, deptId: string | null) {
    setSelectedFolderId(id);
    if (year) setFilterYear(String(year));
    if (deptId) setFilterDept(deptId);
    setForm((f) => ({
      ...f,
      folderId: id,
      budgetYear: year ? String(year) : f.budgetYear,
      departmentId: deptId || f.departmentId,
    }));
  }

  function clearFilters() {
    setSelectedFolderId("");
    setFilterDept("");
    setFilterStatus("");
    setFilterCategory("");
    setFilterMethod("");
    setQuickFilter("");
    setFilterYear("");
    setFilterSupplier("");
    setFilterSumMin("");
    setFilterSumMax("");
    setSearch("");
  }

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(key);
    setSortDir("asc");
  }

  function sortMark(key: SortKey) {
    if (sort !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const created = await api<{ id: string }>("/api/procurements", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        folderId: form.folderId || null,
        budgetYear: form.budgetYear ? Number(form.budgetYear) : null,
        estimatedAmount: form.estimatedAmount ? Number(form.estimatedAmount) : null,
      }),
    });
    setCreateOpen(false);
    nav(`/procurements/${created.id}`);
  }

  async function remove(row: Row) {
    if (!confirm(`Удалить закупку «${row.title}»?`)) return;
    await api(`/api/procurements/${row.id}`, { method: "DELETE" });
    await load();
  }

  const selectedFolderName = useMemo(() => {
    function find(nodes: FolderNode[]): string | null {
      for (const n of nodes) {
        if (n.id === selectedFolderId) return n.name;
        const nested = find(n.children);
        if (nested) return nested;
      }
      return null;
    }
    return selectedFolderId ? find(folderTree) : null;
  }, [folderTree, selectedFolderId]);

  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (search.trim()) {
      chips.push({ key: "q", label: `Поиск: ${search.trim()}`, clear: () => setSearch("") });
    }
    if (filterYear) {
      chips.push({ key: "year", label: `Год: ${filterYear}`, clear: () => setFilterYear("") });
    }
    if (filterDept) {
      const name = deps.find((d) => d.id === filterDept)?.name || filterDept;
      chips.push({ key: "dept", label: `Отдел: ${name}`, clear: () => setFilterDept("") });
    }
    if (filterStatus) {
      chips.push({
        key: "status",
        label: `Этап: ${STATUS[filterStatus] || filterStatus}`,
        clear: () => setFilterStatus(""),
      });
    }
    if (filterCategory) {
      chips.push({
        key: "cat",
        label: `Тип: ${CATEGORY[filterCategory] || filterCategory}`,
        clear: () => setFilterCategory(""),
      });
    }
    if (filterMethod) {
      chips.push({
        key: "method",
        label: `Способ: ${METHOD[filterMethod] || filterMethod}`,
        clear: () => setFilterMethod(""),
      });
    }
    if (quickFilter === "active") {
      chips.push({ key: "qf", label: "В работе", clear: () => setQuickFilter("") });
    }
    if (quickFilter === "done") {
      chips.push({ key: "qf", label: "Завершено", clear: () => setQuickFilter("") });
    }
    if (quickFilter === "attention") {
      chips.push({ key: "qf", label: "С замечаниями", clear: () => setQuickFilter("") });
    }
    if (quickFilter === "mine") {
      chips.push({ key: "qf", label: "Мои", clear: () => setQuickFilter("") });
    }
    if (selectedFolderId) {
      chips.push({
        key: "folder",
        label: `Папка: ${selectedFolderName || "…"}`,
        clear: () => setSelectedFolderId(""),
      });
    }
    return chips;
  }, [
    search,
    filterYear,
    filterDept,
    filterStatus,
    filterCategory,
    filterMethod,
    quickFilter,
    selectedFolderId,
    selectedFolderName,
    deps,
  ]);


  const hasFilters = filterChips.length > 0;
  const canWrite = me ? canWriteContracts(me) : false;
  const canSettings = me && (canManageFolders(me) || canManageContractRoles(me));
  const readOnlyRole = me && !canWrite && me.contractRoles.some((r) => r.role === "auditor");
  const exportParams = new URLSearchParams();
  if (filterYear) exportParams.set("year", filterYear);
  if (yearField) exportParams.set("yearField", yearField);
  if (filterDept) exportParams.set("departmentId", filterDept);
  if (filterStatus) exportParams.set("status", filterStatus);
  if (filterCategory) exportParams.set("category", filterCategory);
  if (filterSupplier.trim()) exportParams.set("supplier", filterSupplier.trim());
  if (selectedFolderId) exportParams.set("folderId", selectedFolderId);
  const exportQs = exportParams.toString();

  function toggleCol(id: string) {
    setCols((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      const final = next.length ? next : ["title"];
      localStorage.setItem("ecosys-proc-cols", JSON.stringify(final));
      return final;
    });
  }
  const show = (id: string) => cols.includes(id);

  return (
    <div className="page">
      <p className="page-cap">
        {search.trim() ? (
          <>Поиск по всему реестру: <b>«{search.trim()}»</b> · {searching ? "ищу…" : `найдено ${filtered.length}`}</>
        ) : (
          <>Выборка {filterYear ? <>по <b>{filterYear} году</b></> : "по всем годам"} · показано {filtered.length} из {rows.length}</>
        )}
        {readOnlyRole && " · только просмотр"}
      </p>

      <div className="pagehead">
        <div className="searchbox">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            className="f-input"
            placeholder="Поиск: №, поставщик, ИНН, сумма…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }}
          />
        </div>
        <div className="pagehead-actions">
          <a className="btn ghost btn-sm" href={`/api/procurements/export?${exportQs}`}>Excel</a>
          {canWrite && (
            <button type="button" className="btn gold btn-sm" onClick={() => setCreateOpen(true)}>+ Новая закупка</button>
          )}
        </div>
      </div>

      <div className="chips">
        <button type="button" className={quickFilter === "" ? "chip on" : "chip"} onClick={() => setQuickFilter("")}>
          Все<span className="c">{stats.total}</span>
        </button>
        <button type="button" className={quickFilter === "active" ? "chip on" : "chip"} onClick={() => setQuickFilter((v) => (v === "active" ? "" : "active"))}>
          В работе<span className="c">{stats.active}</span>
        </button>
        <button type="button" className={quickFilter === "attention" ? "chip on" : "chip"} onClick={() => setQuickFilter((v) => (v === "attention" ? "" : "attention"))}>
          Просрочены<span className="c">{stats.attention}</span>
        </button>
        <button type="button" className={quickFilter === "done" ? "chip on" : "chip"} onClick={() => setQuickFilter((v) => (v === "done" ? "" : "done"))}>
          Завершены<span className="c">{stats.done}</span>
        </button>
        {me && (
          <button type="button" className={quickFilter === "mine" ? "chip on" : "chip"} onClick={() => setQuickFilter((v) => (v === "mine" ? "" : "mine"))}>
            Мои<span className="c">{stats.mine}</span>
          </button>
        )}
      </div>

      <div className="filters">
        <div className="fld"><label>Год</label>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">Все годы</option>
            {contractYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="fld"><label>Отдел</label>
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">Все отделы</option>
            {deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="fld"><label>Тип</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">Все типы</option>
            {CATEGORY_IDS.map((id) => <option key={id} value={id}>{CATEGORY[id]} ({stats.byCategory[id] || 0})</option>)}
          </select>
        </div>
        <div className="fld"><label>Этап</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Все этапы</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="fld"><label>Поставщик</label>
          <input value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} placeholder="ОКС…" />
        </div>
        <div className="fld"><label>Сумма, ₽</label>
          <span className="f-range">
            <input inputMode="numeric" value={filterSumMin} onChange={(e) => setFilterSumMin(e.target.value)} placeholder="от" />
            <input inputMode="numeric" value={filterSumMax} onChange={(e) => setFilterSumMax(e.target.value)} placeholder="до" />
          </span>
        </div>
        <div className="fld"><label>Сортировка</label>
          <select value={`${sort}:${sortDir}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort(k as SortKey); setSortDir(d as SortDir); }}>
            <option value="serial:desc">Сначала новые</option>
            <option value="serial:asc">По номеру ↑</option>
            <option value="amount:desc">По сумме ↓</option>
            <option value="amount:asc">По сумме ↑</option>
            <option value="contractDate:desc">По дате заключения</option>
            <option value="title:asc">По названию</option>
          </select>
        </div>
        {hasFilters && <button type="button" className="f-reset" onClick={clearFilters}>Сбросить ×</button>}
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-v">{filtered.length}</div><div className="stat-l">в выборке</div></div>
        <div className="stat"><div className="stat-v">{stats.active}</div><div className="stat-l">в работе</div></div>
        <div className="stat"><div className="stat-v">{stats.done}</div><div className="stat-l">завершено</div></div>
        <div className="stat stat--danger"><div className="stat-v">{stats.attention}</div><div className="stat-l">замечания</div></div>
      </div>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} form={form} setForm={setForm} deps={deps} contractYears={contractYears} onSubmit={create} pickYear={pickYear} pickDepartment={pickDepartment} />

      <div className={viewMode === "folders" ? "reglayout" : ""}>
        {viewMode === "folders" && (
          <aside className="toc">
            <div className="toc-title">Оглавление</div>
            <button type="button" className={!selectedFolderId ? "toc-item toc-item--on" : "toc-item"} onClick={() => clearFilters()}>
              <span>Все закупки</span><span className="c">{stats.total}</span>
            </button>
            <FolderNav nodes={folderTree} selectedId={selectedFolderId} onSelect={selectFolder} />
          </aside>
        )}

        <div>
          {colsOpen && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
              {COLUMN_DEFS.map((c) => (
                <label key={c.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="checkbox" checked={show(c.id)} onChange={() => toggleCol(c.id)} style={{ width: "auto" }} />{c.label}
                </label>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="note">
              <p>{search.trim() ? `По запросу «${search.trim()}» ничего не найдено` : "Нет закупок по выбранным условиям"}</p>
              {hasFilters ? (
                <button type="button" className="btn ghost" onClick={clearFilters}>Сбросить фильтры</button>
              ) : canWrite ? (
                <button type="button" className="btn ghost" onClick={() => setCreateOpen(true)}>Создать первую</button>
              ) : null}
            </div>
          ) : (
            <table className="reg">
              <thead>
                <tr>
                  {show("serial") && <th style={{ width: 54 }}>№</th>}
                  {show("title") && <th>Закупка</th>}
                  {show("category") && <th>Тип</th>}
                  {show("status") && <th>Этап</th>}
                  {show("supplier") && <th>Поставщик / поставка</th>}
                  {show("amount") && <th className="sum">Сумма</th>}
                  {show("contractNo") && <th>№ контракта</th>}
                  {show("contractDate") && <th>Заключён</th>}
                  {show("validUntil") && <th>Действует до</th>}
                  {show("executor") && <th>Исполнитель</th>}
                  {show("contractKind") && <th>Вид договора</th>}
                  {show("comment") && <th>Комментарий</th>}
                  {show("payments") && <th>Оплаты</th>}
                  {show("year") && <th>Год</th>}
                  <th style={{ width: 30 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={r.workflow?.hasBlockers ? "row-danger" : ""} onDoubleClick={() => nav(`/procurements/${r.id}`)}>
                    {show("serial") && <td className="num">№{r.serialNo}</td>}
                    {show("title") && (
                      <td>
                        <Link to={`/procurements/${r.id}`} className="name">{r.title}{r.fromArchive ? " · архив" : ""}</Link>
                        <div className="sub">{r.department.name} · создан {day(r.createdAt)}</div>
                      </td>
                    )}
                    {show("category") && <td><span className="muted">{CATEGORY[r.category] || r.category}</span></td>}
                    {show("status") && (
                      <td>
                        <span className="stage" aria-hidden>
                          {[0, 1, 2, 3, 4].map((i) => {
                            const cur = r.status === "completed" ? 5 : r.status === "rejected" ? -1 : phaseIndex(r.status);
                            return <i key={i} className={i < cur ? "done" : i === cur ? "now" : ""} />;
                          })}
                        </span>
                        <span className={`st ${stOf(r.status)}`}>{STATUS_SHORT[r.status] || STATUS[r.status] || r.status}</span>
                      </td>
                    )}
                    {show("supplier") && (
                      <td>
                        {r.selectedQuote?.supplierName || "—"}
                        {isContractStage(r.status) && r.deliveryUntil && <span className="muted"> · до {day(r.deliveryUntil)}</span>}
                      </td>
                    )}
                    {show("amount") && <td className="sum">{money(r.contractAmount || r.estimatedAmount)}</td>}
                    {show("contractNo") && <td>{r.contractNumber || "—"}</td>}
                    {show("contractDate") && <td>{day(r.contractDate)}</td>}
                    {show("validUntil") && <td>{day(r.validUntil)}</td>}
                    {show("executor") && <td>{r.executorName || "—"}</td>}
                    {show("contractKind") && <td>{KIND_LABEL[r.contractKind || ""] || "—"}</td>}
                    {show("comment") && <td className="sub">{r.contractComment || "—"}</td>}
                    {show("payments") && (
                      <td>{r.payments?.length ? money(r.payments.reduce((s, p) => s + Number(p.amount || 0), 0)) : "—"}</td>
                    )}
                    {show("year") && <td>{r.budgetYear || "—"}</td>}
                    <td>
                      {me && canDeleteContracts(me, r.department.id) && <DeleteButton onClick={() => remove(r)} title="Удалить" />}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={cols.length}>Итого на странице — {filtered.length} записей{filtered.length !== rows.length ? ` из ${rows.length}` : ""}</td>
                  <td className="sum">{money(filtered.reduce((s, r) => s + Number(r.contractAmount || r.estimatedAmount || 0), 0))}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {filtered.length > 0 && (
            <div className="regfoot">
              <span>Строки 1–{filtered.length} из {rows.length} · выписка сформирована {new Date().toLocaleDateString("ru-RU")}</span>
              <a href={`/api/procurements/export?${exportQs}`}>Выгрузить Excel →</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
