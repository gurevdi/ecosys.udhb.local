import { useEffect, useState } from "react";
import { api } from "../api";

type Note = { id: string; title: string; body: string; createdAt: string; readAt: string | null };

export default function Notifications({ onChange }: { onChange: () => Promise<void> }) {
  const [rows, setRows] = useState<Note[]>([]);
  async function load() { setRows(await api<Note[]>("/api/notifications")); }
  useEffect(() => { load(); }, []);

  async function readAll() {
    await api("/api/notifications/read", { method: "POST", body: JSON.stringify({}) });
    await load();
    await onChange();
  }

  const unread = rows.filter((n) => !n.readAt).length;

  return (
    <div className="page">
      <p className="page-cap">
        Лента уведомлений · непрочитанных <b>{unread}</b>
      </p>
      <div className="pagehead">
        <div />
        <div className="pagehead-actions">
          <button className="btn gold btn-sm" onClick={readAll}>Отметить все прочитанными</button>
        </div>
      </div>
      <div className="note-feed">
        {rows.length === 0 && <div className="note">Нет уведомлений</div>}
        {rows.map((n) => (
          <div key={n.id} className={`note-item${n.readAt ? "" : " unread"}`}>
            <span className="dt">
              {new Date(n.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
            <i className="dot" />
            <div className="tx">
              <strong>{n.title}</strong>
              <p>{n.body}</p>
            </div>
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <div className="regfoot">
          <span>Показано {rows.length} уведомлений</span>
        </div>
      )}
    </div>
  );
}
