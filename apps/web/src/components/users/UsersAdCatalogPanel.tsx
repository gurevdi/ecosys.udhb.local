import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";

type Person = {
  login: string;
  fullName: string;
  email: string | null;
  position: string | null;
  phone: string | null;
  groups: string[];
  disabled: boolean;
};
type Dept = { id: string; name: string };
type ResultFilter = "all" | "new" | "existing" | "disabled";

type Props = {
  deps: Dept[];
  onImported: (imported: number) => void;
};

const MIN_Q = 2;
const DEBOUNCE_MS = 350;

export function UsersAdCatalogPanel({ deps, onImported }: Props) {
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [existingLogins, setExistingLogins] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [departmentId, setDepartmentId] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [typingWait, setTypingWait] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  function isExisting(login: string) {
    return existingLogins.has(login.toLowerCase());
  }

  function canPick(p: Person) {
    if (isExisting(p.login)) return false;
    if (p.disabled && !includeDisabled) return false;
    return true;
  }

  const counts = useMemo(() => {
    let neu = 0;
    let existing = 0;
    let disabled = 0;
    for (const p of people) {
      if (isExisting(p.login)) existing++;
      else neu++;
      if (p.disabled) disabled++;
    }
    return { total: people.length, neu, existing, disabled };
  }, [people, existingLogins]);

  const visible = useMemo(() => {
    return people.filter((p) => {
      const exists = isExisting(p.login);
      if (resultFilter === "new") return !exists;
      if (resultFilter === "existing") return exists;
      if (resultFilter === "disabled") return p.disabled;
      return true;
    });
  }, [people, resultFilter, existingLogins]);

  const pickable = visible.filter(canPick);
  const pickedCount = Object.values(picked).filter(Boolean).length;
  const allChecked = pickable.length > 0 && pickable.every((p) => picked[p.login]);

  async function runSearch(query: string, signal?: AbortSignal) {
    setError("");
    setMsg("");
    setBusy(true);
    setSearched(true);
    try {
      const data = await api<{ people: Person[]; existingLogins?: string[] }>(
        `/api/directory/search?q=${encodeURIComponent(query)}`,
        { signal }
      );
      if (signal?.aborted) return;
      setPeople(data.people);
      setExistingLogins(new Set((data.existingLogins || []).map((l) => l.toLowerCase())));
      setPicked({});
      setExpanded(null);
      setResultFilter("all");
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      if (err instanceof Error && err.name === "AbortError") return;
      setPeople([]);
      setError(err instanceof Error ? err.message : "Каталог недоступен");
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  // Живой поиск с debounce + отмена устаревших запросов
  useEffect(() => {
    const query = q.trim();
    abortRef.current?.abort();
    abortRef.current = null;

    if (query.length < MIN_Q) {
      setTypingWait(false);
      setBusy(false);
      setPeople([]);
      setExistingLogins(new Set());
      setPicked({});
      setSearched(false);
      setError(query.length === 0 ? "" : `Введите ещё ${MIN_Q - query.length}…`);
      return;
    }

    setTypingWait(true);
    const t = window.setTimeout(() => {
      setTypingWait(false);
      const ac = new AbortController();
      abortRef.current = ac;
      void runSearch(query, ac.signal);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [q]);

  function searchNow(e?: FormEvent) {
    e?.preventDefault();
    const query = q.trim();
    if (query.length < MIN_Q) {
      setError(`Введите не менее ${MIN_Q} символов`);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setTypingWait(false);
    void runSearch(query, ac.signal);
  }

  function clearSearch() {
    abortRef.current?.abort();
    setQ("");
    setPeople([]);
    setSearched(false);
    setPicked({});
    setError("");
    setMsg("");
    setBusy(false);
    setTypingWait(false);
  }

  function togglePick(login: string, person: Person) {
    if (!canPick(person)) return;
    setPicked((prev) => {
      const next = { ...prev };
      if (next[login]) delete next[login];
      else next[login] = true;
      return next;
    });
  }

  function selectAllNew() {
    const next: Record<string, boolean> = {};
    for (const p of people) {
      if (canPick(p)) next[p.login] = true;
    }
    setPicked(next);
  }

  async function imp() {
    const logins = Object.entries(picked)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!logins.length) return;
    const disabledPicked = people.filter((p) => logins.includes(p.login) && p.disabled);
    if (
      disabledPicked.length &&
      !window.confirm(
        `Среди выбранных ${disabledPicked.length} учётных записей, отключённых в AD. Всё равно импортировать?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const data = await api<{ imported: number }>("/api/directory/import", {
        method: "POST",
        body: JSON.stringify({ logins, departmentId: departmentId || null }),
      });
      const imported = data.imported ?? 0;
      setMsg(`Импортировано: ${imported}`);
      // пометить импортированных как уже в системе, снять выбор
      setExistingLogins((prev) => {
        const next = new Set(prev);
        for (const l of logins) next.add(l.toLowerCase());
        return next;
      });
      setPicked({});
      onImported(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Импорт не удался");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="users-panel adcat">
      <div className="adcat-hero">
        <div>
          <p className="adcat-kicker">Active Directory · udhb.local</p>
          <h2 className="adcat-title">Импорт сотрудников</h2>
          <p className="adcat-lead">
            Найдите учётки в каталоге домена и добавьте их в экосистему. При импорте применяются маппинги групп AD →
            права и роли.
          </p>
        </div>
        <Link className="btn ghost btn-sm" to="/settings">
          Настройки AD →
        </Link>
      </div>

      <form className="adcat-search" onSubmit={searchNow}>
        <div className="searchbox grow">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Начните вводить логин, ФИО или почту…"
            className="f-input"
            autoFocus
            aria-busy={busy || typingWait}
          />
          {q && (
            <button type="button" className="adcat-clear" aria-label="Очистить" onClick={clearSearch}>
              ×
            </button>
          )}
        </div>
        <span className="adcat-live-hint" aria-live="polite">
          {typingWait ? "ожидание…" : busy ? "поиск…" : q.trim().length >= MIN_Q ? "live" : ""}
        </span>
      </form>

      {deps.length === 0 && <p className="note">Справочник отделов загружается…</p>}
      {error && <p className="error">{error}</p>}
      {msg && <p className="users-msg">{msg}</p>}

      {!searched && !busy && !typingWait && (
        <div className="adcat-empty">
          <div className="adcat-empty-icon">AD</div>
          <h3>Живой поиск</h3>
          <p>Результаты появятся сразу, как только введёте не меньше двух символов.</p>
        </div>
      )}

      {searched && !busy && !typingWait && people.length === 0 && !error && (
        <div className="adcat-empty">
          <h3>Ничего не найдено</h3>
          <p>По запросу «{q.trim()}» в каталоге AD нет совпадений. Уточните написание.</p>
        </div>
      )}

      {people.length > 0 && (
        <>
          <div className="adcat-summary">
            <div className="chips">
              <button
                type="button"
                className={resultFilter === "all" ? "chip on" : "chip"}
                onClick={() => setResultFilter("all")}
              >
                Все<span className="c">{counts.total}</span>
              </button>
              <button
                type="button"
                className={resultFilter === "new" ? "chip on" : "chip"}
                onClick={() => setResultFilter("new")}
              >
                Новые<span className="c">{counts.neu}</span>
              </button>
              <button
                type="button"
                className={resultFilter === "existing" ? "chip on" : "chip"}
                onClick={() => setResultFilter("existing")}
              >
                Уже в системе<span className="c">{counts.existing}</span>
              </button>
              {counts.disabled > 0 && (
                <button
                  type="button"
                  className={resultFilter === "disabled" ? "chip on" : "chip"}
                  onClick={() => setResultFilter("disabled")}
                >
                  Откл. в AD<span className="c">{counts.disabled}</span>
                </button>
              )}
            </div>
            <div className="adcat-summary-actions">
              <button type="button" className="btn ghost btn-sm" disabled={!counts.neu} onClick={selectAllNew}>
                Выбрать всех новых
              </button>
              {pickedCount > 0 && (
                <button type="button" className="linkish" onClick={() => setPicked({})}>
                  Снять выбор
                </button>
              )}
            </div>
          </div>

          <div className="users-bulk-bar adcat-import-bar">
            <span className="users-bulk-count">К импорту: {pickedCount}</span>
            <div className="fld" style={{ margin: 0, minWidth: 180 }}>
              <label>Отдел</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">— по умолчанию из AD —</option>
                {deps.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="check" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={includeDisabled}
                onChange={(e) => {
                  setIncludeDisabled(e.target.checked);
                  if (!e.target.checked) {
                    setPicked((prev) => {
                      const next = { ...prev };
                      for (const p of people) {
                        if (p.disabled) delete next[p.login];
                      }
                      return next;
                    });
                  }
                }}
              />
              Разрешить отключённых в AD
            </label>
            <button className="btn gold btn-sm" type="button" disabled={busy || !pickedCount} onClick={() => void imp()}>
              {busy ? "Импорт…" : `Импортировать (${pickedCount})`}
            </button>
          </div>

          <div className="users-table-wrap">
            <table className="users-table adcat-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const next = { ...picked };
                          pickable.forEach((p) => {
                            next[p.login] = true;
                          });
                          setPicked(next);
                        } else {
                          const next = { ...picked };
                          visible.forEach((p) => {
                            delete next[p.login];
                          });
                          setPicked(next);
                        }
                      }}
                      aria-label="Выбрать видимых"
                    />
                  </th>
                  <th>Сотрудник</th>
                  <th>Логин</th>
                  <th>Статус</th>
                  <th>Группы</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const exists = isExisting(p.login);
                  const pickOk = canPick(p);
                  const open = expanded === p.login;
                  return (
                    <tr
                      key={p.login}
                      className={[
                        !pickOk ? "inactive" : "",
                        picked[p.login] ? "adcat-row--picked" : "",
                        pickOk ? "users-row-click" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => pickOk && togglePick(p.login, p)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={Boolean(picked[p.login])}
                          disabled={!pickOk}
                          onChange={() => togglePick(p.login, p)}
                          aria-label={`Выбрать ${p.login}`}
                        />
                      </td>
                      <td>
                        <div className="name">{p.fullName}</div>
                        <div className="sub">
                          {[p.position, p.email, p.phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td>
                        <code className="adcat-login">{p.login}</code>
                      </td>
                      <td>
                        <div className="users-access-badges">
                          {exists && <span className="badge badge-ok">уже в системе</span>}
                          {p.disabled && <span className="badge badge-danger">откл. в AD</span>}
                          {!exists && !p.disabled && <span className="badge badge-local">новый</span>}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="users-ad-groups compact">
                          {(p.groups || []).slice(0, open ? undefined : 3).map((g) => (
                            <span key={g} className="badge badge-ad">
                              {g}
                            </span>
                          ))}
                          {(p.groups || []).length > 3 && (
                            <button
                              type="button"
                              className="linkish"
                              onClick={() => setExpanded(open ? null : p.login)}
                            >
                              {open ? "свернуть" : `+${p.groups.length - 3}`}
                            </button>
                          )}
                          {(p.groups || []).length === 0 && <span className="muted">—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && (
            <p className="note">В этом фильтре нет строк. Переключите чип выше.</p>
          )}
          <div className="regfoot">
            <span>
              Показано {visible.length} из {people.length} · новых {counts.neu} · уже в системе {counts.existing}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
