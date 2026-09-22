import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { RESOURCES } from "../../../api";
import { useAdPanel } from "./useAdPanel";
import {
  AD_POLICIES,
  AD_SECTIONS,
  type AdPerson,
  type AdSection,
  type Dept,
  type GroupMapping,
  fmtWhen,
} from "./types";

function emptyMapping(): Omit<GroupMapping, "id"> {
  return {
    adGroup: "",
    label: "",
    isAdmin: false,
    permissions: RESOURCES.map((r) => ({
      resource: r.id,
      canRead: r.id === "contracts",
      canWrite: r.id === "contracts",
    })),
    contractRoles: [],
    sortOrder: 0,
    isActive: true,
  };
}

function SetupProgress({ done, total }: { done: number; total: number }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="adms-progress-wrap">
      <div className="adms-progress">
        <div className="adms-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <span className="adms-progress-label">{done} из {total} шагов</span>
    </div>
  );
}

export function AdSettingsPanel({ deps, canWrite }: { deps: Dept[]; canWrite: boolean }) {
  const panel = useAdPanel();
  const [section, setSection] = useState<AdSection>("overview");
  const [bindPassword, setBindPassword] = useState("");
  const [mappingEdit, setMappingEdit] = useState<(GroupMapping | Omit<GroupMapping, "id">) | null>(null);
  const [mappingIsNew, setMappingIsNew] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogRows, setCatalogRows] = useState<AdPerson[]>([]);
  const [catalogPicked, setCatalogPicked] = useState<Record<string, boolean>>({});
  const [importDept, setImportDept] = useState("");

  const settings = panel.settings;
  const status = panel.status;
  const stats = status?.stats ?? { adUsers: 0, localUsers: 0, mappings: 0, disabledAd: 0 };
  const checklist = status?.checklist ?? { connection: false, password: false, tested: false, mappings: false };
  const health = status?.health ?? { ok: false, url: null, message: "Статус недоступен", latencyMs: 0 };
  const setupDone = [checklist.connection, checklist.password, checklist.tested].filter(Boolean).length;

  if (panel.loading) {
    return (
      <div className="adms">
        <div className="adms-skeleton">
          <div className="adms-skeleton-line adms-skeleton-line--lg" />
          <div className="adms-skeleton-line" />
          <div className="adms-skeleton-grid">
            <div className="adms-skeleton-card" />
            <div className="adms-skeleton-card" />
            <div className="adms-skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  if (panel.loadError && !status) {
    return (
      <div className="adms">
        <div className="adms-empty">
          <div className="adms-empty-icon">⚠</div>
          <h3>Не удалось загрузить интеграцию AD</h3>
          <p>{panel.loadError}</p>
          <button type="button" className="btn" onClick={() => { panel.setLoading(true); void panel.load(); }}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  async function saveConnection(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    await panel.saveSettings({ ...settings, bindPassword: bindPassword || undefined }, { testAfter: true });
    setBindPassword("");
  }

  async function savePolicies() {
    if (!canWrite) return;
    await panel.saveSettings({
      autoProvision: settings.autoProvision,
      syncOnLogin: settings.syncOnLogin,
      blockDisabledAccounts: settings.blockDisabledAccounts,
      applyGroupMappings: settings.applyGroupMappings,
      defaultDepartmentId: settings.defaultDepartmentId,
    });
  }

  async function saveMapping(e: FormEvent) {
    e.preventDefault();
    if (!mappingEdit || !canWrite) return;
    await panel.saveMapping(mappingEdit, mappingIsNew);
    setMappingEdit(null);
  }

  async function searchCatalog(e?: FormEvent) {
    e?.preventDefault();
    const rows = await panel.searchCatalog(catalogQ);
    setCatalogRows(rows);
    setCatalogPicked({});
  }

  function applyUdhbPreset() {
    panel.setSettings({
      ...settings,
      domain: "udhb.local",
      base: "DC=udhb,DC=local",
      url: "ldap://10.37.1.230",
      urlFailover: "ldap://10.37.1.231",
      bindDn: "ecosys@udhb.local",
    });
  }

  return (
    <div className="adms">
      {/* Status header */}
      <div className="adms-top">
        <div className="adms-top-main">
          <div className="adms-top-icon" aria-hidden>AD</div>
          <div>
            <h2 className="adms-title">Active Directory</h2>
            <p className="adms-subtitle">
              Домен <strong>{settings.domain || "не задан"}</strong>
              {health.url && <span className="adms-subtitle-sep">· DC {health.url.replace("ldap://", "")}</span>}
            </p>
          </div>
        </div>
        <div className="adms-top-actions">
          <span className={`adms-badge ${health.ok ? "adms-badge--ok" : "adms-badge--bad"}`}>
            {health.ok ? "Подключено" : "Не подключено"}
          </span>
          {status?.lastTest && (
            <span className="adms-meta">Проверка: {fmtWhen(status.lastTest.at)}</span>
          )}
          <button type="button" className="btn btn-sm" disabled={panel.busy} onClick={() => void panel.runTest()}>
            {panel.busy ? "Проверка…" : "Проверить LDAP"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {(panel.error || panel.msg || panel.loadError || settings.passwordError || !canWrite) && (
        <div className="adms-alerts">
          {panel.error && <div className="adms-alert adms-alert--error">{panel.error}</div>}
          {settings.passwordError && <div className="adms-alert adms-alert--error">{settings.passwordError}</div>}
          {panel.loadError && <div className="adms-alert adms-alert--warn">{panel.loadError}</div>}
          {panel.msg && <div className="adms-alert adms-alert--ok">{panel.msg}</div>}
          {!canWrite && (
            <div className="adms-alert adms-alert--info">Режим просмотра. Для изменений нужны права записи в «Настройки».</div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="adms-nav" role="tablist" aria-label="Разделы Active Directory">
        {AD_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`adms-nav-btn ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <span className="adms-nav-icon" aria-hidden>{s.icon}</span>
            {s.label}
          </button>
        ))}
      </nav>

      {/* Content panel — always rendered */}
      <div className="adms-body" role="tabpanel">
        {section === "overview" && (
          <>
            <div className="adms-kpi-row">
              <div className="adms-kpi">
                <span className="adms-kpi-label">Пользователи AD</span>
                <strong>{stats.adUsers}</strong>
              </div>
              <div className="adms-kpi">
                <span className="adms-kpi-label">Локальные</span>
                <strong>{stats.localUsers}</strong>
              </div>
              <div className="adms-kpi">
                <span className="adms-kpi-label">Маппинги</span>
                <strong>{stats.mappings}</strong>
              </div>
              <div className="adms-kpi adms-kpi--warn">
                <span className="adms-kpi-label">Отключены в AD</span>
                <strong>{stats.disabledAd}</strong>
              </div>
            </div>

            <div className="adms-card">
              <div className="adms-card-head">
                <h3>Настройка интеграции</h3>
                <SetupProgress done={setupDone} total={3} />
              </div>
              <ul className="adms-steps">
                <li className={checklist.connection ? "done" : ""}>
                  <span className="adms-step-num">1</span>
                  <div>
                    <strong>Параметры LDAP</strong>
                    <p>URL контроллера домена, base DN и service-bind</p>
                    {!checklist.connection && canWrite && (
                      <button type="button" className="btn ghost btn-sm" onClick={() => setSection("connection")}>Настроить →</button>
                    )}
                  </div>
                </li>
                <li className={checklist.password ? "done" : ""}>
                  <span className="adms-step-num">2</span>
                  <div>
                    <strong>Пароль service-bind</strong>
                    <p>Учётная запись для чтения каталога (не ваш личный вход)</p>
                  </div>
                </li>
                <li className={checklist.tested ? "done" : ""}>
                  <span className="adms-step-num">3</span>
                  <div>
                    <strong>Проверка подключения</strong>
                    <p>{health.message}</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="adms-card">
              <h3>Быстрые действия</h3>
              <div className="adms-actions">
                <button type="button" className="btn" disabled={panel.busy} onClick={() => void panel.runTest()}>Проверить подключение</button>
                <button type="button" className="btn ghost" disabled={panel.busy} onClick={() => void panel.syncAll()}>Синхронизировать всех</button>
                <Link className="btn ghost" to="/users?tab=catalog">Каталог пользователей →</Link>
              </div>
            </div>
          </>
        )}

        {section === "connection" && (
          <form className="adms-form" onSubmit={saveConnection}>
            <div className="adms-form-intro">
              <h3>Подключение к контроллеру домена</h3>
              <p className="muted">
                Service-bind используется для чтения каталога и проверки паролей. Ошибка <strong>52e</strong> означает неверный логин или пароль service-bind.
              </p>
              {canWrite && (
                <button type="button" className="btn ghost btn-sm" onClick={applyUdhbPreset}>Шаблон УДХБ</button>
              )}
            </div>

            <div className="adms-dc-grid">
              <label className="adms-field-block">
                <span className="adms-field-tag">Основной DC</span>
                <input disabled={!canWrite} value={settings.url} onChange={(e) => panel.setSettings({ ...settings, url: e.target.value })} placeholder="ldap://10.37.1.230" required />
              </label>
              <label className="adms-field-block">
                <span className="adms-field-tag">Резервный DC</span>
                <input disabled={!canWrite} value={settings.urlFailover} onChange={(e) => panel.setSettings({ ...settings, urlFailover: e.target.value })} placeholder="ldap://10.37.1.231" />
              </label>
            </div>

            <div className="adms-field-grid">
              <div className="field">
                <label>Домен (UPN)</label>
                <input disabled={!canWrite} value={settings.domain} onChange={(e) => panel.setSettings({ ...settings, domain: e.target.value })} placeholder="udhb.local" required />
                <span className="field-hint">Вход: login@{settings.domain || "domain.local"}</span>
              </div>
              <div className="field">
                <label>Base DN</label>
                <input disabled={!canWrite} value={settings.base} onChange={(e) => panel.setSettings({ ...settings, base: e.target.value })} placeholder="DC=udhb,DC=local" required />
              </div>
              <div className="field">
                <label>Service bind</label>
                <input disabled={!canWrite} value={settings.bindDn} onChange={(e) => panel.setSettings({ ...settings, bindDn: e.target.value })} placeholder="ecosys@udhb.local" required />
                <span className="field-hint">UPN или UDHB\ecosys</span>
              </div>
              <div className="field">
                <label>Пароль service-bind</label>
                <input
                  disabled={!canWrite}
                  type="password"
                  value={bindPassword}
                  onChange={(e) => setBindPassword(e.target.value)}
                  placeholder={settings.hasPassword ? "•••••••• (пусто = не менять)" : "Введите пароль"}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="adms-form-footer">
              {canWrite && <button className="btn" type="submit" disabled={panel.busy}>Сохранить и проверить</button>}
              <button type="button" className="btn ghost" disabled={panel.busy} onClick={() => void panel.runTest()}>Только проверить</button>
            </div>
          </form>
        )}

        {section === "policies" && (
          <div className="adms-policies">
            <h3>Политики входа и синхронизации</h3>
            <div className="adms-toggle-grid">
              {AD_POLICIES.map((p) => (
                <label key={p.key} className={`adms-toggle ${settings[p.key] ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    checked={settings[p.key]}
                    onChange={(e) => panel.setSettings({ ...settings, [p.key]: e.target.checked })}
                  />
                  <span className="adms-toggle-ui" />
                  <span className="adms-toggle-text">
                    <strong>{p.title}</strong>
                    <small>{p.desc}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="adms-card adms-card--flat">
              <div className="field">
                <label>Отдел по умолчанию для новых AD-пользователей</label>
                <select disabled={!canWrite} value={settings.defaultDepartmentId || ""} onChange={(e) => panel.setSettings({ ...settings, defaultDepartmentId: e.target.value || null })}>
                  <option value="">— не назначать —</option>
                  {deps.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              {canWrite && (
                <button type="button" className="btn" disabled={panel.busy} onClick={() => void savePolicies()}>Сохранить политики</button>
              )}
            </div>
          </div>
        )}

        {section === "groups" && (
          <div className="adms-groups">
            <div className="adms-form-intro">
              <div>
                <h3>Маппинг групп AD</h3>
                <p className="muted">CN группы из Active Directory → права в экосистеме. Пример: <code>UDHB-Ecosys-Operators</code></p>
              </div>
              {canWrite && (
                <button type="button" className="btn ghost btn-sm" onClick={() => { setMappingEdit(emptyMapping()); setMappingIsNew(true); }}>
                  + Добавить
                </button>
              )}
            </div>

            {panel.mappings.length === 0 ? (
              <div className="adms-empty adms-empty--inline">
                <p>Маппинги не настроены. Права назначаются вручную в разделе «Пользователи».</p>
              </div>
            ) : (
              <div className="adms-table-wrap">
                <table className="adms-table">
                  <thead>
                    <tr>
                      <th>Группа AD</th>
                      <th>Название</th>
                      <th>Права</th>
                      <th>Статус</th>
                      {canWrite && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {panel.mappings.map((m) => (
                      <tr key={m.id} className={m.isActive ? "" : "muted"}>
                        <td><code>{m.adGroup}</code></td>
                        <td>{m.label}{m.isAdmin && <span className="adms-tag adms-tag--admin">admin</span>}</td>
                        <td className="adms-table-perms">
                          {(m.permissions || []).filter((x) => x.canRead || x.canWrite).map((x) => RESOURCES.find((r) => r.id === x.resource)?.name || x.resource).join(", ") || "—"}
                        </td>
                        <td>{m.isActive ? "Активен" : "Выключен"}</td>
                        {canWrite && (
                          <td className="adms-table-actions">
                            <button type="button" className="btn ghost btn-sm" onClick={() => { setMappingEdit({ ...m }); setMappingIsNew(false); }}>Изменить</button>
                            <button type="button" className="btn ghost btn-sm" onClick={() => void panel.toggleMapping(m.id, !m.isActive)}>{m.isActive ? "Выкл" : "Вкл"}</button>
                            <button type="button" className="btn ghost btn-sm" onClick={() => void panel.deleteMapping(m.id)}>×</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {mappingEdit && canWrite && (
              <form className="adms-card adms-mapping-form" onSubmit={saveMapping}>
                <h4>{mappingIsNew ? "Новый маппинг" : "Редактирование"}</h4>
                <div className="adms-field-grid">
                  <div className="field">
                    <label>CN группы AD</label>
                    <input value={mappingEdit.adGroup} onChange={(e) => setMappingEdit({ ...mappingEdit, adGroup: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label>Название</label>
                    <input value={mappingEdit.label} onChange={(e) => setMappingEdit({ ...mappingEdit, label: e.target.value })} required />
                  </div>
                </div>
                <label className="check">
                  <input type="checkbox" checked={mappingEdit.isAdmin} onChange={(e) => setMappingEdit({ ...mappingEdit, isAdmin: e.target.checked })} />
                  Администратор экосистемы
                </label>
                <p className="adms-perm-label">Права на сервисы</p>
                <div className="adms-perm-grid">
                  {RESOURCES.map((r) => {
                    const perms = mappingEdit.permissions || [];
                    const p = perms.find((x) => x.resource === r.id) || { resource: r.id, canRead: false, canWrite: false };
                    return (
                      <label key={r.id} className="check">
                        <input
                          type="checkbox"
                          checked={p.canWrite}
                          onChange={(e) => {
                            const next = perms.map((x) =>
                              x.resource === r.id ? { ...x, canWrite: e.target.checked, canRead: e.target.checked || x.canRead } : x
                            );
                            if (!next.find((x) => x.resource === r.id)) {
                              next.push({ resource: r.id, canRead: e.target.checked, canWrite: e.target.checked });
                            }
                            setMappingEdit({ ...mappingEdit, permissions: next });
                          }}
                        />
                        {r.name}
                      </label>
                    );
                  })}
                </div>
                <div className="adms-form-footer">
                  <button className="btn" type="submit" disabled={panel.busy}>Сохранить</button>
                  <button className="btn ghost" type="button" onClick={() => setMappingEdit(null)}>Отмена</button>
                </div>
              </form>
            )}
          </div>
        )}

        {section === "catalog" && (
          <div className="adms-catalog">
            <h3>Каталог Active Directory</h3>
            <p className="muted">Поиск сотрудников в AD и импорт в экосистему. Требуется рабочий service-bind.</p>
            <form className="adms-search" onSubmit={searchCatalog}>
              <input value={catalogQ} onChange={(e) => setCatalogQ(e.target.value)} placeholder="ФИО, логин или e-mail" />
              <button className="btn" type="submit" disabled={panel.busy}>Найти</button>
            </form>

            {catalogRows.length > 0 && (
              <>
                <div className="adms-catalog-bar">
                  <div className="field">
                    <label>Отдел при импорте</label>
                    <select value={importDept} onChange={(e) => setImportDept(e.target.value)}>
                      <option value="">— по умолчанию —</option>
                      {deps.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      className="btn"
                      disabled={panel.busy || !Object.values(catalogPicked).some(Boolean)}
                      onClick={() => void panel.importLogins(
                        Object.entries(catalogPicked).filter(([, v]) => v).map(([k]) => k),
                        importDept || settings.defaultDepartmentId
                      )}
                    >
                      Импортировать ({Object.values(catalogPicked).filter(Boolean).length})
                    </button>
                  )}
                </div>
                <div className="adms-table-wrap">
                  <table className="adms-table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Логин</th>
                        <th>ФИО</th>
                        <th>Должность</th>
                        <th>Группы</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalogRows.map((p) => (
                        <tr key={p.login}>
                          <td>
                            <input type="checkbox" checked={Boolean(catalogPicked[p.login])} disabled={!canWrite} onChange={(e) => setCatalogPicked({ ...catalogPicked, [p.login]: e.target.checked })} />
                          </td>
                          <td><code>{p.login}</code></td>
                          <td>{p.fullName}</td>
                          <td className="muted">{p.position || "—"}</td>
                          <td className="muted">{(p.groups || []).slice(0, 2).join(", ")}{(p.groups || []).length > 2 ? "…" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {catalogRows.length === 0 && catalogQ && !panel.busy && (
              <div className="adms-empty adms-empty--inline"><p>Ничего не найдено. Проверьте подключение LDAP.</p></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
