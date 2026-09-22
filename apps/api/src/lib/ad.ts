import type { User } from "@prisma/client";
import { prisma } from "./config.ts";
import { RESOURCES } from "./catalog.ts";
import { debugLog } from "./debug.ts";
import { getLdapConfigPublic, saveLdapConfig } from "./ldap-config.ts";
import {
  findAdUser,
  findAdUsersByLogins,
  ldapHealth,
  ldapUserBind,
  type AdPerson,
} from "./ldap.ts";

export type AdPermissionGrant = { resource: string; canRead: boolean; canWrite: boolean };
export type AdContractRoleGrant = { role: string; departmentId: string | null };

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

const SETTING_KEYS = {
  autoProvision: "ad_auto_provision",
  syncOnLogin: "ad_sync_on_login",
  blockDisabled: "ad_block_disabled",
  applyGroupMappings: "ad_apply_group_mappings",
  defaultDepartmentId: "ad_default_department_id",
  lastTestAt: "ad_last_test_at",
  lastTestOk: "ad_last_test_ok",
  lastTestMessage: "ad_last_test_message",
  lastTestUrl: "ad_last_test_url",
  lastTestLatency: "ad_last_test_latency",
} as const;

function boolSetting(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return value === "1" || value === "true";
}

/** Настройки интеграции AD (из Setting + подключение LDAP) */
export async function getAdSettings(): Promise<AdSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(SETTING_KEYS) } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const conn = await getLdapConfigPublic();
  return {
    domain: conn.domain,
    autoProvision: boolSetting(map[SETTING_KEYS.autoProvision], false),
    syncOnLogin: boolSetting(map[SETTING_KEYS.syncOnLogin], true),
    blockDisabledAccounts: boolSetting(map[SETTING_KEYS.blockDisabled], true),
    applyGroupMappings: boolSetting(map[SETTING_KEYS.applyGroupMappings], true),
    defaultDepartmentId: map[SETTING_KEYS.defaultDepartmentId] || null,
    url: conn.url,
    urlFailover: conn.urlFailover,
    bindDn: conn.bindDn,
    base: conn.base,
    hasPassword: conn.hasPassword,
    passwordError: conn.passwordError,
    configured: conn.configured,
  };
}

export async function saveAdSettings(
  patch: Partial<{
    autoProvision: boolean;
    syncOnLogin: boolean;
    blockDisabledAccounts: boolean;
    applyGroupMappings: boolean;
    defaultDepartmentId: string | null;
    url: string;
    urlFailover: string;
    bindDn: string;
    bindPassword: string;
    base: string;
    domain: string;
  }>
) {
  const { url, urlFailover, bindDn, bindPassword, base, domain, ...behavior } = patch;

  if (
    url !== undefined ||
    urlFailover !== undefined ||
    bindDn !== undefined ||
    bindPassword !== undefined ||
    base !== undefined ||
    domain !== undefined
  ) {
    await saveLdapConfig({ url, urlFailover, bindDn, bindPassword, base, domain });
  }

  const entries: [string, string][] = [];
  if (behavior.autoProvision !== undefined) entries.push([SETTING_KEYS.autoProvision, behavior.autoProvision ? "true" : "false"]);
  if (behavior.syncOnLogin !== undefined) entries.push([SETTING_KEYS.syncOnLogin, behavior.syncOnLogin ? "true" : "false"]);
  if (behavior.blockDisabledAccounts !== undefined) entries.push([SETTING_KEYS.blockDisabled, behavior.blockDisabledAccounts ? "true" : "false"]);
  if (behavior.applyGroupMappings !== undefined) entries.push([SETTING_KEYS.applyGroupMappings, behavior.applyGroupMappings ? "true" : "false"]);
  if (behavior.defaultDepartmentId !== undefined) {
    if (behavior.defaultDepartmentId) {
      entries.push([SETTING_KEYS.defaultDepartmentId, behavior.defaultDepartmentId]);
    } else {
      await prisma.setting.deleteMany({ where: { key: SETTING_KEYS.defaultDepartmentId } });
    }
  }
  for (const [key, value] of entries) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return getAdSettings();
}

function defaultPermissions() {
  return RESOURCES.map((resource) => ({
    resource,
    canRead: resource === "contracts",
    canWrite: resource === "contracts",
  }));
}

function normalizeLogin(login: string) {
  return login.trim().replace(/@udhb\.local$/i, "");
}

function groupsMatch(userGroups: string[], mappingGroup: string) {
  const target = mappingGroup.trim().toLowerCase();
  return userGroups.some((g) => g.toLowerCase() === target);
}

/** Применить маппинги групп AD к пользователю */
export async function applyAdGroupMappings(userId: string, groups: string[]) {
  const settings = await getAdSettings();
  if (!settings.applyGroupMappings || !groups.length) return { applied: 0 };

  const mappings = await prisma.adGroupMapping.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  let isAdmin = false;
  const permMap = new Map<string, AdPermissionGrant>();
  const contractRoles: AdContractRoleGrant[] = [];
  let applied = 0;

  for (const m of mappings) {
    if (!groupsMatch(groups, m.adGroup)) continue;
    applied++;
    if (m.isAdmin) isAdmin = true;
    for (const p of (m.permissions as AdPermissionGrant[]) || []) {
      const prev = permMap.get(p.resource) || { resource: p.resource, canRead: false, canWrite: false };
      permMap.set(p.resource, {
        resource: p.resource,
        canRead: prev.canRead || p.canRead || p.canWrite,
        canWrite: prev.canWrite || p.canWrite,
      });
    }
    for (const cr of (m.contractRoles as AdContractRoleGrant[]) || []) {
      contractRoles.push({ role: cr.role, departmentId: cr.departmentId || null });
    }
  }

  if (!applied) return { applied: 0 };

  await prisma.user.update({
    where: { id: userId },
    data: { isAdmin },
  });

  for (const p of permMap.values()) {
    await prisma.userPermission.upsert({
      where: { userId_resource: { userId, resource: p.resource } },
      update: { canRead: p.canRead, canWrite: p.canWrite },
      create: { userId, resource: p.resource, canRead: p.canRead, canWrite: p.canWrite },
    });
  }

  if (contractRoles.length) {
    await prisma.userContractRole.deleteMany({ where: { userId } });
    for (const cr of contractRoles) {
      await prisma.userContractRole.create({
        data: {
          userId,
          role: cr.role as "admin" | "moderator" | "operator" | "auditor",
          departmentId: cr.departmentId,
          scopeKey: cr.departmentId || "",
        },
      });
    }
  }

  debugLog("ad", `group mappings applied to ${userId}: ${applied} rules`);
  return { applied };
}

/** Обновить профиль пользователя из AD */
export async function syncUserFromAd(userId: string, person?: AdPerson | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.source !== "ad") {
    throw new Error("Синхронизация доступна только для пользователей AD");
  }

  const ad = person || (await findAdUser(user.login));
  if (!ad) throw new Error("Пользователь не найден в Active Directory");

  const settings = await getAdSettings();
  const data: Record<string, unknown> = {
    fullName: ad.fullName,
    email: ad.email,
    position: ad.position,
    phone: ad.phone,
    adDn: ad.dn,
    adGroups: ad.groups,
    adSyncedAt: new Date(),
    adAccountDisabled: ad.disabled,
  };

  if (settings.blockDisabledAccounts && ad.disabled) {
    data.isActive = false;
  }

  await prisma.user.update({ where: { id: userId }, data });
  await applyAdGroupMappings(userId, ad.groups);

  return prisma.user.findUnique({
    where: { id: userId },
    include: { permissions: true, department: true, contractRoles: true },
  });
}

/** Импорт / создание AD-пользователя в экосистеме */
export async function importAdPerson(person: AdPerson, departmentId?: string | null) {
  const settings = await getAdSettings();
  const dept = departmentId ?? settings.defaultDepartmentId ?? null;

  const user = await prisma.user.upsert({
    where: { login: person.login },
    update: {
      fullName: person.fullName,
      email: person.email,
      position: person.position,
      phone: person.phone,
      adDn: person.dn,
      adGroups: person.groups,
      adSyncedAt: new Date(),
      adAccountDisabled: person.disabled,
      source: "ad",
      departmentId: dept || undefined,
      isActive: settings.blockDisabledAccounts && person.disabled ? false : undefined,
    },
    create: {
      login: person.login,
      fullName: person.fullName,
      email: person.email,
      position: person.position,
      phone: person.phone,
      adDn: person.dn,
      adGroups: person.groups,
      adSyncedAt: new Date(),
      adAccountDisabled: person.disabled,
      source: "ad",
      departmentId: dept,
      isActive: !(settings.blockDisabledAccounts && person.disabled),
      permissions: { create: defaultPermissions() },
    },
    include: { permissions: true, department: true, contractRoles: true },
  });

  await applyAdGroupMappings(user.id, person.groups);
  return prisma.user.findUnique({
    where: { id: user.id },
    include: { permissions: true, department: true, contractRoles: true },
  });
}

/** JIT: создать пользователя после успешного LDAP bind */
export async function provisionAdUser(login: string): Promise<User | null> {
  const settings = await getAdSettings();
  if (!settings.autoProvision) return null;

  const person = await findAdUser(login);
  if (!person) return null;
  if (settings.blockDisabledAccounts && person.disabled) return null;

  const imported = await importAdPerson(person);
  return imported;
}

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; code: "invalid"; message: string }
  | { ok: false; code: "not_provisioned"; message: string }
  | { ok: false; code: "disabled"; message: string };

/**
 * Полный цикл аутентификации: local / AD / JIT provisioning.
 */
export async function authenticateDomainLogin(loginRaw: string, password: string): Promise<LoginResult> {
  const login = normalizeLogin(loginRaw);
  const settings = await getAdSettings();

  let user = await prisma.user.findUnique({ where: { login } });

  if (!user) {
    const bindOk = await ldapUserBind(login, password);
    if (!bindOk) {
      return { ok: false, code: "invalid", message: "Неверный логин или пароль" };
    }
    user = await provisionAdUser(login);
    if (!user) {
      return {
        ok: false,
        code: "not_provisioned",
        message: "Учётная запись не подключена к экосистеме. Обратитесь к администратору.",
      };
    }
    return { ok: true, userId: user.id };
  }

  if (!user.isActive) {
    return { ok: false, code: "disabled", message: "Учётная запись отключена администратором" };
  }

  if (user.source === "ad") {
    const bindOk = await ldapUserBind(login, password);
    if (!bindOk) {
      if (user.passwordHash) {
        const bcrypt = await import("bcryptjs");
        const localOk = await bcrypt.compare(password, user.passwordHash);
        if (!localOk) return { ok: false, code: "invalid", message: "Неверный логин или пароль" };
      } else {
        return { ok: false, code: "invalid", message: "Неверный логин или пароль" };
      }
    }

    if (settings.syncOnLogin && settings.configured) {
      try {
        await syncUserFromAd(user.id);
      } catch (e) {
        debugLog("ad", `sync on login skipped for ${login}: ${e instanceof Error ? e.message : e}`);
      }
    }

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    if (fresh && settings.blockDisabledAccounts && fresh.adAccountDisabled) {
      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      return { ok: false, code: "disabled", message: "Учётная запись отключена в Active Directory" };
    }
    if (fresh && !fresh.isActive) {
      return { ok: false, code: "disabled", message: "Учётная запись отключена" };
    }

    return { ok: true, userId: user.id };
  }

  if (!user.passwordHash) {
    return { ok: false, code: "invalid", message: "Неверный логин или пароль" };
  }
  const bcrypt = await import("bcryptjs");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { ok: false, code: "invalid", message: "Неверный логин или пароль" };
  return { ok: true, userId: user.id };
}

/** Сохранить результат проверки подключения */
export async function recordAdTestResult(health: { ok: boolean; url: string | null; message: string; latencyMs: number }) {
  const entries: [string, string][] = [
    [SETTING_KEYS.lastTestAt, new Date().toISOString()],
    [SETTING_KEYS.lastTestOk, health.ok ? "true" : "false"],
    [SETTING_KEYS.lastTestMessage, health.message.slice(0, 500)],
    [SETTING_KEYS.lastTestUrl, health.url || ""],
    [SETTING_KEYS.lastTestLatency, String(health.latencyMs)],
  ];
  for (const [key, value] of entries) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

async function readLastTest() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [SETTING_KEYS.lastTestAt, SETTING_KEYS.lastTestOk, SETTING_KEYS.lastTestMessage, SETTING_KEYS.lastTestUrl, SETTING_KEYS.lastTestLatency] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!map[SETTING_KEYS.lastTestAt]) return null;
  return {
    at: map[SETTING_KEYS.lastTestAt],
    ok: map[SETTING_KEYS.lastTestOk] === "true",
    message: map[SETTING_KEYS.lastTestMessage] || "",
    url: map[SETTING_KEYS.lastTestUrl] || null,
    latencyMs: Number(map[SETTING_KEYS.lastTestLatency] || 0),
  };
}

/** Статус AD для панели администратора (без автоматического LDAP ping) */
export async function getAdStatus() {
  const settings = await getAdSettings();
  const lastTest = await readLastTest();

  const health = lastTest
    ? { ok: lastTest.ok, url: lastTest.url, message: lastTest.message, latencyMs: lastTest.latencyMs }
    : settings.configured
      ? { ok: false, url: null, message: "Подключение не проверялось — нажмите «Проверить»", latencyMs: 0 }
      : { ok: false, url: null, message: "Заполните параметры подключения LDAP", latencyMs: 0 };

  const [adUsers, mappings, localUsers, disabledAd] = await Promise.all([
    prisma.user.count({ where: { source: "ad" } }),
    prisma.adGroupMapping.count({ where: { isActive: true } }),
    prisma.user.count({ where: { source: "local" } }),
    prisma.user.count({ where: { source: "ad", adAccountDisabled: true } }),
  ]);

  return {
    settings,
    health,
    lastTest,
    stats: { adUsers, localUsers, mappings, disabledAd },
    checklist: {
      connection: settings.configured,
      password: settings.hasPassword,
      tested: Boolean(lastTest?.ok),
      mappings: mappings > 0,
    },
  };
}

/** Массовая синхронизация всех AD-пользователей */
export async function syncAllAdUsers() {
  const users = await prisma.user.findMany({ where: { source: "ad" }, select: { id: true, login: true } });
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  const adMap = await findAdUsersByLogins(users.map((u) => u.login));

  for (const u of users) {
    const person = adMap.get(u.login.toLowerCase());
    if (!person) {
      failed++;
      errors.push(`${u.login}: не найден в AD`);
      continue;
    }
    try {
      await syncUserFromAd(u.id, person);
      synced++;
    } catch (e) {
      failed++;
      errors.push(`${u.login}: ${e instanceof Error ? e.message : "ошибка"}`);
    }
  }

  return { synced, failed, total: users.length, errors: errors.slice(0, 20) };
}
