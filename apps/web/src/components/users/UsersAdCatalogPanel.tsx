import { FormEvent, useState } from "react";
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

export function UsersAdCatalogPanel({ deps, onImported }: { deps: Dept[]; onImported: () => void }) {
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const data = await api<{ people: Person[] }>(`/api/directory/search?q=${encodeURIComponent(q)}`);
      setPeople(data.people);
      setPicked({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Каталог недоступен");
    } finally {
      setBusy(false);
    }
  }

  async function imp() {
    const logins = Object.entries(picked).filter(([, v]) => v).map(([k]) => k);
    if (!logins.length) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ imported: number }>("/api/directory/import", {
        method: "POST",
        body: JSON.stringify({ logins, departmentId: departmentId || null }),
      });
      setMsg(`Импортировано: ${data.imported}`);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Импорт не удался");
    } finally {
      setBusy(false);
    }
  }

  const allChecked = people.length > 0 && people.every((p) => picked[p.login]);

  return (
    <div className="users-panel">
      <p className="lead">Поиск в Active Directory <strong>udhb.local</strong>. Импорт создаёт учётку с доменным входом и применяет маппинги групп.</p>
      <form className="toolbar users-toolbar" onSubmit={search}>
        <div className="field grow">
          <label>Поиск (логин, ФИО, почта)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ivanov" />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Поиск…" : "Найти"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {msg && <p className="users-msg">{msg}</p>}
      {people.length > 0 && (
        <>
          <div className="toolbar users-toolbar">
            <div className="field">
              <label>Отдел при импорте</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">— по умолчанию —</option>
                {deps.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <button className="btn" type="button" disabled={busy} onClick={() => void imp()}>
              Импортировать отмеченных ({Object.values(picked).filter(Boolean).length})
            </button>
          </div>
          <div>
            <table className="reg">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={(e) => {
                        const next: Record<string, boolean> = {};
                        if (e.target.checked) people.forEach((p) => { next[p.login] = true; });
                        setPicked(next);
                      }}
                    />
                  </th>
                  <th>Логин</th>
                  <th>ФИО</th>
                  <th>Должность</th>
                  <th>Группы AD</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.login}>
                    <td>
                      <input type="checkbox" checked={Boolean(picked[p.login])} onChange={(e) => setPicked({ ...picked, [p.login]: e.target.checked })} />
                    </td>
                    <td><code>{p.login}</code></td>
                    <td>{p.fullName}</td>
                    <td className="muted">{p.position || "—"}</td>
                    <td>
                      <div className="users-ad-groups compact">
                        {(p.groups || []).slice(0, 4).map((g) => (
                          <span key={g} className="badge badge-ad">{g}</span>
                        ))}
                        {(p.groups || []).length > 4 && <span className="muted">+{p.groups.length - 4}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
