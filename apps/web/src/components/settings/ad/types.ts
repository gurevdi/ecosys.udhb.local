export type AdSettings = {
  domain: string;
  autoProvision: boolean;
  syncOnLogin: boolean;
  blockDisabledAccounts: boolean;
  applyGroupMappings: boolean;
  defaultDepartmentId: string | null;
  url: string;
  urlFailover: string;
  bindDn: string;
  base: string;
  hasPassword: boolean;
  passwordError: string | null;
  configured: boolean;
};

export type AdHealth = {
  ok: boolean;
  url: string | null;
  message: string;
  latencyMs: number;
};

export type AdStatus = {
  settings: AdSettings;
  health: AdHealth;
  lastTest: { at: string; ok: boolean; message: string; url: string | null; latencyMs: number } | null;
  stats: { adUsers: number; localUsers: number; mappings: number; disabledAd: number };
  checklist: { connection: boolean; password: boolean; tested: boolean; mappings: boolean };
};

export type GroupMapping = {
  id: string;
  adGroup: string;
  label: string;
  isAdmin: boolean;
  permissions: { resource: string; canRead: boolean; canWrite: boolean }[];
  contractRoles: { role: string; departmentId: string | null }[];
  sortOrder: number;
  isActive: boolean;
};

export type AdPerson = {
  login: string;
  fullName: string;
  email: string | null;
  position: string | null;
  groups: string[];
};

export type AdBootstrap = {
  status: AdStatus;
  mappings: GroupMapping[];
};

export type AdSection = "overview" | "connection" | "policies" | "groups" | "catalog";

export type Dept = { id: string; name: string };

export const DEFAULT_AD_SETTINGS: AdSettings = {
  domain: "udhb.local",
  autoProvision: false,
  syncOnLogin: true,
  blockDisabledAccounts: true,
  applyGroupMappings: true,
  defaultDepartmentId: null,
  url: "",
  urlFailover: "",
  bindDn: "",
  base: "",
  hasPassword: false,
  passwordError: null,
  configured: false,
};

export const AD_SECTIONS: { id: AdSection; label: string; icon: string }[] = [
  { id: "overview", label: "Обзор", icon: "◉" },
  { id: "connection", label: "Подключение", icon: "⎔" },
  { id: "policies", label: "Политики", icon: "⚙" },
  { id: "groups", label: "Группы", icon: "⧉" },
  { id: "catalog", label: "Каталог", icon: "⌕" },
];

export const AD_POLICIES = [
  { key: "autoProvision" as const, title: "Автоподключение (JIT)", desc: "Создавать учётку при первом успешном доменном входе." },
  { key: "syncOnLogin" as const, title: "Синхронизация при входе", desc: "Обновлять профиль и группы AD при каждом входе." },
  { key: "blockDisabledAccounts" as const, title: "Блокировка отключённых", desc: "Запрещать доступ, если учётка отключена в AD." },
  { key: "applyGroupMappings" as const, title: "Права из групп AD", desc: "Назначать права автоматически по маппингам." },
];

export function normalizeSettings(raw?: Partial<AdSettings> | null): AdSettings {
  return { ...DEFAULT_AD_SETTINGS, ...raw };
}

export function normalizeMapping(raw: GroupMapping): GroupMapping {
  return {
    ...raw,
    permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
    contractRoles: Array.isArray(raw.contractRoles) ? raw.contractRoles : [],
  };
}

export function fmtWhen(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ru-RU");
}
