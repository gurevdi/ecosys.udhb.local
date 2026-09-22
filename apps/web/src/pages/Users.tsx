import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { UserEditModal, type UserRow } from "../components/users/UserEditModal";
import { UsersAdCatalogPanel } from "../components/users/UsersAdCatalogPanel";

type Dept = { id: string; name: string };
type Stats = { total: number; active: number; ad: number; local: number; disabledAd: number };
type Tab = "list" | "catalog";

export default function Users({ canDirectory }: { canDirectory?: boolean }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "list";

  const [rows, setRows] = useState<UserRow[]>([]);
  const [deps, setDeps] = useState<Dept[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    login: "", password: "", fullName: "", email: "", position: "", departmentId: "",
  });

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === "list") next.delete("tab"); else next.set("tab", t);
    setParams(next);
  };

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterQ.trim()) qs.set("q", filterQ.trim());
    if (filterSource) qs.set("source", filterSource);
    if (filterActive) qs.set("active", filterActive);
    const [users, departments, st] = await Promise.all([
      api<UserRow[]>(`/api/users?${qs}`),
      api<Dept[]>("/api/departments"),
      api<Stats>("/api/users/stats"),
    ]);
    setRows(users); setDeps(departments); setStats(st);
  }, [filterQ, filterSource, filterActive]);

  useEffect(() => { if (tab === "list") void load(); }, [tab, load]);

  async function createLocal(e: FormEvent) {
    e.preventDefault();
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({ ...form, email: form.email || null, departmentId: form.departmentId || null, source: "local" }),
    });
    setForm({ login: "", password: "", fullName: "", email: "", position: "", departmentId: "" });
    await load();
  }

  async function syncAllAd() {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ synced: number; failed: number; total: number }>("/api/ad/sync-all", { method: "POST" });
      setMsg(`Синхронизировано ${r.synced} из ${r.total}${r.failed ? `, ошибок: ${r.failed}` : ""}`);
      await load();
    } finally { setBusy(false); }
  }

  const tabs = useMemo(() => {
    const t: { id: Tab; label: string }[] = [{ id: "list", label: "Сотрудники" }];
    if (canDirectory) t.push({ id: "catalog", label: "Импорт из AD" });
    return t;
  }, [canDirectory]);

  const deptOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((u) => u.department?.name).filter(Boolean) as string[]));
    return names.sort((a, b) => a.localeCompare(b, "ru"));
  }, [rows]);

  const shown = useMemo(() => (filterDept ? rows.filter((u) => u.department?.name === filterDept) : rows), [rows, filterDept]);
  const chipOn = (src: string, act: string) => filterSource === src && filterActive === act;

  return (
    <div className="page">
      <p className="page-cap">Учётные записи экосистемы · подключение к домену — <b>Настройки → Active Directory</b></p>

      {stats && tab === "list" && (
        <div className="stats">
          <div className="stat"><div className="stat-v">{stats.total}</div><div className="stat-l">всего сотрудников</div></div>
          <div className="stat"><div className="stat-v">{stats.active}</div><div className="stat-l">активных</div></div>
          <div className="stat"><div className="stat-v">{stats.ad}</div><div className="stat-l">из Active Directory</div></div>
          <div className="stat stat--danger"><div className="stat-v">{stats.total - stats.active}</div><div className="stat-l">заблокировано</div></div>
        </div>
      )}

      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={`tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
      )}

      {msg && <p className="note">{msg}</p>}

      {tab === "list" && (
        <>
          <div className="pagehead">
            <div className="searchbox">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void load()}
                placeholder="Поиск: ФИО, логин, почта, должность…"
                className="f-input"
              />
            </div>
            <div className="pagehead-actions">
              <button className="btn ghost btn-sm" type="button" disabled={busy} onClick={() => void syncAllAd()}>Синхр. все AD</button>
              <button className="btn gold btn-sm" type="button" onClick={() => setAddOpen((v) => !v)}>+ Добавить</button>
            </div>
          </div>

          <div className="chips">
            <button type="button" className={chipOn("", "") ? "chip on" : "chip"} onClick={() => { setFilterSource(""); setFilterActive(""); }}>
              Все<span className="c">{stats?.total ?? rows.length}</span>
            </button>
            <button type="button" className={chipOn("", "true") ? "chip on" : "chip"} onClick={() => { setFilterSource(""); setFilterActive("true"); }}>
              Активные<span className="c">{stats?.active ?? "—"}</span>
            </button>
            <button type="button" className={chipOn("ad", "") ? "chip on" : "chip"} onClick={() => { setFilterSource("ad"); setFilterActive(""); }}>
              Из AD<span className="c">{stats?.ad ?? "—"}</span>
            </button>
            <button type="button" className={chipOn("local", "") ? "chip on" : "chip"} onClick={() => { setFilterSource("local"); setFilterActive(""); }}>
              Локальные<span className="c">{stats?.local ?? "—"}</span>
            </button>
            <button type="button" className={chipOn("", "false") ? "chip on" : "chip"} onClick={() => { setFilterSource(""); setFilterActive("false"); }}>
              Заблокированы<span className="c">{stats ? stats.total - stats.active : "—"}</span>
            </button>
          </div>

          <div className="filters">
            <div className="fld"><label>Отдел</label>
              <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                <option value="">Все отделы</option>
                {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="fld"><label>Источник</label>
              <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
                <option value="">Все</option>
                <option value="ad">Active Directory</option>
                <option value="local">Локальные</option>
              </select>
            </div>
            <div className="fld"><label>Статус</label>
              <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)}>
                <option value="">Все</option>
                <option value="true">Активные</option>
                <option value="false">Заблокированы</option>
              </select>
            </div>
            {(filterDept || filterSource || filterActive || filterQ) && (
              <button type="button" className="f-reset" onClick={() => { setFilterDept(""); setFilterSource(""); setFilterActive(""); setFilterQ(""); }}>Сбросить ×</button>
            )}
          </div>

          {addOpen && (
            <div className="note" style={{ marginBottom: 14, padding: 16 }}>
              <form onSubmit={createLocal} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div className="field"><label>Логин</label><input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required /></div>
                <div className="field"><label>Пароль</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></div>
                <div className="field"><label>ФИО</label><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
                <div className="field"><label>Должность</label><input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
                <div className="field"><label>Почта</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="field"><label>Отдел</label>
                  <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                    <option value="">—</option>
                    {deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div><button className="btn gold btn-sm" type="submit">Добавить</button></div>
              </form>
            </div>
          )}

          <table className="reg">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Логин</th>
                <th>Отдел</th>
                <th>Источник</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className={!u.isActive ? "row-danger" : ""}>
                  <td>
                    <div className="name">{u.fullName}</div>
                    <div className="sub">{[u.position, u.email].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td>{u.login}</td>
                  <td>{u.department?.name || "—"}</td>
                  <td>
                    <span className={`src${u.source === "ad" ? " src--ad" : ""}`}>{u.source === "ad" ? "AD" : "локальный"}</span>
                    {u.isAdmin && <span className="src src--ad" style={{ marginLeft: 4 }}>admin</span>}
                  </td>
                  <td>
                    {!u.isActive
                      ? <span className="st st--danger">заблокирована</span>
                      : u.adAccountDisabled
                        ? <span className="st st--gold">отключена в AD</span>
                        : <span className="st st--ok">активен</span>}
                  </td>
                  <td>
                    <button className="linkish" type="button" onClick={() => setEdit(JSON.parse(JSON.stringify({ ...u, contractRoles: u.contractRoles || [], adGroups: u.adGroups || [] })))}>
                      править
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={6}>Итого — {shown.length} записей{stats ? ` · всего ${stats.total}` : ""}</td></tr>
            </tfoot>
          </table>
          <div className="regfoot">
            <span>Показано {shown.length} из {rows.length} учётных записей</span>
          </div>
        </>
      )}

      {tab === "catalog" && canDirectory && (
        <UsersAdCatalogPanel deps={deps} onImported={() => { void load(); setMsg("Импорт завершён"); setTab("list"); }} />
      )}

      {edit && <UserEditModal user={edit} deps={deps} onClose={() => setEdit(null)} onSaved={() => void load()} />}
    </div>
  );
}
