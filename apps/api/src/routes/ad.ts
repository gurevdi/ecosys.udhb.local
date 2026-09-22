import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/config.ts";
import { RESOURCES } from "../lib/catalog.ts";
import { debugError, debugErrorPayload } from "../lib/debug.ts";
import { requirePerm, getAuthUser, can } from "../lib/auth.ts";
import {
  getAdSettings,
  saveAdSettings,
  getAdStatus,
  syncUserFromAd,
  syncAllAdUsers,
  importAdPerson,
  recordAdTestResult,
  type AdPermissionGrant,
  type AdContractRoleGrant,
} from "../lib/ad.ts";
import { searchAd, findAdUsersByLogins, ldapHealth } from "../lib/ldap.ts";

export async function registerAdRoutes(app: FastifyInstance) {
  /** Полная загрузка панели AD (статус + маппинги) */
  app.get("/api/ad/bootstrap", async (req, reply) => {
    const user = await requirePerm(req, reply, "settings", false);
    if (!user) return;
    try {
      const [status, mappings] = await Promise.all([
        getAdStatus(),
        prisma.adGroupMapping.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
      ]);
      return { status, mappings };
    } catch (e) {
      debugError("ad", "bootstrap", e);
      reply.code(502).send(debugErrorPayload(e, "Не удалось загрузить данные AD"));
    }
  });

  /** Статус интеграции AD */
  app.get("/api/ad/status", async (req, reply) => {
    const user = await requirePerm(req, reply, "settings", false);
    if (!user) return;
    try {
      return getAdStatus();
    } catch (e) {
      debugError("ad", "status", e);
      reply.code(502).send(debugErrorPayload(e, "Не удалось получить статус AD"));
    }
  });

  /** Проверка подключения к AD */
  app.post("/api/ad/test", async (req, reply) => {
    const user = await requirePerm(req, reply, "settings", true);
    if (!user) return;
    try {
      const health = await ldapHealth();
      await recordAdTestResult(health);
      return { ok: health.ok, health };
    } catch (e) {
      debugError("ad", "test", e);
      reply.code(502).send(debugErrorPayload(e, "Проверка AD не удалась"));
    }
  });

  /** Быстрый поиск в каталоге (из настроек AD) */
  app.get("/api/ad/preview", async (req, reply) => {
    const user = await requirePerm(req, reply, "settings", false);
    if (!user) return;
    const q = String((req.query as { q?: string }).q || "");
    const limit = Math.min(Number((req.query as { limit?: string }).limit || 25), 50);
    try {
      const people = await searchAd(q, limit);
      return { people, total: people.length };
    } catch (e) {
      debugError("ad", "preview", e);
      reply.code(502).send(debugErrorPayload(e, "Каталог недоступен"));
    }
  });

  /** Синхронизация всех AD-пользователей */
  app.post("/api/ad/sync-all", async (req, reply) => {
    const user = await getAuthUser(req);
    if (!user || (!can(user, "settings", true) && !can(user, "users", true))) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    try {
      return syncAllAdUsers();
    } catch (e) {
      debugError("ad", "sync all", e);
      reply.code(502).send(debugErrorPayload(e, "Массовая синхронизация не удалась"));
    }
  });

  /** Импорт из AD (из настроек) */
  app.post("/api/ad/import", async (req, reply) => {
    const actor = await requirePerm(req, reply, "settings", true);
    if (!actor) return;
    const body = z
      .object({
        logins: z.array(z.string()).min(1),
        departmentId: z.string().nullable().optional(),
      })
      .parse(req.body);
    try {
      const adMap = await findAdUsersByLogins(body.logins);
      let imported = 0;
      for (const raw of body.logins) {
        const login = raw.replace(/@udhb\.local$/i, "");
        const person = adMap.get(login.toLowerCase());
        if (!person) continue;
        await importAdPerson(person, body.departmentId);
        imported++;
      }
      return { imported };
    } catch (e) {
      debugError("ad", "import", e);
      reply.code(502).send(debugErrorPayload(e, "Импорт не удался"));
    }
  });

  /** Настройки AD */
  app.get("/api/ad/settings", async (req, reply) => {
    const user = await requirePerm(req, reply, "settings", false);
    if (!user) return;
    return getAdSettings();
  });

  app.put("/api/ad/settings", async (req, reply) => {
    const actor = await requirePerm(req, reply, "settings", true);
    if (!actor) return;
    const body = z
      .object({
        autoProvision: z.boolean().optional(),
        syncOnLogin: z.boolean().optional(),
        blockDisabledAccounts: z.boolean().optional(),
        applyGroupMappings: z.boolean().optional(),
        defaultDepartmentId: z.string().nullable().optional(),
        url: z.string().optional(),
        urlFailover: z.string().optional(),
        bindDn: z.string().optional(),
        bindPassword: z.string().optional(),
        base: z.string().optional(),
        domain: z.string().optional(),
      })
      .parse(req.body);
    return saveAdSettings(body);
  });

  /** Маппинги групп AD */
  app.get("/api/ad/group-mappings", async (req, reply) => {
    const user = await requirePerm(req, reply, "settings", false);
    if (!user) return;
    return prisma.adGroupMapping.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
  });

  app.post("/api/ad/group-mappings", async (req, reply) => {
    const actor = await requirePerm(req, reply, "settings", true);
    if (!actor) return;
    const body = z
      .object({
        adGroup: z.string().min(1),
        label: z.string().min(1),
        isAdmin: z.boolean().optional(),
        permissions: z.array(z.object({ resource: z.string(), canRead: z.boolean(), canWrite: z.boolean() })).optional(),
        contractRoles: z
          .array(z.object({ role: z.enum(["admin", "moderator", "operator", "auditor"]), departmentId: z.string().nullable().optional() }))
          .optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return prisma.adGroupMapping.create({
      data: {
        adGroup: body.adGroup.trim(),
        label: body.label.trim(),
        isAdmin: body.isAdmin ?? false,
        permissions: (body.permissions ?? []) as AdPermissionGrant[],
        contractRoles: (body.contractRoles ?? []) as AdContractRoleGrant[],
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
      },
    });
  });

  app.patch("/api/ad/group-mappings/:id", async (req, reply) => {
    const actor = await requirePerm(req, reply, "settings", true);
    if (!actor) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        adGroup: z.string().min(1).optional(),
        label: z.string().min(1).optional(),
        isAdmin: z.boolean().optional(),
        permissions: z.array(z.object({ resource: z.string(), canRead: z.boolean(), canWrite: z.boolean() })).optional(),
        contractRoles: z
          .array(z.object({ role: z.enum(["admin", "moderator", "operator", "auditor"]), departmentId: z.string().nullable().optional() }))
          .optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.adGroup !== undefined) data.adGroup = body.adGroup.trim();
    if (body.label !== undefined) data.label = body.label.trim();
    if (body.isAdmin !== undefined) data.isAdmin = body.isAdmin;
    if (body.permissions !== undefined) data.permissions = body.permissions;
    if (body.contractRoles !== undefined) data.contractRoles = body.contractRoles;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    return prisma.adGroupMapping.update({ where: { id }, data });
  });

  app.delete("/api/ad/group-mappings/:id", async (req, reply) => {
    const actor = await requirePerm(req, reply, "settings", true);
    if (!actor) return;
    const { id } = req.params as { id: string };
    await prisma.adGroupMapping.delete({ where: { id } });
    return { ok: true };
  });

  /** Поиск в каталоге AD */
  app.get("/api/directory/search", async (req, reply) => {
    const actor = await requirePerm(req, reply, "directory", false);
    if (!actor) return;
    const q = String((req.query as { q?: string }).q || "");
    const limit = Math.min(Number((req.query as { limit?: string }).limit || 200), 500);
    try {
      const people = await searchAd(q, limit);
      return { people };
    } catch (e) {
      debugError("ldap", "каталог AD недоступен", e);
      reply.code(502).send(debugErrorPayload(e, "Каталог недоступен"));
    }
  });

  /** Импорт пользователей из AD по логинам */
  app.post("/api/directory/import", async (req, reply) => {
    const actor = await requirePerm(req, reply, "directory", true);
    if (!actor) return;
    const body = z
      .object({
        logins: z.array(z.string()).min(1),
        departmentId: z.string().nullable().optional(),
      })
      .parse(req.body);
    try {
      const adMap = await findAdUsersByLogins(body.logins);
      const created = [];
      for (const raw of body.logins) {
        const login = raw.replace(/@udhb\.local$/i, "");
        const person = adMap.get(login.toLowerCase());
        if (!person) continue;
        const user = await importAdPerson(person, body.departmentId);
        if (user) created.push(user);
      }
      return { imported: created.length, users: created };
    } catch (e) {
      debugError("ad", "import", e);
      reply.code(502).send(debugErrorPayload(e, "Импорт из AD не удался"));
    }
  });

  /** Синхронизация одного AD-пользователя */
  app.post("/api/ad/sync/:userId", async (req, reply) => {
    const actor = await requirePerm(req, reply, "users", true);
    if (!actor) return;
    const { userId } = req.params as { userId: string };
    try {
      const user = await syncUserFromAd(userId);
      return { user };
    } catch (e) {
      debugError("ad", "sync user", e);
      reply.code(502).send(debugErrorPayload(e, "Синхронизация не удалась"));
    }
  });
}
