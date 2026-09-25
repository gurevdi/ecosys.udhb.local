import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../api";
import type { Me } from "../App";
import { DEFAULT_BRAND_APP_NAME, DEFAULT_BRAND_ORG_NAME, resolveBrandOrgName } from "../lib/brand";
import { buildNavItems, type NavItemDef } from "../lib/nav";
import { subsystemLabel, SUBSYSTEM_CONTRACTS, SUBSYSTEM_SED } from "../lib/subsystems";
import { Logo } from "./Logo";

type Props = {
  me: Me;
  can: (resource: string) => boolean;
  onLogout: () => void;
  children: ReactNode;
};

type Note = { id: string; title: string; body: string; createdAt: string; readAt: string | null };

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const SUBSYSTEM_COUNT = 4;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function fmtNoteTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AppShell({ me, can, onLogout, children }: Props) {
  const location = useLocation();
  const [brandOrgName, setBrandOrgName] = useState(DEFAULT_BRAND_ORG_NAME);
  const [notes, setNotes] = useState<Note[]>([]);
  const items = buildNavItems(me, can);
  const mainItems = items.filter((i) => i.section === "main");
  const subsystems = mainItems.slice(0, SUBSYSTEM_COUNT);
  const serviceItems = mainItems.slice(SUBSYSTEM_COUNT);

  const pageTitle =
    items.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))?.label ??
    "Экосистема УДХБ";

  const topbarKicker =
    location.pathname === "/"
      ? "Обзор системы"
      : location.pathname.startsWith("/procurements")
        ? subsystemLabel(SUBSYSTEM_CONTRACTS)
        : location.pathname.startsWith("/sed")
          ? subsystemLabel(SUBSYSTEM_SED)
          : location.pathname.startsWith("/users")
            ? "Служба"
            : location.pathname.startsWith("/settings")
              ? "Служба"
              : location.pathname.startsWith("/notifications")
                ? "Кабинет"
                : location.pathname.startsWith("/profile")
                  ? "Кабинет"
                  : "Экосистема УДХБ";

  useEffect(() => {
    api<Record<string, string>>("/api/settings")
      .then((s) => setBrandOrgName(resolveBrandOrgName(s)))
      .catch(() => setBrandOrgName(DEFAULT_BRAND_ORG_NAME));
  }, [location.pathname]);

  useEffect(() => {
    api<Note[]>("/api/notifications")
      .then((rows) => setNotes(rows.slice(0, 3)))
      .catch(() => setNotes([]));
  }, [location.pathname]);

  return (
    <div className="shell">
      <aside className="side">
        <NavLink to="/" end className="brand" aria-label={`${DEFAULT_BRAND_APP_NAME} ${brandOrgName}`}>
          <span className="brand-mark" aria-hidden>
            <Logo markOnly />
          </span>
          <span className="brand-text">
            <span className="brand-org">{brandOrgName}</span>
            <span className="brand-app">{DEFAULT_BRAND_APP_NAME}</span>
          </span>
        </NavLink>

        <nav className="side-nav">
          <div className="side-label">Подсистемы</div>
          {subsystems.map((item, i) => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `side-link${isActive ? " side-link--active" : ""}`}
            >
              <span className="n">{ROMAN[i]}.</span>
              {item.label}
            </NavLink>
          ))}
          {serviceItems.length > 0 && (
            <>
              <div className="side-label">Служба</div>
              {serviceItems.map((item, i) => (
                <NavLink
                  key={item.id}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `side-link${isActive ? " side-link--active" : ""}`}
                >
                  <span className="n">{ROMAN[subsystems.length + i]}.</span>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="side-foot">
          <NavLink to="/profile" className="sf-user">
            <span className="avatar">{initials(me.user.fullName)}</span>
            <span className="sf-tx">
              <b>{me.user.fullName}</b>
              <span>{me.user.department?.name ?? "Исполнитель"}</span>
            </span>
          </NavLink>
          <button type="button" className="sf-out" onClick={onLogout} title="Выйти" aria-label="Выйти">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="dochead">
          <div className="dochead-main">
            <p className="dochead-kicker">{topbarKicker}</p>
            <h1 className="dochead-title">{pageTitle}</h1>
          </div>
          <div className="dochead-meta">
            <span className="meta-env" title="Контур доступа">
              Внутренний контур
            </span>
            <span className="bell">
              <NavLink
                to="/notifications"
                className="bell-btn"
                aria-label={me.unread > 0 ? `Уведомления, ${me.unread} новых` : "Уведомления"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {me.unread > 0 && <span className="bell-badge">{me.unread}</span>}
              </NavLink>
              <div className="bell-drop">
                <div className="bell-drop-panel">
                  <div className="bell-h">
                    <span>Уведомления{me.unread > 0 ? ` · ${me.unread} новых` : ""}</span>
                    <NavLink to="/notifications">все</NavLink>
                  </div>
                  {notes.length === 0 && <div className="bell-item">Новых уведомлений нет</div>}
                  {notes.map((n) => (
                    <NavLink
                      key={n.id}
                      to="/notifications"
                      className={`bell-item${!n.readAt ? " bell-item--new" : ""}`}
                    >
                      {n.title}: {n.body.length > 60 ? `${n.body.slice(0, 57)}…` : n.body}
                      <span className="t">{fmtNoteTime(n.createdAt)}</span>
                    </NavLink>
                  ))}
                  <NavLink to="/notifications" className="bell-foot">
                    Все уведомления
                  </NavLink>
                </div>
              </div>
            </span>
            <NavLink to="/profile" className="meta-user" title="Профиль">
              <span className="avatar">{initials(me.user.fullName)}</span>
              <span className="meta-user-tx">
                <b>{me.user.fullName}</b>
                <span>{me.user.login}</span>
              </span>
            </NavLink>
          </div>
        </header>
        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
