import { getLdapConfig } from "../src/lib/ldap-config.ts";
import { ldapHealth } from "../src/lib/ldap.ts";

const cfg = await getLdapConfig();
console.log("url:", cfg.url);
console.log("failover:", cfg.urlFailover);
console.log("bindDn:", cfg.bindDn);
console.log("base:", cfg.base);
console.log("domain:", cfg.domain);
console.log("passwordLen:", cfg.bindPassword?.length || 0);

const health = await ldapHealth();
console.log("health:", JSON.stringify(health));
