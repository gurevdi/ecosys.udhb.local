import { FormEvent, useEffect, useState } from "react";
import {
  api,
  CONTRACT_ROLES,
  RESOURCES,
  contractRoleLabel,
  type ContractRoleEntry,
} from "../../api";

export type UserRow = {
  id: string;
  login: string;
  fullName: string;
  email: string | null;
  position: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
  source: string;
  adGroups: string[] | null;
  adSyncedAt: string | null;
  adAccountDisabled: boolean;
  department: { id: string; name: string } | null;
  departmentId: string | null;
  permissions: { resource: string; canRead: boolean; canWrite: boolean }[];
  contractRoles: ContractRoleEntry[];
};

type Dept = { id: string; name: string };

type Props = {
  user: UserRow;
  deps: Dept[];
  /** id текущего пользователя — нельзя снять себе active/admin */
  selfId?: string;
  onClose: () => void;
  onSaved: () => void;
};

function cloneUser(u: UserRow): UserRow {
  return {
    ...u,
    permissions: (u.permissions || []).map((p) => ({ ...p })),
    contractRoles: (u.contractRoles || []).map((r) => ({ ...r })),
    adGroups: u.adGroups ? [...u.adGroups] : null,
    department: u.department ? { ...u.department } : null,
  };
}

export function UserEditModal({ user, deps, selfId, onClose, onSaved }: Props) {
  const [edit, setEdit] = useState<UserRow>(() => cloneUser(user));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<
    { id: string; action: string; summary: string; createdAt: string; actor: { fullName: string; login: string } }[]
  >([]);
  const isSelf = Boolean(selfId && selfId === edit.id);

  useEffect(() => {
    setEdit(cloneUser(user));
    setPassword("");
    setError("");
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    api<typeof logs>(`/api/users/${user.id}/access-log`)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        fullName: edit.fullName.trim(),
        email: edit.email?.trim() || null,
        position: edit.position?.trim() || null,
        isActive: edit.isActive,
        isAdmin: edit.isAdmin,
        departmentId: edit.departmentId,
        permissions: edit.permissions,
        contractRoles: edit.contractRoles,
      };
      if (edit.source === "local" && password.trim()) body.password = password.trim();
      await api(`/api/users/${edit.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  async function syncAd() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ user: UserRow }>(`/api/ad/sync/${edit.id}`, { method: "POST" });
      if (r.user) setEdit(cloneUser({ ...r.user, contractRoles: r.user.contractRoles || [], adGroups: r.user.adGroups || [] }));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Синхронизация не удалась");
    } finally {
      setBusy(false);
    }
  }

  function addPreset(role: string, scopeDept: boolean) {
    const departmentId = scopeDept ? edit.departmentId : null;
    const next = [...(edit.contractRoles || [])];
    if (next.some((r) => r.role === role && (r.departmentId || null) === (departmentId || null))) return;
    next.push({ role, departmentId });
    setEdit({ ...edit, contractRoles: next });
  }

  const groups = Array.isArray(edit.adGroups) ? edit.adGroups : [];

  return (
    <div className="users-modal-backdrop" onClick={onClose} role="presentation">
      <form className="users-modal card" onSubmit={save} onClick={(e) => e.stopPropagation()}>
        <div className="users-modal-head">
          <div>
            <h2>{edit.fullName || edit.login}</h2>
            <p className="muted">
              {edit.login} · {edit.source === "ad" ? "Active Directory" : "Локальная учётка"}
              {isSelf ? " · это вы" : ""}
            </p>
          </div>
          <button type="button" className="btn ghost btn-sm" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        <section className="users-modal-section">
          <h3 className="users-modal-section-title">Профиль</h3>
          <div className="users-modal-fields">
            <div className="field">
              <label>ФИО</label>
              <input
                value={edit.fullName}
                onChange={(e) => setEdit({ ...edit, fullName: e.target.value })}
                required
                disabled={edit.source === "ad"}
                title={edit.source === "ad" ? "ФИО обновляется из AD" : undefined}
              />
            </div>
            <div className="field">
              <label>Почта</label>
              <input
                type="email"
                value={edit.email || ""}
                onChange={(e) => setEdit({ ...edit, email: e.target.value || null })}
                disabled={edit.source === "ad"}
              />
            </div>
            <div className="field">
              <label>Должность</label>
              <input
                value={edit.position || ""}
                onChange={(e) => setEdit({ ...edit, position: e.target.value || null })}
                disabled={edit.source === "ad"}
              />
            </div>
            <div className="field">
              <label>Отдел</label>
              <select
                value={edit.departmentId || ""}
                onChange={(e) => setEdit({ ...edit, departmentId: e.target.value || null })}
              >
                <option value="">—</option>
                {deps.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {edit.source === "local" && (
              <div className="field">
                <label>Новый пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  placeholder="оставьте пустым, чтобы не менять"
                  autoComplete="new-password"
                />
              </div>
            )}
          </div>
        </section>

        {edit.source === "ad" && (
          <section className="users-modal-section">
            <h3 className="users-modal-section-title">Active Directory</h3>
            <div className="users-ad-meta">
              {edit.adAccountDisabled && <span className="badge badge-danger">Отключён в AD</span>}
              {edit.adSyncedAt && (
                <span className="muted">Синхронизация: {new Date(edit.adSyncedAt).toLocaleString("ru-RU")}</span>
              )}
              {groups.length > 0 && (
                <div className="users-ad-groups">
                  {groups.map((g) => (
                    <span key={g} className="badge badge-ad">
                      {g}
                    </span>
                  ))}
                </div>
              )}
              <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => void syncAd()}>
                Синхронизировать из AD
              </button>
            </div>
          </section>
        )}

        <section className="users-modal-section">
          <h3 className="users-modal-section-title">Доступ</h3>
          <p className="users-modal-hint">
            Администратор экосистемы имеет полный доступ ко всем сервисам, независимо от матрицы ниже.
          </p>
          <div className="users-modal-grid">
            <label className="check">
              <input
                type="checkbox"
                checked={edit.isActive}
                disabled={isSelf}
                onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })}
              />
              Активен в экосистеме
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={edit.isAdmin}
                disabled={isSelf}
                onChange={(e) => setEdit({ ...edit, isAdmin: e.target.checked })}
              />
              Администратор экосистемы
            </label>
          </div>
          {isSelf && (
            <p className="users-modal-hint">Нельзя заблокировать себя или снять с себя права администратора.</p>
          )}

          <h4 className="users-modal-subtitle">Права на сервисы</h4>
          <table className="users-perm-table">
            <thead>
              <tr>
                <th>Сервис</th>
                <th>Чтение</th>
                <th>Запись</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((r) => {
                const p = edit.permissions.find((x) => x.resource === r.id) || {
                  resource: r.id,
                  canRead: false,
                  canWrite: false,
                };
                const set = (patch: Partial<typeof p>) => {
                  const rest = edit.permissions.filter((x) => x.resource !== r.id);
                  setEdit({ ...edit, permissions: [...rest, { ...p, ...patch }] });
                };
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.canRead || p.canWrite}
                        onChange={(e) => set({ canRead: e.target.checked, canWrite: e.target.checked ? p.canWrite : false })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.canWrite}
                        onChange={(e) =>
                          set({ canWrite: e.target.checked, canRead: e.target.checked || p.canRead })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h4 className="users-modal-subtitle">Роли «Договоры»</h4>
          <div className="users-role-presets">
            <button type="button" className="btn ghost btn-sm" onClick={() => addPreset("operator", true)}>
              Оператор своего отдела
            </button>
            <button type="button" className="btn ghost btn-sm" onClick={() => addPreset("moderator", false)}>
              Модератор (все отделы)
            </button>
            <button type="button" className="btn ghost btn-sm" onClick={() => addPreset("auditor", false)}>
              Аудитор
            </button>
          </div>
          {(edit.contractRoles || []).map((cr, idx) => (
            <div key={`${cr.role}-${cr.departmentId}-${idx}`} className="grid cols-2 users-role-row">
              <div className="field">
                <label>Роль</label>
                <select
                  value={cr.role}
                  onChange={(e) => {
                    const next = [...edit.contractRoles];
                    next[idx] = { ...cr, role: e.target.value };
                    setEdit({ ...edit, contractRoles: next });
                  }}
                >
                  {CONTRACT_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Область</label>
                <div className="row-actions">
                  <select
                    value={cr.departmentId || ""}
                    onChange={(e) => {
                      const next = [...edit.contractRoles];
                      next[idx] = { ...cr, departmentId: e.target.value || null };
                      setEdit({ ...edit, contractRoles: next });
                    }}
                  >
                    <option value="">Все отделы</option>
                    {deps.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn ghost btn-sm"
                    onClick={() =>
                      setEdit({ ...edit, contractRoles: edit.contractRoles.filter((_, i) => i !== idx) })
                    }
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn ghost btn-sm"
            onClick={() =>
              setEdit({
                ...edit,
                contractRoles: [
                  ...(edit.contractRoles || []),
                  { role: "operator", departmentId: edit.departmentId },
                ],
              })
            }
          >
            + Добавить роль
          </button>
          {(edit.contractRoles || []).length > 0 && (
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Назначено:{" "}
              {edit.contractRoles.map((r) => contractRoleLabel(r.role)).join(", ")}
            </p>
          )}
        </section>

        <section className="users-modal-section">
          <h3 className="users-modal-section-title">История доступа</h3>
          {logs.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>
              Записей пока нет
            </p>
          ) : (
            <ul className="users-access-log">
              {logs.map((l) => (
                <li key={l.id}>
                  <div className="users-access-log-sum">{l.summary}</div>
                  <div className="users-access-log-meta">
                    {l.actor.fullName} ({l.actor.login}) ·{" "}
                    {new Date(l.createdAt).toLocaleString("ru-RU")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="row-actions users-modal-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
          <button className="btn ghost" type="button" onClick={onClose}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}
