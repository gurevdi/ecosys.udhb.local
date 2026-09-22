import { prisma, config } from "./config.ts";
import { decryptAdPassword, encryptAdPassword } from "./ad-crypto.ts";

export type LdapConfig = {
  url: string;
  urlFailover: string;
  bindDn: string;
  bindPassword: string;
  base: string;
  domain: string;
};

export const LDAP_SETTING_KEYS = {
  url: "ad_ldap_url",
  urlFailover: "ad_ldap_url_failover",
  bindDn: "ad_ldap_bind_dn",
  bindPasswordEnc: "ad_ldap_bind_password_enc",
  base: "ad_ldap_base",
  domain: "ad_domain",
} as const;

/** Параметры LDAP: из БД (настройки приложения) с fallback на .env */
export async function getLdapConfig(): Promise<LdapConfig> {
  const { config: cfg, passwordError } = await resolveLdapConfig();
  if (passwordError) {
    throw new Error(passwordError);
  }
  return cfg;
}

async function resolveLdapConfig(): Promise<{ config: LdapConfig; passwordError: string | null }> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(LDAP_SETTING_KEYS) } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  let bindPassword = config.ldap.bindPassword;
  let passwordError: string | null = null;
  const enc = map[LDAP_SETTING_KEYS.bindPasswordEnc];
  if (enc) {
    try {
      bindPassword = decryptAdPassword(enc);
    } catch {
      passwordError =
        "Не удалось расшифровать пароль AD. Откройте Настройки → Active Directory и сохраните пароль service-bind заново.";
    }
  }

  return {
    config: {
      url: map[LDAP_SETTING_KEYS.url]?.trim() || config.ldap.url,
      urlFailover: map[LDAP_SETTING_KEYS.urlFailover]?.trim() || config.ldap.urlFailover,
      bindDn: map[LDAP_SETTING_KEYS.bindDn]?.trim() || config.ldap.bindDn,
      bindPassword: passwordError ? "" : bindPassword,
      base: map[LDAP_SETTING_KEYS.base]?.trim() || config.ldap.base,
      domain: map[LDAP_SETTING_KEYS.domain]?.trim() || "udhb.local",
    },
    passwordError,
  };
}

export async function saveLdapConfig(patch: {
  url?: string;
  urlFailover?: string;
  bindDn?: string;
  bindPassword?: string;
  base?: string;
  domain?: string;
}) {
  const upsert = async (key: string, value: string) => {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  };

  if (patch.url !== undefined) await upsert(LDAP_SETTING_KEYS.url, patch.url.trim());
  if (patch.urlFailover !== undefined) await upsert(LDAP_SETTING_KEYS.urlFailover, patch.urlFailover.trim());
  if (patch.bindDn !== undefined) await upsert(LDAP_SETTING_KEYS.bindDn, patch.bindDn.trim());
  if (patch.base !== undefined) await upsert(LDAP_SETTING_KEYS.base, patch.base.trim());
  if (patch.domain !== undefined) await upsert(LDAP_SETTING_KEYS.domain, patch.domain.trim());
  if (patch.bindPassword !== undefined && patch.bindPassword.length > 0) {
    await upsert(LDAP_SETTING_KEYS.bindPasswordEnc, encryptAdPassword(patch.bindPassword));
  }

  return getLdapConfigPublic();
}

/** Публичные поля подключения (без пароля) */
export async function getLdapConfigPublic() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(LDAP_SETTING_KEYS) } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const { config: cfg, passwordError } = await resolveLdapConfig();
  const hasStoredPassword = Boolean(map[LDAP_SETTING_KEYS.bindPasswordEnc] || config.ldap.bindPassword);
  return {
    url: cfg.url,
    urlFailover: cfg.urlFailover,
    bindDn: cfg.bindDn,
    base: cfg.base,
    domain: cfg.domain,
    hasPassword: hasStoredPassword && !passwordError,
    passwordError,
    configured: Boolean(!passwordError && cfg.bindPassword && cfg.bindDn && cfg.url && cfg.base),
  };
}
