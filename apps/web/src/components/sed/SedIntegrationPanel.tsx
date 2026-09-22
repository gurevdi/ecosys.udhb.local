import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "../../api";
import { SedCombo, type SedOption } from "./SedCombo";

export type SedIntegration = {
  groupId: string | null;
  groupName: string | null;
  userId: string | null;
  login: string | null;
  hasPassword: boolean;
  connectedAt: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
};

function fmtWhen(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ru-RU");
}

export function SedIntegrationPanel({ compact, onReady }: { compact?: boolean; onReady?: () => void }) {
  const [sedConfig, setSedConfig] = useState<{ baseUrl: string } | null>(null);
  const [sed, setSed] = useState<SedIntegration | null>(null);
  const [orgs, setOrgs] = useState<SedOption[]>([]);
  const [logins, setLogins] = useState<SedOption[]>([]);
  const [orgQuery, setOrgQuery] = useState("");
  const [loginQuery, setLoginQuery] = useState("");
  const [orgOpen, setOrgOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [userId, setUserId] = useState("");
  const [sedLogin, setSedLogin] = useState("");
  const [sedPassword, setSedPassword] = useState("");
  const [sedMsg, setSedMsg] = useState("");
  const [sedErr, setSedErr] = useState("");
  const [sedBusy, setSedBusy] = useState(false);

  useEffect(() => {
    api<{ baseUrl: string }>("/api/sed/config").then(setSedConfig).catch(() => null);
    api<SedIntegration>("/api/sed/integration")
      .then((row) => {
        setSed(row);
        if (row.groupId) setGroupId(row.groupId);
        if (row.groupName) setGroupName(row.groupName);
        if (row.userId) setUserId(row.userId);
        if (row.login) setSedLogin(row.login);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!orgOpen && !orgQuery) return;
    const t = setTimeout(() => {
      api<{ items: SedOption[] }>(`/api/sed/organizations?q=${encodeURIComponent(orgQuery)}`)
        .then((r) => setOrgs(r.items))
        .catch(() => setOrgs([]));
    }, 250);
    return () => clearTimeout(t);
  }, [orgQuery, orgOpen]);

  useEffect(() => {
    if (!groupId) {
      setLogins([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ items: SedOption[] }>(
        `/api/sed/logins?groupId=${encodeURIComponent(groupId)}&q=${encodeURIComponent(loginQuery)}`
      )
        .then((r) => setLogins(r.items))
        .catch(() => setLogins([]));
    }, 250);
    return () => clearTimeout(t);
  }, [groupId, loginQuery, loginOpen]);

  function clearOrg() {
    setGroupId("");
    setGroupName("");
    setOrgQuery("");
    setOrgOpen(false);
    setUserId("");
    setSedLogin("");
    setLoginQuery("");
    setLoginOpen(false);
    setLogins([]);
  }

  function clearLogin() {
    setUserId("");
    setSedLogin("");
    setLoginQuery("");
    setLoginOpen(false);
  }

  function pickOrg(item: SedOption) {
    setGroupId(item.id);
    setGroupName(item.label);
    setOrgQuery("");
    setOrgOpen(false);
    clearLogin();
  }

  function pickLogin(item: SedOption) {
    setUserId(item.id);
    setSedLogin(item.label);
    setLoginQuery("");
    setLoginOpen(false);
  }

  async function saveSed(e: FormEvent) {
    e.preventDefault();
    if (!groupId || !userId || !sedLogin) {
      setSedErr("Выберите организацию и пользователя из списка");
      return;
    }
    if (!sedPassword && !sed?.hasPassword) {
      setSedErr("Введите пароль СЭД");
      return;
    }
    setSedBusy(true);
    setSedErr("");
    setSedMsg("");
    try {
      const row = await api<SedIntegration>("/api/sed/integration", {
        method: "PUT",
        body: JSON.stringify({
          groupId,
          groupName,
          userId,
          login: sedLogin,
          password: sedPassword || undefined,
        }),
      });
      setSed(row);
      setSedPassword("");
      setSedMsg("Настройки СЭД сохранены");
    } catch (err) {
      setSedErr(formatApiError(err).message);
    } finally {
      setSedBusy(false);
    }
  }

  async function testSed() {
    if (!groupId || !userId || !sedLogin) {
      setSedErr("Выберите организацию и пользователя из списка");
      return;
    }
    if (!sedPassword && !sed?.hasPassword) {
      setSedErr("Введите пароль СЭД");
      return;
    }
    setSedBusy(true);
    setSedErr("");
    setSedMsg("");
    try {
      const result = await api<{ ok: boolean; message: string }>("/api/sed/integration/test", {
        method: "POST",
        body: JSON.stringify({
          groupId,
          groupName,
          userId,
          login: sedLogin,
          password: sedPassword || undefined,
        }),
      });
      setSedPassword("");
      setSedMsg(result.message);
      const row = await api<SedIntegration>("/api/sed/integration");
      setSed(row);
      if (result.ok) onReady?.();
    } catch (err) {
      setSedErr(formatApiError(err).message);
      const row = await api<SedIntegration>("/api/sed/integration").catch(() => null);
      if (row) setSed(row);
    } finally {
      setSedBusy(false);
    }
  }

  async function clearSed() {
    if (!confirm("Удалить сохранённые настройки СЭД?")) return;
    setSedBusy(true);
    try {
      await api("/api/sed/integration", { method: "DELETE" });
      setSed(null);
      clearOrg();
      setSedPassword("");
      setSedMsg("Настройки СЭД удалены");
      setSedErr("");
      onReady?.();
    } catch (err) {
      setSedErr(formatApiError(err).message);
    } finally {
      setSedBusy(false);
    }
  }

  const sedStatus =
    sed?.lastTestOk === true ? "ok" : sed?.lastTestOk === false ? "fail" : sed?.hasPassword ? "saved" : "none";

  const canSubmitSed = Boolean(groupId && userId && sedLogin && (sedPassword || sed?.hasPassword));

  return (
    <section className={`card sed-integration${compact ? " sed-integration--compact" : ""}`}>
      <div className="sed-integration-head">
        <div>
          <h2>{compact ? "Подключение к СЭД" : "Интеграция с СЭД"}</h2>
          <p className="muted">
            Личные учётные данные для{" "}
            <a href={sedConfig?.baseUrl || "http://sed.omskgov.ru"} target="_blank" rel="noreferrer">
              sed.omskgov.ru
            </a>
            . После успешной проверки подключения откроется раздел «СЭД» в меню.
          </p>
        </div>
        <span className={`sed-status sed-status--${sedStatus}`}>
          {sedStatus === "ok" && "Подключено"}
          {sedStatus === "fail" && "Ошибка входа"}
          {sedStatus === "saved" && "Сохранено"}
          {sedStatus === "none" && "Не настроено"}
        </span>
      </div>

      {sed?.lastTestAt && (
        <p className="sed-meta muted">
          Последняя проверка: {fmtWhen(sed.lastTestAt)}
          {sed.connectedAt && sed.lastTestOk ? ` · успешный вход ${fmtWhen(sed.connectedAt)}` : ""}
        </p>
      )}

      <form onSubmit={saveSed} className="sed-form">
        <SedCombo
          label="Организация"
          selectedId={groupId}
          selectedLabel={groupName}
          placeholder="Начните вводить: УДХБ, дорож…"
          items={orgs}
          open={orgOpen}
          onOpen={() => setOrgOpen(true)}
          onClose={() => setOrgOpen(false)}
          query={orgQuery}
          onQueryChange={setOrgQuery}
          onPick={pickOrg}
          onClear={clearOrg}
        />

        <SedCombo
          label="Пользователь СЭД"
          disabled={!groupId}
          selectedId={userId}
          selectedLabel={sedLogin}
          placeholder={groupId ? "Начните вводить фамилию…" : "Сначала выберите организацию"}
          items={logins}
          open={loginOpen && Boolean(groupId)}
          onOpen={() => groupId && setLoginOpen(true)}
          onClose={() => setLoginOpen(false)}
          query={loginQuery}
          onQueryChange={setLoginQuery}
          onPick={pickLogin}
          onClear={clearLogin}
        />

        <div className="field">
          <label>Пароль СЭД</label>
          <input
            type="password"
            value={sedPassword}
            onChange={(e) => setSedPassword(e.target.value)}
            placeholder={sed?.hasPassword ? "Оставьте пустым, чтобы не менять" : "Введите пароль СЭД"}
            autoComplete="new-password"
          />
        </div>

        <div className="row-actions">
          <button className="btn" type="submit" disabled={sedBusy || !canSubmitSed}>
            Сохранить
          </button>
          <button className="btn ghost" type="button" disabled={sedBusy || !canSubmitSed} onClick={testSed}>
            Проверить подключение
          </button>
          {sed?.hasPassword && (
            <button className="btn ghost danger-text" type="button" disabled={sedBusy} onClick={clearSed}>
              Отключить
            </button>
          )}
        </div>
        {sedMsg && <p className="form-msg ok">{sedMsg}</p>}
        {sedErr && <p className="form-msg err">{sedErr}</p>}
      </form>

      {sed?.lastTestOk && !compact && (
        <p className="sed-profile-hint">
          <Link to="/sed" className="btn btn-sm">
            Перейти в раздел СЭД
          </Link>
        </p>
      )}
    </section>
  );
}
