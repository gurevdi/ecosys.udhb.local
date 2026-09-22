import { FormEvent, useEffect, useState } from "react";
import { api, CONTRACT_ROLES, RESOURCES, type ContractRoleEntry } from "../../api";

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
  onClose: () => void;
  onSaved: () => void;
};

export function UserEditModal({ user, deps, onClose, onSaved }: Props) {
  const [edit, setEdit] = useState<UserRow>(JSON.parse(JSON.stringify(user)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/users/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isActive: edit.isActive,
          isAdmin: edit.isAdmin,
          departmentId: edit.departmentId,
          permissions: edit.permissions,
          contractRoles: edit.contractRoles,
        }),
      });
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
      await api(`/api/ad/sync/${edit.id}`, { method: "POST" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Синхронизация не удалась");
    } finally {
      setBusy(false);
    }
  }

  const groups = Array.isArray(edit.adGroups) ? edit.adGroups : [];

  return (
    <div className="users-modal-backdrop" onClick={onClose}>
      <form className="users-modal card" onSubmit={save} onClick={(e) => e.stopPropagation()}>
        <div className="users-modal-head">
          <div>
            <h2>{edit.fullName}</h2>
            <p className="muted">{edit.login} · {edit.source === "ad" ? "Active Directory" : "Локальная учётка"}</p>
          </div>
          <button type="button" className="btn ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="users-modal-grid">
          <label className="check">
            <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
            Активен в экосистеме
          </label>
          <label className="check">
            <input type="checkbox" checked={edit.isAdmin} onChange={(e) => setEdit({ ...edit, isAdmin: e.target.checked })} />
            Администратор
          </label>
        </div>

        {edit.source === "ad" && (
          <div className="users-ad-meta">
            {edit.adAccountDisabled && <span className="badge badge-danger">Отключён в AD</span>}
            {edit.adSyncedAt && <span className="muted">Синхронизация: {new Date(edit.adSyncedAt).toLocaleString("ru-RU")}</span>}
            {groups.length > 0 && (
              <div className="users-ad-groups">
                {groups.map((g) => (
                  <span key={g} className="badge badge-ad">{g}</span>
                ))}
              </div>
            )}
            <button type="button" className="btn ghost btn-sm" disabled={busy} onClick={() => void syncAd()}>
              Синхронизировать из AD
            </button>
          </div>
        )}

        <div className="field">
          <label>Отдел</label>
          <select value={edit.departmentId || ""} onChange={(e) => setEdit({ ...edit, departmentId: e.target.value || null })}>
            <option value="">—</option>
            {deps.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <h3>Права на сервисы</h3>
        <table className="users-perm-table">
          <thead>
            <tr><th>Сервис</th><th>Чтение</th><th>Запись</th></tr>
          </thead>
          <tbody>
            {RESOURCES.map((r) => {
              const p = edit.permissions.find((x) => x.resource === r.id) || { resource: r.id, canRead: false, canWrite: false };
              const set = (patch: Partial<typeof p>) => {
                const rest = edit.permissions.filter((x) => x.resource !== r.id);
                setEdit({ ...edit, permissions: [...rest, { ...p, ...patch }] });
              };
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td><input type="checkbox" checked={p.canRead || p.canWrite} onChange={(e) => set({ canRead: e.target.checked })} /></td>
                  <td><input type="checkbox" checked={p.canWrite} onChange={(e) => set({ canWrite: e.target.checked, canRead: e.target.checked || p.canRead })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3>Роли «Договоры»</h3>
        {(edit.contractRoles || []).map((cr, idx) => (
          <div key={idx} className="grid cols-2 users-role-row">
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
                  <option key={r.id} value={r.id}>{r.name}</option>
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
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <button type="button" className="btn ghost btn-sm" onClick={() => setEdit({ ...edit, contractRoles: edit.contractRoles.filter((_, i) => i !== idx) })}>Удалить</button>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost btn-sm"
          onClick={() => setEdit({ ...edit, contractRoles: [...(edit.contractRoles || []), { role: "operator", departmentId: edit.departmentId }] })}
        >
          + Добавить роль
        </button>

        <div className="row-actions users-modal-actions">
          <button className="btn" type="submit" disabled={busy}>{busy ? "Сохранение…" : "Сохранить"}</button>
          <button className="btn ghost" type="button" onClick={onClose}>Отмена</button>
        </div>
      </form>
    </div>
  );
}
