import { Client } from "ldapts";
import { getLdapConfig, type LdapConfig } from "./ldap-config.ts";
import { debugError, debugLog, debugTry } from "./debug.ts";

/** Запись из Active Directory */
export type AdPerson = {
  login: string;
  fullName: string;
  email: string | null;
  position: string | null;
  phone: string | null;
  dn: string;
  groups: string[];
  disabled: boolean;
};

export type LdapHealth = {
  ok: boolean;
  url: string | null;
  message: string;
  latencyMs: number;
};

const UAC_DISABLED = 0x0002;

export function escapeLdapFilter(value: string) {
  return value.replace(/[()\\*\0]/g, (ch) => {
    const code = ch.charCodeAt(0).toString(16).padStart(2, "0");
    return `\\${code}`;
  });
}

export function adUpn(login: string, domain: string) {
  const domainSuffix = `@${domain}`;
  const clean = login.trim().replace(new RegExp(`${domainSuffix.replace(".", "\\.")}$`, "i"), "");
  return clean.includes("@") ? clean : `${clean}${domainSuffix}`;
}

export function cnFromDn(dn: string) {
  const m = dn.match(/^CN=([^,\\/]+)/i);
  return m ? m[1] : dn;
}

function isAccountDisabled(entry: Record<string, unknown>) {
  const raw = entry.userAccountControl;
  const uac = Number(Array.isArray(raw) ? raw[0] : raw || 0);
  return Boolean(uac & UAC_DISABLED);
}

function readGroups(entry: Record<string, unknown>): string[] {
  const raw = entry.memberOf;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.map((dn) => cnFromDn(String(dn))).filter(Boolean);
}

function mapEntry(entry: Record<string, unknown>): AdPerson | null {
  const login = String(entry.sAMAccountName || "").trim();
  if (!login) return null;
  const dn = String(entry.dn || entry.distinguishedName || "");
  return {
    login,
    fullName: String(entry.displayName || entry.cn || login),
    email: entry.mail ? String(entry.mail) : null,
    position: entry.title ? String(entry.title) : null,
    phone: entry.telephoneNumber ? String(Array.isArray(entry.telephoneNumber) ? entry.telephoneNumber[0] : entry.telephoneNumber) : null,
    dn,
    groups: readGroups(entry),
    disabled: isAccountDisabled(entry),
  };
}

const PERSON_USER_FILTER = "(&(objectCategory=person)(objectClass=user))";

async function withLdapConn<T>(
  label: string,
  run: (client: Client, url: string, cfg: LdapConfig) => Promise<T>
): Promise<T> {
  const cfg = await getLdapConfig();
  const urls = [cfg.url, cfg.urlFailover].filter(Boolean);
  let last: unknown;
  for (const url of urls) {
    const client = new Client({ url, timeout: 15000, connectTimeout: 8000 });
    try {
      const result = await run(client, url, cfg);
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
      return result;
    } catch (e) {
      last = e;
      debugError("ldap", `${label} failed (${url})`, e);
      try {
        await client.unbind();
      } catch {
        /* ignore */
      }
    }
  }
  throw last;
}

/** Человекочитаемая ошибка LDAP (Windows AD коды) */
export function ldapErrorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/data 52e|0x52e|52e,/i.test(text)) {
    return "Неверный логин или пароль service-bind (код AD 52e). Проверьте UPN и пароль в Настройки → Active Directory.";
  }
  if (/data 525|0x525/i.test(text)) return "Учётная запись service-bind не найдена в AD (код 525).";
  if (/data 533|0x533/i.test(text)) return "Учётная запись service-bind отключена (код 533).";
  if (/data 532|0x532/i.test(text)) return "Срок действия пароля service-bind истёк (код 532).";
  if (/data 773|0x773/i.test(text)) return "Требуется смена пароля service-bind (код 773).";
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(text)) return "Контроллер домена недоступен по сети.";
  return text;
}

async function serviceBind(client: Client, cfg: LdapConfig) {
  if (!cfg.bindPassword) {
    throw new Error("Пароль service-bind LDAP не задан — укажите в Настройки → Active Directory");
  }
  const bindIdentity = normalizeServiceBindIdentity(cfg.bindDn, cfg.domain);
  try {
    await client.bind(bindIdentity, cfg.bindPassword);
  } catch (e) {
    throw new Error(ldapErrorMessage(e));
  }
}

/** UPN / DOMAIN\\user / DN — для service-bind */
function normalizeServiceBindIdentity(bindDn: string, domain: string) {
  const v = bindDn.trim();
  if (!v) return v;
  if (v.includes("=")) return v; // DN
  if (v.includes("\\")) return v; // DOMAIN\user
  if (v.includes("@")) return v; // UPN
  const shortDomain = domain.split(".")[0]?.toUpperCase() || domain.toUpperCase();
  return `${shortDomain}\\${v.replace(/@.*/, "")}`;
}

export async function ldapUserBind(login: string, password: string): Promise<boolean> {
  try {
    const cfg = await getLdapConfig();
    const upn = adUpn(login, cfg.domain);
    await withLdapConn("userBind", async (client) => {
      await client.bind(upn, password);
    });
    debugLog("ldap", `user bind OK: ${login}`);
    return true;
  } catch {
    return false;
  }
}

export async function ldapHealth(): Promise<LdapHealth> {
  const started = Date.now();
  try {
    const url = await withLdapConn("health", async (client, activeUrl, cfg) => {
      await serviceBind(client, cfg);
      await client.search(cfg.base, {
        scope: "base",
        filter: "(objectClass=*)",
        attributes: ["dn"],
        sizeLimit: 1,
      });
      return activeUrl;
    });
    return { ok: true, url, message: "Каталог доступен", latencyMs: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      url: null,
      message: ldapErrorMessage(e),
      latencyMs: Date.now() - started,
    };
  }
}

export async function searchAd(query = "", limit = 200): Promise<AdPerson[]> {
  return debugTry("ldap", `searchAd q="${query}"`, async () => {
    const q = escapeLdapFilter(query.trim());
    // Вкладываем фильтры целиком: (&(базовый)(|(поля...))) — без slice, иначе получается «(&&...)»
    const filter = q
      ? `(&${PERSON_USER_FILTER}(|(sAMAccountName=*${q}*)(displayName=*${q}*)(cn=*${q}*)(mail=*${q}*)))`
      : PERSON_USER_FILTER;

    return withLdapConn("searchAd", async (client, _url, cfg) => {
      await serviceBind(client, cfg);
      const { searchEntries } = await client.search(cfg.base, {
        scope: "sub",
        filter,
        attributes: ["sAMAccountName", "displayName", "mail", "title", "telephoneNumber", "distinguishedName", "cn", "memberOf", "userAccountControl"],
        sizeLimit: limit,
        paged: true,
      });
      const people = searchEntries.map((e) => mapEntry(e as Record<string, unknown>)).filter((x): x is AdPerson => Boolean(x));
      debugLog("ldap", `searchAd: ${people.length} записей`);
      return people;
    });
  });
}

export async function findAdUser(login: string): Promise<AdPerson | null> {
  const cfg = await getLdapConfig();
  const safe = escapeLdapFilter(login.trim().replace(new RegExp(`@${cfg.domain.replace(".", "\\.")}$`, "i"), ""));
  if (!safe) return null;
  const filter = `(&(objectCategory=person)(objectClass=user)(sAMAccountName=${safe}))`;

  return withLdapConn("findAdUser", async (client, _url, ldapCfg) => {
    await serviceBind(client, ldapCfg);
    const { searchEntries } = await client.search(ldapCfg.base, {
      scope: "sub",
      filter,
      attributes: ["sAMAccountName", "displayName", "mail", "title", "telephoneNumber", "distinguishedName", "cn", "memberOf", "userAccountControl"],
      sizeLimit: 1,
    });
    const entry = searchEntries[0];
    if (!entry) return null;
    return mapEntry(entry as Record<string, unknown>);
  });
}

export async function findAdUsersByLogins(logins: string[]): Promise<Map<string, AdPerson>> {
  const cfg = await getLdapConfig();
  const domainRe = new RegExp(`@${cfg.domain.replace(".", "\\.")}$`, "i");
  const unique = [...new Set(logins.map((l) => l.trim().replace(domainRe, "").toLowerCase()).filter(Boolean))];
  const map = new Map<string, AdPerson>();
  if (!unique.length) return map;

  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const or = chunk.map((l) => `(sAMAccountName=${escapeLdapFilter(l)})`).join("");
    const filter = `(&(objectCategory=person)(objectClass=user)(|${or}))`;

    await withLdapConn("findAdUsersByLogins", async (client, _url, ldapCfg) => {
      await serviceBind(client, ldapCfg);
      const { searchEntries } = await client.search(ldapCfg.base, {
        scope: "sub",
        filter,
        attributes: ["sAMAccountName", "displayName", "mail", "title", "telephoneNumber", "distinguishedName", "cn", "memberOf", "userAccountControl"],
        sizeLimit: chunk.length,
      });
      for (const entry of searchEntries) {
        const person = mapEntry(entry as Record<string, unknown>);
        if (person) map.set(person.login.toLowerCase(), person);
      }
    });
  }
  return map;
}
