import { PrismaClient } from "@prisma/client";
import { debugCheckEnv, isDebug } from "./debug.ts";

/** Клиент базы данных Prisma (единый экземпляр на процесс) */
export const prisma = new PrismaClient({
  // В debug включаем подробные логи запросов
  log: isDebug ? ["query", "error", "warn"] : ["error"],
});

/**
 * Конфигурация приложения из переменных окружения.
 * Секреты и пароли — только через .env на сервере, не в репозитории.
 */
export const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  cookieName: "ecosys_session",
  uploadDir: process.env.UPLOAD_DIR || "/data/uploads",
  /** Режим отладки (см. lib/debug.ts) */
  debug: isDebug,
  ldap: {
    url: process.env.LDAP_URL || "ldap://10.37.1.230",
    urlFailover: process.env.LDAP_URL_FAILOVER || "ldap://10.37.1.231",
    bindDn: process.env.LDAP_BIND_DN || "ecosys@udhb.local",
    bindPassword: process.env.LDAP_BIND_PASSWORD || "",
    base: process.env.LDAP_BASE || "DC=udhb,DC=local",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 25),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "ecosys@udhb.local",
    secure: process.env.SMTP_SECURE === "1",
  },
};

// При старте в debug проверяем критичные переменные
debugCheckEnv({
  JWT_SECRET: process.env.JWT_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
});
