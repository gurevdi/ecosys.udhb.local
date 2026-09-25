import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { AppShell } from "./components/AppShell";
import { debugError, debugLog, isDebug } from "./debug";
import Login from "./pages/Login";
import Cabinet from "./pages/Cabinet";
import Procurements from "./pages/Procurements";
import Procurement from "./pages/Procurement";
import Users from "./pages/Users";
import Directory from "./pages/Directory";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Notifications from "./pages/Notifications";
import Sed from "./pages/Sed";
import Calendar from "./pages/Calendar";

/** Данные текущего пользователя из /api/auth/me */
export type Me = {
  user: {
    id: string;
    login: string;
    fullName: string;
    isAdmin: boolean;
    email: string | null;
    position: string | null;
    department: { id: string; name: string } | null;
    permissions: { resource: string; canRead: boolean; canWrite: boolean }[];
    contractRoles: { role: string; departmentId: string | null }[];
    sedReady: boolean;
    sedGroupName: string | null;
    sedLogin: string | null;
    navWeights: Record<string, number> | null;
  };
  unread: number;
};

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    try {
      debugLog("app", "загрузка сессии");
      const data = await api<Me>("/api/auth/me");
      setMe(data);
    } catch (err) {
      debugError("app", "сессия не найдена или истекла", err);
      setMe(null);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!ready) return null;
  if (!me) {
    return <Login onOk={refresh} />;
  }

  const can = (resource: string) =>
    me.user.isAdmin || me.user.permissions.some((p) => p.resource === resource && (p.canRead || p.canWrite));

  const canWrite = (resource: string) =>
    me.user.isAdmin || me.user.permissions.some((p) => p.resource === resource && p.canWrite);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <>
      {isDebug && (
        <div className="debug-banner" title="Режим отладки включён">
          DEBUG
        </div>
      )}
      <AppShell me={me} can={can} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Cabinet />} />
          <Route path="/procurements" element={<Procurements />} />
          <Route path="/procurements/:id" element={<Procurement />} />
          <Route path="/users" element={<Users canDirectory={can("directory")} selfId={me.user.id} />} />
          <Route path="/directory" element={<Directory />} />
          <Route path="/settings" element={<Settings me={me.user} canWrite={canWrite("settings")} />} />
          <Route path="/profile" element={<Profile me={me} onSaved={refresh} can={can} />} />
          <Route path="/sed" element={<Sed />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/notifications" element={<Notifications onChange={refresh} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </>
  );
}
