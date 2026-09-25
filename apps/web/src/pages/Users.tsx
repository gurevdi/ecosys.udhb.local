import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, CONTRACT_ROLES, contractRoleLabel } from "../api";
import { UserEditModal, type UserRow } from "../components/users/UserEditModal";
import { UsersAdCatalogPanel } from "../components/users/UsersAdCatalogPanel";

type Dept = { id: string; name: string };
type Stats = { total: number; active: number; ad: number; local: number; disabledAd: number };
type Tab = "list" | "catalog";
type Chip = "" | "active" | "ad" | "local" | "blocked" | "adDisabled";
type ListResponse = { items: UserRow[]; total: number; page: number; pageSize: number };

const PAGE_SIZE = 50;

type Props = {
  canDirectory?: boolean;
  selfId?: string;
};

function accessBadges(u: UserRow) {
  const shortRole: Record<string, string> = {
    admin: "админ договоров",
    moderator: "модератор",
    operator: "оператор",
    auditor: "аудитор",
  };
  const badges: { key: string; label: string; cls: string }[] = [];
  if (u.isAdmin) badges.push({ key: "admin", label: "admin", cls: "badge-admin" });
  for (const r of u.contractRoles || []) {
    badges.push({
      key: `cr-${r.role}-${r.departmentId || ""}`,
      label: shortRole[r.role] || contractRoleLabel(r.role),
      cls: "badge-ad",
    });
  }
  const svc = (u.permissions || []).filter((p) => p.canRead || p.canWrite).length;
  if (!u.isAdmin && svc > 0) {
    badges.push({ key: "svc", label: `сервисов: ${svc}`, cls: "badge-local" });
  }
  return badges.slice(0, 4);
}

function buildFilterQs(opts: {
  debouncedQ: string;
  filterDept: string;
  chip: Chip;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (opts.debouncedQ) qs.set("q", opts.debouncedQ);
  if (opts.filterDept) qs.set("departmentId", opts.filterDept);
  if (opts.chip === "ad") qs.set("source", "ad");
  if (opts.chip === "local") qs.set("source", "local");
  if (opts.chip === "active") qs.set("active", "true");
  if (opts.chip === "blocked") qs.set("active", "false");
  if (opts.chip === "adDisabled") qs.set("adDisabled", "1");
  if (opts.page) qs.set("page", String(opts.page));
  if (opts.pageSize) qs.set("pageSize", String(opts.pageSize));
  return qs;
}

export default function Users({ canDirectory, selfId }: Props) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "list";

  const [rows, setRows] = useState<UserRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [deps, setDeps] = useState<Dept[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [chip, setChip] = useState<Chip>("");
  const [filterDept, setFilterDept] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkRole, setBulkRole] = useState("operator");
  const [bulkDept, setBulkDept] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    login: "",
    password: "",
    fullName: "",
    email: "",
    position: "",
    departmentId: "",
  });

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === "list") next.delete("tab");
    else next.set("tab", t);
    setParams(next);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(filterQ.trim()), 300);
    return () => window.clearTimeout(t);
  }, [filterQ]);

  useEffect(() => {
    setPage(1);
    setSelected({});
  }, [debouncedQ, filterDept, chip]);

  const loadDeps = useCallback(async () => {
    const departments = await api<Dept[]>("/api/departments");
    setDeps(departments);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = buildFilterQs({ debouncedQ, filterDept, chip, page, pageSize: PAGE_SIZE });
      const [list, st] = await Promise.all([
        api<ListResponse>(`/api/users?${qs}`),
        api<Stats>("/api/users/stats"),
      ]);
      setRows(list.items);
      setListTotal(list.total);
      setStats(st);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить список");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, filterDept, chip, page]);

  useEffect(() => {
    void loadDeps();
  }, [loadDeps]);

  useEffect(() => {
    if (tab === "list") void load();
  }, [tab, load]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );
  const pageIds = rows.map((u) => u.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected[id]);
  const pageCount = Math.max(1, Math.ceil(listTotal / PAGE_SIZE));

  async function createLocal(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email || null,
          departmentId: form.departmentId || null,
          source: "local",
        }),
      });
      setForm({ login: "", password: "", fullName: "", email: "", position: "", departmentId: "" });
      setAddOpen(false);
      setMsg("Пользователь создан");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать");
    } finally {
      setBusy(false);
    }
  }

  async function syncAllAd() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const r = await api<{ synced: number; failed: number; total: number }>("/api/ad/sync-all", {
        method: "POST",
      });
      setMsg(`Синхронизировано ${r.synced} из ${r.total}${r.failed ? `, ошибок: ${r.failed}` : ""}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Синхронизация не удалась");
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: "activate" | "deactivate" | "syncAd" | "addContractRole") {
    if (!selectedIds.length) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const body: Record<string, unknown> = { ids: selectedIds, action };
      if (action === "addContractRole") {
        body.role = bulkRole;
        body.departmentId = bulkDept || null;
      }
      const r = await api<{
        ok?: boolean;
        affected?: number;
        synced?: number;
        failed?: number;
        total?: number;
      }>("/api/users/bulk", { method: "POST", body: JSON.stringify(body) });
      if (action === "syncAd") {
        setMsg(`Синхронизировано ${r.synced ?? 0} из ${r.total ?? selectedIds.length}${r.failed ? `, ошибок: ${r.failed}` : ""}`);
      } else {
        setMsg(`Обработано: ${r.affected ?? selectedIds.length}`);
      }
      setSelected({});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Массовое действие не выполнено");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    setError("");
    try {
      const qs = buildFilterQs({ debouncedQ, filterDept, chip });
      const res = await fetch(`/api/users/export?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Экспорт не удался");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users.csv";
      a.click();
      URL.revokeObjectURL(url);
      setMsg("CSV скачан");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Экспорт не удался");
    } finally {
      setBusy(false);
    }
  }

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [{ id: "list", label: "Сотрудники" }];
    if (canDirectory) t.push({ id: "catalog", label: "Импорт из AD" });
    return t;
  }, [canDirectory]);

  const hasFilters = Boolean(filterDept || chip || debouncedQ || filterQ);

  function openEdit(u: UserRow) {
    setEdit({
      ...u,
      contractRoles: u.contractRoles || [],
      adGroups: u.adGroups || [],
      permissions: u.permissions || [],
    });
  }

  return (
    <div className="page users-page">
      <div className="users-page-header">
        <p className="page-cap" style={{ margin: 0 }}>
          Учётные записи экосистемы · подключение к домену — <b>Настройки → Active Directory</b>
        </p>
      </div>

      {stats && tab === "list" && (
        <div className="users-stats-row" style={{ marginBottom: 16 }}>
          <div className="users-stat-card">
            <strong>{stats.total}</strong>
            <span className="users-stat-label">всего</span>
          </div>
          <div className="users-stat-card ok">
            <strong>{stats.active}</strong>
            <span className="users-stat-label">активных</span>
          </div>
          <div className="users-stat-card">
            <strong>{stats.ad}</strong>
            <span className="users-stat-label">из AD</span>
          </div>
          <div className="users-stat-card">
            <strong>{stats.local}</strong>
            <span className="users-stat-label">локальных</span>
          </div>
          <div className="users-stat-card bad">
            <strong>{stats.total - stats.active}</strong>
            <span className="users-stat-label">заблокировано</span>
          </div>
          {stats.disabledAd > 0 && (
            <div className="users-stat-card bad">
              <strong>{stats.disabledAd}</strong>
              <span className="users-stat-label">откл. в AD</span>
            </div>
          )}
        </div>
      )}

      {tabs.length > 1 && (
        <nav className="users-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`users-tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {msg && <p className="users-msg">{msg}</p>}
      {error && <p className="error">{error}</p>}

      {tab === "list" && (
        <>
          <div className="pagehead users-toolbar">
            <div className="searchbox grow">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="Поиск: ФИО, логин, почта, должность…"
                className="f-input"
              />
            </div>
            <div className="fld" style={{ minWidth: 180 }}>
              <label>Отдел</label>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                <option value="">Все отделы</option>
                {deps.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pagehead-actions">
              <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => void exportCsv()}>
                CSV
              </button>
              <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => void syncAllAd()}>
                Синхр. все AD
              </button>
              <button className="btn gold btn-sm" type="button" onClick={() => setAddOpen(true)}>
                + Добавить
              </button>
            </div>
          </div>

          <div className="chips">
            {(
              [
                ["", "Все", stats?.total],
                ["active", "Активные", stats?.active],
                ["ad", "Из AD", stats?.ad],
                ["local", "Локальные", stats?.local],
                ["blocked", "Заблокированы", stats ? stats.total - stats.active : undefined],
                ["adDisabled", "Откл. в AD", stats?.disabledAd],
              ] as [Chip, string, number | undefined][]
            ).map(([id, label, count]) => (
              <button
                key={id || "all"}
                type="button"
                className={chip === id ? "chip on" : "chip"}
                onClick={() => setChip(id)}
              >
                {label}
                <span className="c">{count ?? "—"}</span>
              </button>
            ))}
            {hasFilters && (
              <button
                type="button"
                className="f-reset"
                onClick={() => {
                  setFilterDept("");
                  setChip("");
                  setFilterQ("");
                  setDebouncedQ("");
                }}
              >
                Сбросить ×
              </button>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div className="users-bulk-bar">
              <span className="users-bulk-count">Выбрано: {selectedIds.length}</span>
              <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => void runBulk("activate")}>
                Активировать
              </button>
              <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => void runBulk("deactivate")}>
                Заблокировать
              </button>
              <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => void runBulk("syncAd")}>
                Синхр. AD
              </button>
              <select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} className="users-bulk-select">
                {CONTRACT_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select value={bulkDept} onChange={(e) => setBulkDept(e.target.value)} className="users-bulk-select">
                <option value="">Роль: все отделы</option>
                {deps.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void runBulk("addContractRole")}>
                Выдать роль
              </button>
              <button type="button" className="linkish" onClick={() => setSelected({})}>
                Снять выбор
              </button>
            </div>
          )}

          {loading && <p className="note">Загрузка…</p>}
          {!loading && rows.length === 0 && <p className="note">Никого не найдено по текущим фильтрам.</p>}

          {!loading && rows.length > 0 && (
            <>
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={(e) => {
                            const next = { ...selected };
                            if (e.target.checked) pageIds.forEach((id) => { next[id] = true; });
                            else pageIds.forEach((id) => { delete next[id]; });
                            setSelected(next);
                          }}
                          aria-label="Выбрать страницу"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </th>
                      <th>Сотрудник</th>
                      <th>Логин</th>
                      <th>Отдел</th>
                      <th>Источник</th>
                      <th>Доступ</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const badges = accessBadges(u);
                      return (
                        <tr
                          key={u.id}
                          className={!u.isActive ? "inactive users-row-click" : "users-row-click"}
                          onClick={() => openEdit(u)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openEdit(u);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={Boolean(selected[u.id])}
                              onChange={(e) => setSelected({ ...selected, [u.id]: e.target.checked })}
                              aria-label={`Выбрать ${u.login}`}
                            />
                          </td>
                          <td>
                            <div className="name">{u.fullName}</div>
                            <div className="sub">{[u.position, u.email].filter(Boolean).join(" · ")}</div>
                          </td>
                          <td>{u.login}</td>
                          <td>{u.department?.name || "—"}</td>
                          <td>
                            <span className={`badge ${u.source === "ad" ? "badge-ad" : "badge-local"}`}>
                              {u.source === "ad" ? "AD" : "локальный"}
                            </span>
                          </td>
                          <td>
                            <div className="users-access-badges">
                              {badges.map((b) => (
                                <span key={b.key} className={`badge ${b.cls}`}>
                                  {b.label}
                                </span>
                              ))}
                              {badges.length === 0 && <span className="muted">—</span>}
                            </div>
                          </td>
                          <td>
                            {!u.isActive ? (
                              <span className="badge badge-danger">заблокирована</span>
                            ) : u.adAccountDisabled ? (
                              <span className="badge badge-warn">отключена в AD</span>
                            ) : (
                              <span className="badge badge-ok">активен</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button className="linkish" type="button" onClick={() => openEdit(u)}>
                              Изменить
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="users-pager">
                <span>
                  Стр. {page} из {pageCount} · на странице {rows.length} · найдено {listTotal}
                  {stats ? ` · всего в системе ${stats.total}` : ""}
                </span>
                <div className="users-pager-btns">
                  <button
                    type="button"
                    className="btn ghost btn-sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Назад
                  </button>
                  <button
                    type="button"
                    className="btn ghost btn-sm"
                    disabled={page >= pageCount || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Вперёд →
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "catalog" && canDirectory && (
        <UsersAdCatalogPanel
          deps={deps}
          onImported={(n) => {
            void load();
            void loadDeps();
            setMsg(n ? `Импортировано из AD: ${n}` : "Импорт завершён");
          }}
        />
      )}

      {addOpen && (
        <div className="users-modal-backdrop" onClick={() => setAddOpen(false)} role="presentation">
          <form
            className="users-modal card"
            style={{ width: "min(520px, 100%)" }}
            onSubmit={createLocal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="users-modal-head">
              <div>
                <h2>Новый локальный пользователь</h2>
                <p className="muted">Вход по логину и паролю экосистемы</p>
              </div>
              <button type="button" className="btn ghost btn-sm" onClick={() => setAddOpen(false)}>
                ✕
              </button>
            </div>
            <div className="users-modal-fields">
              <div className="field">
                <label>Логин</label>
                <input
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  required
                  minLength={2}
                />
              </div>
              <div className="field">
                <label>Пароль</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>
              <div className="field">
                <label>ФИО</label>
                <input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>Должность</label>
                <input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
              <div className="field">
                <label>Почта</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Отдел</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                >
                  <option value="">—</option>
                  {deps.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="row-actions users-modal-actions">
              <button className="btn gold" type="submit" disabled={busy}>
                {busy ? "Создание…" : "Создать"}
              </button>
              <button className="btn ghost" type="button" onClick={() => setAddOpen(false)}>
                Отмена
              </button>
            </div>
          </form>
        </div>
      )}

      {edit && (
        <UserEditModal
          user={edit}
          deps={deps}
          selfId={selfId}
          onClose={() => setEdit(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
