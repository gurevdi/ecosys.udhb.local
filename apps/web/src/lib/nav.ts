import { canManageContractRoles, canManageFolders, canReadContracts } from "../api";
import type { Me } from "../App";

export type NavItemId =
  | "cabinet"
  | "procurements"
  | "users"
  | "directory"
  | "settings"
  | "sed"
  | "calendar"
  | "notifications"
  | "profile";

export type NavItemDef = {
  id: NavItemId;
  label: string;
  to: string;
  end?: boolean;
  section: "main" | "account";
  defaultWeight: number;
  icon: string;
  visible: (me: Me, can: (resource: string) => boolean) => boolean;
};

export const NAV_DEFINITIONS: NavItemDef[] = [
  {
    id: "cabinet",
    label: "Панель управления",
    to: "/",
    end: true,
    section: "main",
    defaultWeight: 10,
    icon: "⌂",
    visible: () => true,
  },
  {
    id: "procurements",
    label: "Договоры",
    to: "/procurements",
    section: "main",
    defaultWeight: 20,
    icon: "▤",
    visible: (me, can) => canReadContracts(me.user) || can("contracts"),
  },
  {
    id: "sed",
    label: "СЭД",
    to: "/sed",
    section: "main",
    defaultWeight: 25,
    icon: "☰",
    visible: () => true,
  },
  {
    id: "calendar",
    label: "Календарь",
    to: "/calendar",
    section: "main",
    defaultWeight: 28,
    icon: "▦",
    visible: (me, can) => canReadContracts(me.user) || can("contracts"),
  },
  {
    id: "users",
    label: "Пользователи",
    to: "/users",
    section: "main",
    defaultWeight: 30,
    icon: "◉",
    visible: (_me, can) => can("users") || can("directory"),
  },
  {
    id: "settings",
    label: "Настройки",
    to: "/settings",
    section: "main",
    defaultWeight: 50,
    icon: "⚙",
    visible: (me, can) =>
      can("settings") || canManageFolders(me.user) || canManageContractRoles(me.user),
  },
  {
    id: "notifications",
    label: "Уведомления",
    to: "/notifications",
    section: "account",
    defaultWeight: 80,
    icon: "◆",
    visible: () => true,
  },
  {
    id: "profile",
    label: "Профиль",
    to: "/profile",
    section: "account",
    defaultWeight: 90,
    icon: "●",
    visible: () => true,
  },
];

export function parseNavWeights(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
  }
  return out;
}

export function navWeight(item: NavItemDef, weights: Record<string, number>) {
  const w = weights[item.id];
  return typeof w === "number" ? w : item.defaultWeight;
}

export function buildNavItems(me: Me, can: (resource: string) => boolean) {
  const weights = parseNavWeights(me.user.navWeights);
  return NAV_DEFINITIONS.filter((item) => item.visible(me, can)).sort(
    (a, b) => navWeight(a, weights) - navWeight(b, weights) || a.label.localeCompare(b.label, "ru")
  );
}

export function defaultNavWeightsFor(me: Me, can: (resource: string) => boolean) {
  const out: Record<string, number> = {};
  for (const item of NAV_DEFINITIONS) {
    if (item.visible(me, can)) out[item.id] = item.defaultWeight;
  }
  return out;
}
