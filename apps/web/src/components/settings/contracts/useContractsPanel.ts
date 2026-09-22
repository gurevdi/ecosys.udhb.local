import { useCallback, useEffect, useState } from "react";
import { api, type ContractAccess } from "../../../api";
import type { Brief, ContractRoleRow, Dept, FolderNode } from "./types";

export function useContractsPanel(enabled: boolean) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [access, setAccess] = useState<ContractAccess | null>(null);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [roles, setRoles] = useState<ContractRoleRow[]>([]);
  const [rolesDenied, setRolesDenied] = useState(false);
  const [deps, setDeps] = useState<Dept[]>([]);
  const [people, setPeople] = useState<Brief[]>([]);
  const [viewMode, setViewMode] = useState("folders");
  const [flash, setFlash] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [accessData, folders, settings, departments, list] = await Promise.all([
        api<ContractAccess>("/api/contracts/access"),
        api<{ tree: FolderNode[] }>("/api/contracts/folders"),
        api<Record<string, string>>("/api/settings"),
        api<Dept[]>("/api/departments"),
        api<Brief[]>("/api/users/brief"),
      ]);
      setAccess(accessData);
      setFolderTree(folders.tree);
      setViewMode(settings.contracts_view_mode || "folders");
      setDeps(departments);
      setPeople(list);

      if (accessData.canManageRoles) {
        try {
          const roleRows = await api<ContractRoleRow[]>("/api/contracts/roles");
          setRoles(roleRows);
          setRolesDenied(false);
        } catch {
          setRoles([]);
          setRolesDenied(true);
        }
      } else {
        setRoles([]);
        setRolesDenied(false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Не удалось загрузить настройки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 4000);
  }

  return {
    loading,
    loadError,
    access,
    folderTree,
    roles,
    rolesDenied,
    deps,
    people,
    viewMode,
    setViewMode,
    flash,
    notify,
    reload,
  };
}
