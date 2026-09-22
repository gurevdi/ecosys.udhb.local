import { FormEvent, useMemo, useState } from "react";
import {
  api,
  canManageContractRoles,
  canManageFolders,
  CONTRACT_ROLES,
  contractRoleLabel,
  type ContractAccess,
} from "../../../api";
import type { Me } from "../../../App";
import { useContractsPanel } from "./useContractsPanel";
import {
  CONTRACTS_SECTIONS,
  ROLE_MATRIX,
  type ContractsSection,
  type Dept,
  type FolderNode,
} from "./types";

function countFolders(nodes: FolderNode[]): number {
  return nodes.reduce((n, f) => n + 1 + countFolders(f.children), 0);
}

function countProcurements(nodes: FolderNode[]): number {
  return nodes.reduce((n, f) => n + f.procurementCount, 0);
}

function flatFolders(nodes: FolderNode[], prefix = ""): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: prefix + n.name });
    out.push(...flatFolders(n.children, prefix + "— "));
  }
  return out;
}

function FolderTreeView({
  nodes,
  depth,
  canEdit,
  editingId,
  editName,
  onEditStart,
  onEditName,
  onEditSave,
  onEditCancel,
  onRemove,
}: {
  nodes: FolderNode[];
  depth: number;
  canEdit: boolean;
  editingId: string;
  editName: string;
  onEditStart: (id: string, name: string) => void;
  onEditName: (name: string) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>
          <div className="ctr-folder-row" style={{ paddingLeft: depth * 18 + 10 }}>
            {editingId === n.id ? (
              <div className="ctr-folder-edit">
                <input value={editName} onChange={(e) => onEditName(e.target.value)} autoFocus />
                <button type="button" className="btn btn-sm" onClick={() => onEditSave(n.id)}>
                  OK
                </button>
                <button type="button" className="btn ghost btn-sm" onClick={onEditCancel}>
                  Отмена
                </button>
              </div>
            ) : (
              <>
                <div className="ctr-folder-main">
                  <span className="ctr-folder-name">{n.name}</span>
                  {n.year && <span className="ctr-folder-tag">{n.year}</span>}
                  {n.department && <span className="ctr-folder-tag">{n.department.name}</span>}
                  <span className="ctr-folder-count" title="Закупок в папке и вложенных">
                    {n.procurementCount}
                  </span>
                </div>
                {canEdit && (
                  <div className="ctr-folder-actions">
                    <button type="button" className="btn ghost btn-sm" onClick={() => onEditStart(n.id, n.name)}>
                      Изм.
                    </button>
                    {n.childCount === 0 && n.procurementCount === 0 && (
                      <button type="button" className="btn ghost btn-sm" onClick={() => onRemove(n.id)}>
                        ×
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {n.children.length > 0 && (
            <FolderTreeView
              nodes={n.children}
              depth={depth + 1}
              canEdit={canEdit}
              editingId={editingId}
              editName={editName}
              onEditStart={onEditStart}
              onEditName={onEditName}
              onEditSave={onEditSave}
              onEditCancel={onEditCancel}
              onRemove={onRemove}
            />
          )}
        </div>
      ))}
    </>
  );
}

function AccessBadges({ access }: { access: ContractAccess }) {
  const items = [
    access.canRead && "Просмотр",
    access.canWrite && "Изменение",
    access.canDelete && "Удаление",
    access.canManageFolders && "Папки",
    access.canManageRoles && "Роли",
  ].filter((x): x is string => Boolean(x));
  if (!items.length) return <span className="ctr-badge ctr-badge--bad">Нет доступа</span>;
  return (
    <>
      {items.map((x) => (
        <span key={x} className="ctr-badge ctr-badge--ok">
          {x}
        </span>
      ))}
    </>
  );
}

export function ContractsSettingsPanel({
  me,
  canWriteSettings,
  enabled,
}: {
  me: Me["user"];
  canWriteSettings: boolean;
  enabled: boolean;
}) {
  const panel = useContractsPanel(enabled);
  const [section, setSection] = useState<ContractsSection>("overview");
  const [folderForm, setFolderForm] = useState({
    name: "",
    parentId: "",
    year: "",
    departmentId: "",
    sortOrder: "0",
  });
  const [roleForm, setRoleForm] = useState({ userId: "", role: "operator", departmentId: "" });
  const [editingFolderId, setEditingFolderId] = useState("");
  const [editingFolderName, setEditingFolderName] = useState("");
  const [busy, setBusy] = useState(false);

  const canFolders = canManageFolders(me) || canWriteSettings;
  const canRoles = canManageContractRoles(me) || canWriteSettings;
  const canDisplay = canWriteSettings;
  const folderOptions = useMemo(() => flatFolders(panel.folderTree), [panel.folderTree]);
  const stats = useMemo(
    () => ({
      folders: countFolders(panel.folderTree),
      procurements: countProcurements(panel.folderTree),
      roles: panel.roles.length,
    }),
    [panel.folderTree, panel.roles.length]
  );

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function addFolder(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("/api/contracts/folders", {
        method: "POST",
        body: JSON.stringify({
          name: folderForm.name,
          parentId: folderForm.parentId || null,
          year: folderForm.year ? Number(folderForm.year) : null,
          departmentId: folderForm.departmentId || null,
          sortOrder: Number(folderForm.sortOrder) || 0,
        }),
      });
      setFolderForm({ name: "", parentId: folderForm.parentId, year: "", departmentId: "", sortOrder: "0" });
      await panel.reload();
      panel.notify("Папка создана");
    });
  }

  async function saveFolderEdit(id: string) {
    if (!editingFolderName.trim()) return;
    await run(async () => {
      await api(`/api/contracts/folders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingFolderName.trim() }),
      });
      setEditingFolderId("");
      await panel.reload();
      panel.notify("Папка обновлена");
    });
  }

  async function removeFolder(id: string) {
    if (!confirm("Удалить папку?")) return;
    await run(async () => {
      await api(`/api/contracts/folders/${id}`, { method: "DELETE" });
      await panel.reload();
      panel.notify("Папка удалена");
    });
  }

  async function addRole(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("/api/contracts/roles", {
        method: "POST",
        body: JSON.stringify({
          userId: roleForm.userId,
          role: roleForm.role,
          departmentId: roleForm.departmentId || null,
        }),
      });
      setRoleForm({ userId: "", role: "operator", departmentId: "" });
      await panel.reload();
      panel.notify("Роль назначена");
    });
  }

  async function removeRole(id: string) {
    if (!confirm("Снять роль с сотрудника?")) return;
    await run(async () => {
      await api(`/api/contracts/roles/${id}`, { method: "DELETE" });
      await panel.reload();
      panel.notify("Роль снята");
    });
  }

  async function saveViewMode(e: FormEvent) {
    e.preventDefault();
    if (!canDisplay) return;
    await run(async () => {
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ contracts_view_mode: panel.viewMode }),
      });
      panel.notify("Режим отображения сохранён");
    });
  }

  if (panel.loading) {
    return (
      <div className="ctr">
        <div className="ctr-skeleton">
          <div className="ctr-skeleton-line ctr-skeleton-line--lg" />
          <div className="ctr-skeleton-line" />
          <div className="ctr-skeleton-grid">
            <div className="ctr-skeleton-card" />
            <div className="ctr-skeleton-card" />
            <div className="ctr-skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  if (panel.loadError && !panel.access) {
    return (
      <div className="ctr">
        <div className="ctr-empty">
          <p>{panel.loadError}</p>
          <button type="button" className="btn" onClick={() => panel.reload()}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  const access = panel.access!;

  return (
    <div className="ctr">
      <header className="ctr-top">
        <div className="ctr-top-main">
          <div className="ctr-top-icon" aria-hidden>
            ▤
          </div>
          <div>
            <h2 className="ctr-title">Подсистема «Договоры»</h2>
            <p className="ctr-subtitle">
              Папки, роли и права доступа
              {access.scopedDepartments && (
                <span className="ctr-subtitle-sep"> · область: {access.scopedDepartments.length} отдел(ов)</span>
              )}
            </p>
          </div>
        </div>
        <div className="ctr-top-actions">
          <AccessBadges access={access} />
          <button type="button" className="btn ghost" disabled={busy} onClick={() => panel.reload()}>
            Обновить
          </button>
        </div>
      </header>

      {panel.flash && (
        <div className="ctr-alerts">
          <div className="ctr-alert ctr-alert--ok">{panel.flash}</div>
        </div>
      )}
      {panel.rolesDenied && (
        <div className="ctr-alerts">
          <div className="ctr-alert ctr-alert--warn">Список назначенных ролей недоступен — недостаточно прав.</div>
        </div>
      )}

      <nav className="ctr-nav">
        {CONTRACTS_SECTIONS.map((s) => {
          const disabled =
            (s.id === "folders" && !canFolders) ||
            (s.id === "roles" && !canRoles) ||
            (s.id === "display" && !canDisplay);
          return (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? "ctr-nav-btn active" : "ctr-nav-btn"}
              disabled={disabled}
              title={disabled ? "Недостаточно прав" : undefined}
              onClick={() => setSection(s.id)}
            >
              <span className="ctr-nav-icon">{s.icon}</span>
              {s.label}
            </button>
          );
        })}
      </nav>

      <div className="ctr-body">
        {section === "overview" && (
          <>
            <div className="ctr-kpi-row">
              <div className="ctr-kpi">
                <span className="ctr-kpi-label">Папок</span>
                <strong>{stats.folders}</strong>
              </div>
              <div className="ctr-kpi">
                <span className="ctr-kpi-label">Закупок в дереве</span>
                <strong>{stats.procurements}</strong>
              </div>
              <div className="ctr-kpi">
                <span className="ctr-kpi-label">Назначений ролей</span>
                <strong>{canRoles ? stats.roles : "—"}</strong>
              </div>
            </div>

            <div className="ctr-card">
              <h3>Матрица прав по ролям</h3>
              <p className="muted">Область действия роли может быть ограничена отделом или распространяться на все отделы.</p>
              <div className="ctr-table-wrap">
                <table className="ctr-table">
                  <thead>
                    <tr>
                      <th>Действие</th>
                      {CONTRACT_ROLES.map((r) => (
                        <th key={r.id}>
                          {r.id === "admin"
                            ? "Админ"
                            : r.id === "moderator"
                              ? "Модер."
                              : r.id === "operator"
                                ? "Опер."
                                : "Аудит."}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROLE_MATRIX.map((row) => (
                      <tr key={row.key}>
                        <td>{row.label}</td>
                        <td>{row.admin ? "✓" : "—"}</td>
                        <td>{row.moderator ? "✓" : "—"}</td>
                        <td>{row.operator ? "✓" : "—"}</td>
                        <td>{row.auditor ? "✓" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {access.roles.length > 0 && (
              <div className="ctr-card ctr-card--flat">
                <h3>Ваши роли в подсистеме</h3>
                <ul className="ctr-role-list">
                  {access.roles.map((r, i) => (
                    <li key={`${r.role}-${r.departmentId}-${i}`}>
                      <strong>{contractRoleLabel(r.role)}</strong>
                      <span className="muted">
                        {r.departmentId
                          ? ` · ${panel.deps.find((d) => d.id === r.departmentId)?.name || "отдел"}`
                          : " · все отделы"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {section === "folders" && canFolders && (
          <div className="ctr-grid">
            <div className="ctr-card">
              <h3>Новая папка</h3>
              <p className="muted">Сначала папка года, затем вложенные папки по отделам.</p>
              <form onSubmit={addFolder} className="ctr-form">
                <div className="field">
                  <label>Название</label>
                  <input
                    value={folderForm.name}
                    onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                    required
                    disabled={busy}
                  />
                </div>
                <div className="field">
                  <label>Родитель</label>
                  <select
                    value={folderForm.parentId}
                    onChange={(e) => setFolderForm({ ...folderForm, parentId: e.target.value })}
                    disabled={busy}
                  >
                    <option value="">— корень —</option>
                    {folderOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ctr-field-grid">
                  <div className="field">
                    <label>Год</label>
                    <input
                      type="number"
                      value={folderForm.year}
                      onChange={(e) => setFolderForm({ ...folderForm, year: e.target.value })}
                      disabled={busy}
                    />
                  </div>
                  <div className="field">
                    <label>Отдел</label>
                    <select
                      value={folderForm.departmentId}
                      onChange={(e) => setFolderForm({ ...folderForm, departmentId: e.target.value })}
                      disabled={busy}
                    >
                      <option value="">— любой —</option>
                      {panel.deps.map((d: Dept) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button className="btn" type="submit" disabled={busy}>
                  Добавить
                </button>
              </form>
            </div>
            <div className="ctr-card">
              <h3>Дерево папок</h3>
              {panel.folderTree.length === 0 ? (
                <p className="muted">Папок пока нет</p>
              ) : (
                <div className="ctr-folder-tree">
                  <FolderTreeView
                    nodes={panel.folderTree}
                    depth={0}
                    canEdit={canFolders}
                    editingId={editingFolderId}
                    editName={editingFolderName}
                    onEditStart={(id, name) => {
                      setEditingFolderId(id);
                      setEditingFolderName(name);
                    }}
                    onEditName={setEditingFolderName}
                    onEditSave={saveFolderEdit}
                    onEditCancel={() => setEditingFolderId("")}
                    onRemove={removeFolder}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {section === "roles" && canRoles && (
          <div className="ctr-grid">
            <div className="ctr-card">
              <h3>Назначить роль</h3>
              <form onSubmit={addRole} className="ctr-form">
                <div className="field">
                  <label>Сотрудник</label>
                  <select
                    value={roleForm.userId}
                    onChange={(e) => setRoleForm({ ...roleForm, userId: e.target.value })}
                    required
                    disabled={busy}
                  >
                    <option value="">— выберите —</option>
                    {panel.people.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Роль</label>
                  <select
                    value={roleForm.role}
                    onChange={(e) => setRoleForm({ ...roleForm, role: e.target.value })}
                    disabled={busy}
                  >
                    {CONTRACT_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Область (отдел)</label>
                  <select
                    value={roleForm.departmentId}
                    onChange={(e) => setRoleForm({ ...roleForm, departmentId: e.target.value })}
                    disabled={busy}
                  >
                    <option value="">Все отделы</option>
                    {panel.deps.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn" type="submit" disabled={busy}>
                  Назначить
                </button>
              </form>
            </div>
            <div className="ctr-card">
              <h3>Назначенные роли</h3>
              <div className="ctr-table-wrap">
                <table className="ctr-table">
                  <thead>
                    <tr>
                      <th>Сотрудник</th>
                      <th>Роль</th>
                      <th>Область</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {panel.roles.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          Роли не назначены
                        </td>
                      </tr>
                    ) : (
                      panel.roles.map((r) => (
                        <tr key={r.id}>
                          <td>
                            {r.user.fullName}
                            <div className="muted" style={{ fontSize: 12 }}>
                              {r.user.login}
                            </div>
                          </td>
                          <td>
                            <span className={`ctr-tag ctr-tag--${r.role}`}>{contractRoleLabel(r.role)}</span>
                          </td>
                          <td>{r.department?.name || "Все отделы"}</td>
                          <td className="ctr-table-actions">
                            <button
                              type="button"
                              className="btn ghost btn-sm"
                              disabled={busy}
                              onClick={() => removeRole(r.id)}
                            >
                              Снять
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {section === "display" && canDisplay && (
          <div className="ctr-card">
            <h3>Режим списка закупок</h3>
            <p className="muted">Как отображать реестр на странице «Договоры».</p>
            <form onSubmit={saveViewMode} className="ctr-form">
              <div className="field">
                <label>Представление</label>
                <select value={panel.viewMode} onChange={(e) => panel.setViewMode(e.target.value)} disabled={busy}>
                  <option value="folders">Дерево папок (год → отдел)</option>
                  <option value="flat">Плоский список</option>
                </select>
              </div>
              <button className="btn" type="submit" disabled={busy}>
                Сохранить
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
