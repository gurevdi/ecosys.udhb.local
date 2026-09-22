import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../../../api";
import {
  type AdBootstrap,
  type AdHealth,
  type AdPerson,
  type AdSettings,
  type AdStatus,
  type GroupMapping,
  normalizeMapping,
  normalizeSettings,
} from "./types";

export function useAdPanel() {
  const [status, setStatus] = useState<AdStatus | null>(null);
  const [mappings, setMappings] = useState<GroupMapping[]>([]);
  const [settings, setSettings] = useState<AdSettings>(normalizeSettings());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const clearAlerts = useCallback(() => {
    setMsg("");
    setError("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      let data: AdBootstrap;
      try {
        data = await api<AdBootstrap>("/api/ad/bootstrap");
      } catch {
        const [status, mappings] = await Promise.all([
          api<AdStatus>("/api/ad/status"),
          api<GroupMapping[]>("/api/ad/group-mappings").catch(() => [] as GroupMapping[]),
        ]);
        data = { status, mappings: mappings || [] };
      }
      setStatus(data.status);
      setSettings(normalizeSettings(data.status?.settings));
      setMappings((data.mappings || []).map(normalizeMapping));
    } catch (err) {
      setLoadError(formatApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runTest(): Promise<AdHealth | null> {
    setBusy(true);
    clearAlerts();
    try {
      const r = await api<{ ok: boolean; health: AdHealth }>("/api/ad/test", { method: "POST" });
      if (r.ok) {
        setMsg(`Подключение успешно · ${r.health.latencyMs} ms${r.health.url ? ` · ${r.health.url}` : ""}`);
      } else {
        setError(r.health.message);
      }
      await load();
      return r.health;
    } catch (err) {
      setError(formatApiError(err).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(patch: Partial<AdSettings & { bindPassword?: string }>, opts?: { testAfter?: boolean }) {
    setBusy(true);
    clearAlerts();
    try {
      await api("/api/ad/settings", { method: "PUT", body: JSON.stringify(patch) });
      await load();
      if (opts?.testAfter) {
        const r = await api<{ ok: boolean; health: AdHealth }>("/api/ad/test", { method: "POST" });
        if (r.ok) {
          setMsg(`Сохранено и проверено · ${r.health.latencyMs} ms${r.health.url ? ` · ${r.health.url}` : ""}`);
        } else {
          setMsg("Параметры сохранены");
          setError(r.health.message);
        }
        await load();
      } else {
        setMsg("Настройки сохранены");
      }
    } catch (err) {
      setError(formatApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setBusy(true);
    clearAlerts();
    try {
      const r = await api<{ synced: number; failed: number; total: number }>("/api/ad/sync-all", { method: "POST" });
      setMsg(`Синхронизировано ${r.synced} из ${r.total}${r.failed ? `, ошибок: ${r.failed}` : ""}`);
      await load();
    } catch (err) {
      setError(formatApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function searchCatalog(q: string): Promise<AdPerson[]> {
    setBusy(true);
    clearAlerts();
    try {
      const data = await api<{ people: AdPerson[] }>(`/api/ad/preview?q=${encodeURIComponent(q)}`);
      return data.people || [];
    } catch (err) {
      setError(formatApiError(err).message);
      return [];
    } finally {
      setBusy(false);
    }
  }

  async function importLogins(logins: string[], departmentId: string | null) {
    if (!logins.length) return;
    setBusy(true);
    clearAlerts();
    try {
      const r = await api<{ imported: number }>("/api/ad/import", {
        method: "POST",
        body: JSON.stringify({ logins, departmentId }),
      });
      setMsg(`Импортировано: ${r.imported}`);
      await load();
    } catch (err) {
      setError(formatApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMapping(body: Omit<GroupMapping, "id"> | GroupMapping, isNew: boolean) {
    setBusy(true);
    clearAlerts();
    try {
      if (isNew) {
        await api("/api/ad/group-mappings", { method: "POST", body: JSON.stringify(body) });
        setMsg("Маппинг добавлен");
      } else {
        const m = body as GroupMapping;
        await api(`/api/ad/group-mappings/${m.id}`, { method: "PATCH", body: JSON.stringify(body) });
        setMsg("Маппинг обновлён");
      }
      await load();
    } catch (err) {
      setError(formatApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMapping(id: string, isActive: boolean) {
    setBusy(true);
    try {
      await api(`/api/ad/group-mappings/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      await load();
    } catch (err) {
      setError(formatApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMapping(id: string) {
    if (!confirm("Удалить маппинг?")) return;
    setBusy(true);
    try {
      await api(`/api/ad/group-mappings/${id}`, { method: "DELETE" });
      setMsg("Маппинг удалён");
      await load();
    } catch (err) {
      setError(formatApiError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return {
    status,
    mappings,
    settings,
    setSettings,
    loading,
    loadError,
    busy,
    msg,
    error,
    load,
    runTest,
    saveSettings,
    syncAll,
    searchCatalog,
    importLogins,
    saveMapping,
    toggleMapping,
    deleteMapping,
    setLoading,
  };
}
