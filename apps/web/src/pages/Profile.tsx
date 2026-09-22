import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { initialNavWeights, NavWeightsEditor } from "../components/NavWeightsEditor";
import { SedIntegrationPanel } from "../components/sed/SedIntegrationPanel";
import type { Me } from "../App";

export default function Profile({
  me,
  onSaved,
  can,
}: {
  me: Me;
  onSaved: () => Promise<void>;
  can: (resource: string) => boolean;
}) {
  const [email, setEmail] = useState(me.user.email || "");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [password, setPassword] = useState("");
  const [navWeights, setNavWeights] = useState(() => initialNavWeights(me, can));
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setNavWeights(initialNavWeights(me, can));
  }, [me.user.id, me.user.navWeights]);

  async function saveProfile(e?: FormEvent) {
    e?.preventDefault();
    await api("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        email: email || null,
        notifyEmail,
        password: password || undefined,
        navWeights,
      }),
    });
    setPassword("");
    setMsg("Профиль сохранён");
    await onSaved();
  }

  return (
    <div className="page">
      <p className="page-cap">
        {me.user.fullName}
        {me.user.position ? ` · ${me.user.position}` : ""}
        {me.user.department ? ` · ${me.user.department.name}` : ""}
      </p>

      <section className="sec">
        <div className="sec-head">
          <h2 className="sec-title">Контакты и уведомления</h2>
        </div>
        <form onSubmit={saveProfile}>
          <div className="f-row">
            <div className="f-label">Почта для уведомлений</div>
            <input type="email" className="f-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="f-check">
            <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
            Дублировать уведомления на почту (когда SMTP будет настроен)
          </div>
          <div className="f-row">
            <div className="f-label">Новый пароль приложения</div>
            <input type="password" className="f-input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} />
          </div>
          {msg && <p className="note" style={{ marginTop: 8 }}>{msg}</p>}
          <button className="btn gold" type="submit" style={{ marginTop: 12 }}>Сохранить</button>
        </form>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="sec-title">Порядок меню</h2>
        </div>
        <NavWeightsEditor me={me} can={can} weights={navWeights} onChange={setNavWeights} />
        <button className="btn gold" type="button" onClick={() => saveProfile()} style={{ marginTop: 12 }}>Сохранить порядок меню</button>
      </section>

      <SedIntegrationPanel onReady={onSaved} />
    </div>
  );
}
