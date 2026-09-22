import { FormEvent, useState } from "react";
import { api, formatApiError } from "../api";
import { debugLog } from "../debug";
import { Logo } from "../components/Logo";

/** Страница входа — логин и пароль (локальный или доменный) */
export default function Login({ onOk }: { onOk: () => Promise<void> }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [debugDetail, setDebugDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDebugDetail(null);
    try {
      debugLog("login", `попытка входа: ${login}`);
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ login, password }) });
      await onOk();
    } catch (err) {
      const { message, detail } = formatApiError(err);
      setError(message);
      setDebugDetail(detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <Logo dark className="login-logo" />
        <p className="login-sub">
          Вход доменной учёткой <strong>udhb.local</strong> или локальным паролем.
        </p>
        {error && <p className="error">{error}</p>}
        {debugDetail && <pre className="debug-detail">{debugDetail}</pre>}
        <div className="field">
          <label>Логин</label>
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
        </div>
        <div className="field">
          <label>Пароль</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <button className="btn gold" disabled={busy} type="submit">
          {busy ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
