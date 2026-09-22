import fs from "fs";
import path from "path";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma, config } from "./lib/config.ts";
import {
  bcrypt,
  can,
  requirePerm,
  requireUser,
  setSession,
  signToken,
} from "./lib/auth.ts";
import { authenticateDomainLogin } from "./lib/ad.ts";
import { notify, notifyMany } from "./lib/notify.ts";
import { debugError, debugLog, debugTry, debugErrorPayload } from "./lib/debug.ts";
import {
  CONTRACT_DEPT_STATUSES,
  DOCUMENT_PACKAGES,
  RESOURCES,
  packageKey,
} from "./lib/catalog.ts";
import { canReadContracts, canWriteContracts, canDeleteContracts, contractDepartmentScope } from "./lib/contracts.ts";
import {
  getFlow,
  stageChecks,
  validateTransition,
  workflowSummary,
  toWorkflowInput,
  nextStatus as workflowNextStatus,
} from "./lib/proc-workflow.ts";
import { registerContractRoutes, getContractYears } from "./routes/contracts.ts";
import { registerAdRoutes } from "./routes/ad.ts";
import { registerSedRoutes } from "./routes/sed.ts";
import { registerProcExtraRoutes, listWhere } from "./routes/proc-extra.ts";
import { fetchSedCabinetPreview } from "./lib/sed.ts";
import { signatoryFromSettings } from "./lib/memo-signatories.ts";
import { describeProcPatch, logProcChange, statusChangeText } from "./lib/proc-audit.ts";
import { nextProcurementSerialNo } from "./lib/proc-serial.ts";
import { parseDateOnly, addDays, endBeforeStart } from "./lib/dates.ts";
import { extractContractFileText, parseContractText } from "./lib/contract-parse.ts";

/** Публичные поля пользователя без passwordHash */
function publicUser(u: {
  id: string;
  login: string;
  fullName: string;
  email: string | null;
  position: string | null;
  departmentId: string | null;
  source: string;
  isActive: boolean;
  isAdmin: boolean;
  notifyEmail: boolean;
  notifyInApp: boolean;
}) {
  return {
    id: u.id,
    login: u.login,
    fullName: u.fullName,
    email: u.email,
    position: u.position,
    departmentId: u.departmentId,
    source: u.source,
    isActive: u.isActive,
    isAdmin: u.isAdmin,
    notifyEmail: u.notifyEmail,
    notifyInApp: u.notifyInApp,
  };
}

export async function registerRoutes(app: FastifyInstance) {
  debugLog("routes", "регистрация маршрутов API");
  await registerProcExtraRoutes(app);

  app.get("/api/health", async () => ({ ok: true, service: "ecosys", debug: config.debug }));

  /** Вход по логину и паролю (локальный или AD, с JIT provisioning) */
  app.post("/api/auth/login", async (req, reply) => {
    return debugTry("auth", "login", async () => {
      const body = z.object({ login: z.string().min(1), password: z.string().min(1) }).parse(req.body);
      const result = await authenticateDomainLogin(body.login, body.password);
      if (!result.ok) {
        debugLog("auth", `неудачный вход: ${body.login} (${result.code})`);
        reply.code(result.code === "not_provisioned" || result.code === "disabled" ? 403 : 401).send({ error: result.message });
        return;
      }
      setSession(reply, signToken(result.userId));
      const session = await prisma.user.findUnique({
        where: { id: result.userId },
        include: { permissions: true, department: true, contractRoles: true },
      });
      return { user: session };
    });
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie(config.cookieName, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      include: { permissions: true, department: true, contractRoles: true },
    });
    if (!full) {
      reply.code(404).send({ error: "Пользователь не найден" });
      return;
    }
    const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    const { passwordHash: _ph, sedPasswordEnc, ...safe } = full;
    const sedReady = Boolean(
      full.sedLastTestOk && sedPasswordEnc && full.sedGroupId && full.sedUserId && full.sedLogin
    );
    return {
      user: {
        ...safe,
        sedReady,
        sedGroupName: full.sedGroupName,
        sedLogin: full.sedLogin,
      },
      unread,
    };
  });

  app.patch("/api/auth/profile", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        notifyEmail: z.boolean().optional(),
        notifyInApp: z.boolean().optional(),
        password: z.string().min(8).optional(),
        navWeights: z.record(z.string(), z.number().int().min(0).max(9999)).optional(),
      })
      .parse(req.body);
    const data: Record<string, unknown> = {};
    if (body.email !== undefined) data.email = body.email;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.notifyEmail !== undefined) data.notifyEmail = body.notifyEmail;
    if (body.notifyInApp !== undefined) data.notifyInApp = body.notifyInApp;
    if (body.navWeights !== undefined) data.navWeights = body.navWeights;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return { user: publicUser(updated) };
  });

  app.get("/api/departments", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return prisma.department.findMany({ orderBy: { name: "asc" } });
  });

  app.get("/api/users/stats", async (req, reply) => {
    const user = await requirePerm(req, reply, "users", false);
    if (!user) return;
    const [total, active, ad, local, disabledAd] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { source: "ad" } }),
      prisma.user.count({ where: { source: "local" } }),
      prisma.user.count({ where: { source: "ad", adAccountDisabled: true } }),
    ]);
    return { total, active, ad, local, disabledAd };
  });

  app.get("/api/users", async (req, reply) => {
    const user = await requirePerm(req, reply, "users", false);
    if (!user) return;
    const query = req.query as { q?: string; source?: string; active?: string };
    const where: Record<string, unknown> = {};
    if (query.source === "ad" || query.source === "local") where.source = query.source;
    if (query.active === "true") where.isActive = true;
    if (query.active === "false") where.isActive = false;
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { login: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { position: { contains: q, mode: "insensitive" } },
      ];
    }
    return prisma.user.findMany({
      where,
      orderBy: { fullName: "asc" },
      include: { department: true, permissions: true, contractRoles: true },
    });
  });

  app.get("/api/users/brief", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, login: true, fullName: true, position: true, departmentId: true },
    });
  });

  app.post("/api/users", async (req, reply) => {
    const actor = await requirePerm(req, reply, "users", true);
    if (!actor) return;
    const body = z
      .object({
        login: z.string().min(2),
        password: z.string().min(8).optional(),
        fullName: z.string().min(2),
        email: z.string().email().optional().nullable(),
        position: z.string().optional().nullable(),
        departmentId: z.string().optional().nullable(),
        isAdmin: z.boolean().optional(),
        source: z.enum(["local", "ad"]).optional(),
      })
      .parse(req.body);
    const login = body.login.trim().replace(/@udhb\.local$/i, "");
    const created = await prisma.user.create({
      data: {
        login,
        passwordHash: body.password ? await bcrypt.hash(body.password, 12) : null,
        fullName: body.fullName,
        email: body.email || null,
        position: body.position || null,
        departmentId: body.departmentId || null,
        isAdmin: actor.isAdmin ? Boolean(body.isAdmin) : false,
        source: body.source || "local",
        permissions: {
          create: RESOURCES.map((resource) => ({
            resource,
            canRead: resource === "contracts",
            canWrite: resource === "contracts",
          })),
        },
      },
      include: { permissions: true, department: true },
    });
    return created;
  });

  app.patch("/api/users/:id", async (req, reply) => {
    const actor = await requirePerm(req, reply, "users", true);
    if (!actor) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        fullName: z.string().optional(),
        email: z.string().email().nullable().optional(),
        position: z.string().nullable().optional(),
        departmentId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        isAdmin: z.boolean().optional(),
        password: z.string().min(8).optional(),
        permissions: z
          .array(
            z.object({
              resource: z.string(),
              canRead: z.boolean(),
              canWrite: z.boolean(),
            })
          )
          .optional(),
        contractRoles: z
          .array(
            z.object({
              role: z.enum(["admin", "moderator", "operator", "auditor"]),
              departmentId: z.string().nullable().optional(),
            })
          )
          .optional(),
      })
      .parse(req.body);
    if (body.isAdmin !== undefined && !actor.isAdmin) {
      reply.code(403).send({ error: "Назначать администратора может только администратор" });
      return;
    }
    const data: Record<string, unknown> = {};
    for (const k of ["fullName", "email", "position", "departmentId", "isActive", "isAdmin"] as const) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 12);
    const updated = await prisma.user.update({ where: { id }, data });
    if (body.permissions) {
      for (const p of body.permissions) {
        await prisma.userPermission.upsert({
          where: { userId_resource: { userId: id, resource: p.resource } },
          update: { canRead: p.canRead, canWrite: p.canWrite },
          create: { userId: id, resource: p.resource, canRead: p.canRead, canWrite: p.canWrite },
        });
      }
    }
    if (body.contractRoles !== undefined) {
      await prisma.userContractRole.deleteMany({ where: { userId: id } });
      for (const cr of body.contractRoles) {
        const scopeKey = cr.departmentId || "";
        await prisma.userContractRole.create({
          data: { userId: id, role: cr.role, departmentId: cr.departmentId || null, scopeKey },
        });
      }
    }
    return prisma.user.findUnique({
      where: { id: updated.id },
      include: { permissions: true, department: true, contractRoles: true },
    });
  });

  app.get("/api/settings", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const rows = await prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.put("/api/settings", async (req, reply) => {
    const actor = await requirePerm(req, reply, "settings", true);
    if (!actor) return;
    const body = z.record(z.string(), z.string().nullable()).parse(req.body);
    for (const [key, value] of Object.entries(body)) {
      if (value === null || value === "") {
        await prisma.setting.deleteMany({ where: { key } });
      } else {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
    }
    const rows = await prisma.setting.findMany();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.get("/api/notifications", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.post("/api/notifications/read", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = z.object({ ids: z.array(z.string()).optional() }).parse(req.body || {});
    await prisma.notification.updateMany({
      where: { userId: user.id, id: body.ids ? { in: body.ids } : undefined, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.get("/api/procurements", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canReadContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const q = req.query as {
      status?: string;
      departmentId?: string;
      folderId?: string;
      budgetYear?: string;
      year?: string;
      yearField?: string;
      category?: string;
      supplier?: string;
      archive?: string;
      q?: string;
    };
    const where = await listWhere(user, q);
    return prisma.procurement.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        department: true,
        folder: { select: { id: true, name: true, year: true } },
        initiator: { select: { id: true, fullName: true, position: true } },
        selectedQuote: { select: { supplierName: true } },
        executorUser: { select: { id: true, fullName: true } },
        documents: { select: { code: true, present: true } },
        payments: { select: { amount: true, paidAt: true, addressee: true } },
        _count: { select: { quotes: true, memos: true, payments: true } },
      },
    }).then((rows) =>
      rows.map((r) => ({
        ...r,
        workflow: workflowSummary(toWorkflowInput(r)),
      }))
    );
  });

  app.get("/api/procurements/deadlines", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canReadContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const now = new Date();
    const deptScope = contractDepartmentScope(user);
    return prisma.procurement.findMany({
      where: {
        ...deptScope,
        status: { in: ["contracted", "execution", "acceptance_window"] },
        OR: [{ acceptanceStartAt: { not: null } }, { acceptanceDueAt: { not: null } }],
      },
      orderBy: { acceptanceDueAt: "asc" },
      include: {
        department: true,
        initiator: { select: { id: true, fullName: true } },
      },
    }).then((rows) =>
      rows.map((p) => ({
        ...p,
        overdue: Boolean(p.acceptanceDueAt && p.acceptanceDueAt < now),
        startNow: Boolean(p.acceptanceStartAt && p.acceptanceStartAt <= now),
      }))
    );
  });

  app.post("/api/procurements", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        title: z.string().min(3),
        method: z.enum(["electronic_shop", "auction"]),
        category: z.enum(["service", "supply", "telecom"]).default("service"),
        departmentId: z.string(),
        description: z.string().optional().nullable(),
        estimatedAmount: z.number().optional().nullable(),
        folderId: z.string().optional().nullable(),
        budgetYear: z.number().int().optional().nullable(),
      })
      .parse(req.body);
    if (!canWriteContracts(user, body.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    if (body.budgetYear != null) {
      const allowedYears = await getContractYears();
      if (!allowedYears.includes(body.budgetYear)) {
        reply.code(400).send({ error: "Год договора нужно выбрать из списка в настройках" });
        return;
      }
    }
    const docs = DOCUMENT_PACKAGES[packageKey(body.method)] || [];
    const serialNo = await nextProcurementSerialNo();
    const created = await prisma.procurement.create({
      data: {
        serialNo,
        title: body.title,
        law: "fz44",
        method: body.method,
        category: body.category,
        departmentId: body.departmentId,
        folderId: body.folderId || null,
        budgetYear: body.budgetYear ?? null,
        initiatorId: user.id,
        description: body.description || null,
        estimatedAmount: body.estimatedAmount ?? null,
        acceptanceDays: 10,
        status: body.method === "electronic_shop" ? "collecting_quotes" : "draft",
        documents: { create: docs.map((d) => ({ code: d.code, title: d.title })) },
      },
      include: { documents: true, department: true, initiator: true },
    });
    await logProcChange({
      procurementId: created.id,
      userId: user.id,
      section: "Карточка",
      action: "create",
      summary: `Создана карточка №${created.serialNo} «${created.title}»`,
      details: `Тип: ${body.category}, способ: ${body.method}, год: ${body.budgetYear ?? "—"}`,
    });
    return created;
  });

  app.get("/api/procurements/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const row = await prisma.procurement.findUnique({
      where: { id },
      include: {
        department: true,
        folder: true,
        initiator: true,
        supervisorApprovedBy: { select: { id: true, fullName: true, position: true } },
        directorApprovedBy: { select: { id: true, fullName: true, position: true } },
        selectedQuote: true,
        executorUser: { select: { id: true, fullName: true, position: true } },
        documents: true,
        quotes: { include: { uploadedBy: { select: { fullName: true } }, supplier: true }, orderBy: { createdAt: "desc" } },
        payments: { include: { files: true, createdBy: { select: { fullName: true } } }, orderBy: { createdAt: "desc" } },
        memos: {
          include: {
            fromUser: true,
            agreedUser: true,
            compiledBy: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!row) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canReadContracts(user, row.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const wfInput = toWorkflowInput(row);
    return {
      ...row,
      workflow: {
        flow: getFlow(row.method),
        ...workflowSummary(wfInput),
        checks: stageChecks(wfInput),
        nextStatus: workflowNextStatus(row.method, row.status),
      },
    };
  });

  app.get("/api/procurements/:id/history", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const proc = await prisma.procurement.findUnique({ where: { id }, select: { departmentId: true } });
    if (!proc) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canReadContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const rows = await prisma.procChangeLog.findMany({
      where: { procurementId: id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, fullName: true, position: true } } },
    });
    return rows;
  });

  app.patch("/api/procurements/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        title: z.string().optional(),
        category: z.enum(["service", "supply", "telecom"]).optional(),
        description: z.string().nullable().optional(),
        estimatedAmount: z.number().nullable().optional(),
        contractNumber: z.string().nullable().optional(),
        contractDate: z.string().nullable().optional(),
        contractAmount: z.number().nullable().optional(),
        deliveryUntil: z.string().nullable().optional(),
        acceptanceStartAt: z.string().nullable().optional(),
        acceptanceDueAt: z.string().nullable().optional(),
        contractDeptNote: z.string().nullable().optional(),
        publishedAt: z.string().nullable().optional(),
        biddingStartAt: z.string().nullable().optional(),
        biddingEndAt: z.string().nullable().optional(),
        selectedQuoteId: z.string().nullable().optional(),
        folderId: z.string().nullable().optional(),
        budgetYear: z.number().int().nullable().optional(),
        executorName: z.string().nullable().optional(),
        executorUserId: z.string().nullable().optional(),
        performanceDays: z.number().int().nullable().optional(),
        acceptanceDays: z.number().int().nullable().optional(),
        actualDeliveryAt: z.string().nullable().optional(),
        validUntil: z.string().nullable().optional(),
        contractKind: z.enum(["renewable", "onetime"]).nullable().optional(),
        contractComment: z.string().nullable().optional(),
        fromArchive: z.boolean().optional(),
        documents: z.array(z.object({ id: z.string(), present: z.boolean(), note: z.string().nullable().optional() })).optional(),
      })
      .parse(req.body);
    const current = await prisma.procurement.findUnique({ where: { id } });
    if (!current) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canWriteContracts(user, current.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    if (body.budgetYear != null) {
      const allowedYears = await getContractYears();
      if (!allowedYears.includes(body.budgetYear)) {
        reply.code(400).send({ error: "Год договора нужно выбрать из списка в настройках" });
        return;
      }
    }
    if (body.selectedQuoteId) {
      const quote = await prisma.quote.findFirst({ where: { id: body.selectedQuoteId, procurementId: id } });
      if (!quote) {
        reply.code(400).send({ error: "КП не принадлежит этой закупке" });
        return;
      }
    }
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.category !== undefined) data.category = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.estimatedAmount !== undefined) data.estimatedAmount = body.estimatedAmount;
    if (body.contractNumber !== undefined) data.contractNumber = body.contractNumber;
    if (body.contractDeptNote !== undefined) data.contractDeptNote = body.contractDeptNote;
    if (body.contractAmount !== undefined) data.contractAmount = body.contractAmount;
    if (body.folderId !== undefined) data.folderId = body.folderId;
    if (body.budgetYear !== undefined) data.budgetYear = body.budgetYear;
    if (body.selectedQuoteId !== undefined) data.selectedQuoteId = body.selectedQuoteId;
    if (body.executorName !== undefined) data.executorName = body.executorName;
    if (body.executorUserId !== undefined) data.executorUserId = body.executorUserId;
    if (body.performanceDays !== undefined) data.performanceDays = body.performanceDays;
    if (body.acceptanceDays !== undefined) data.acceptanceDays = body.acceptanceDays;
    if (body.contractKind !== undefined) data.contractKind = body.contractKind;
    if (body.contractComment !== undefined) data.contractComment = body.contractComment;
    if (body.fromArchive !== undefined) data.fromArchive = body.fromArchive;
    for (const k of [
      "contractDate",
      "deliveryUntil",
      "acceptanceStartAt",
      "acceptanceDueAt",
      "publishedAt",
      "biddingStartAt",
      "biddingEndAt",
      "actualDeliveryAt",
      "validUntil",
    ] as const) {
      if (body[k] !== undefined) data[k] = body[k] ? parseDateOnly(body[k] as string) : null;
    }
    const nextContractDate = (data.contractDate as Date | null | undefined) ?? current.contractDate;
    const nextValidUntil = (data.validUntil as Date | null | undefined) ?? current.validUntil;
    const nextDelivery = (data.deliveryUntil as Date | null | undefined) ?? current.deliveryUntil;
    if (endBeforeStart(nextContractDate, nextValidUntil)) {
      reply.code(400).send({
        error: "Дата «действует до» не может быть раньше даты заключения контракта",
        fields: ["validUntil", "contractDate"],
      });
      return;
    }
    if (endBeforeStart(nextContractDate, nextDelivery)) {
      reply.code(400).send({
        error: "Срок исполнения не может быть раньше даты заключения контракта",
        fields: ["deliveryUntil", "contractDate"],
      });
      return;
    }
    const days = (data.acceptanceDays as number | null | undefined) ?? current.acceptanceDays ?? 10;
    if (data.actualDeliveryAt instanceof Date) {
      data.acceptanceStartAt = data.actualDeliveryAt;
      data.acceptanceDueAt = addDays(data.actualDeliveryAt, days);
    } else if (body.acceptanceDays !== undefined && current.actualDeliveryAt) {
      data.acceptanceDueAt = addDays(current.actualDeliveryAt, days);
    }
    const docChanges: { title: string; from: boolean; to: boolean; note?: string | null }[] = [];
    if (body.documents) {
      const existingDocs = await prisma.procDocument.findMany({ where: { procurementId: id } });
      for (const d of body.documents) {
        const cur = existingDocs.find((x) => x.id === d.id);
        if (!cur) continue;
        if (cur.present !== d.present || (d.note !== undefined && d.note !== cur.note)) {
          docChanges.push({ title: cur.title, from: cur.present, to: d.present, note: d.note });
        }
      }
    }
    const audit = describeProcPatch(current, { ...body, ...data }, docChanges);
    await prisma.procurement.update({ where: { id }, data });
    if (body.documents) {
      for (const d of body.documents) {
        await prisma.procDocument.update({ where: { id: d.id }, data: { present: d.present, note: d.note ?? undefined } });
      }
    }
    if (audit) {
      const contractFields = ["contractNumber", "contractDate", "contractAmount", "deliveryUntil", "acceptanceStartAt", "acceptanceDueAt", "contractDeptNote"];
      const hasContract = contractFields.some((k) => (body as Record<string, unknown>)[k] !== undefined);
      const hasCard = ["title", "category", "description", "estimatedAmount", "folderId", "budgetYear"].some((k) => (body as Record<string, unknown>)[k] !== undefined);
      let section = "Карточка";
      if (docChanges.length && !hasContract && !hasCard) section = "Комплект документов";
      else if (hasContract && !hasCard) section = "Контракт и приёмка";
      await logProcChange({
        procurementId: id,
        userId: user.id,
        section,
        action: "update",
        summary: audit.summary,
        details: audit.details,
      });
    }
    return prisma.procurement.findUnique({ where: { id }, include: { documents: true } });
  });

  app.delete("/api/procurements/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const current = await prisma.procurement.findUnique({ where: { id } });
    if (!current) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canDeleteContracts(user, current.departmentId)) {
      reply.code(403).send({ error: "Удалять договоры может только модератор подсистемы «Договоры»" });
      return;
    }
    await prisma.procurement.delete({ where: { id } });
    const uploadDir = path.join(config.uploadDir, id);
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
    return { ok: true };
  });

  app.post("/api/procurements/:id/status", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({ status: z.string(), comment: z.string().optional(), force: z.boolean().optional() })
      .parse(req.body);
    const current = await prisma.procurement.findUnique({
      where: { id },
      include: { documents: { select: { code: true, present: true } }, _count: { select: { quotes: true, memos: true } } },
    });
    if (!current) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canWriteContracts(user, current.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const force = Boolean(body.force) && canDeleteContracts(user, current.departmentId);
    const wfInput = toWorkflowInput(current);
    const check = validateTransition(wfInput, body.status, { force });
    if (!check.ok) {
      reply.code(400).send({
        error: check.blockers[0]?.message || "Переход на следующий этап недоступен",
        blockers: check.blockers,
        warnings: check.warnings,
      });
      return;
    }
    const updated = await prisma.procurement.update({
      where: { id },
      data: { status: body.status as never },
    });
    const st = statusChangeText(current.status, body.status, body.comment);
    const warnNote = check.warnings.length ? `\nПредупреждения: ${check.warnings.map((w) => w.message).join("; ")}` : "";
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Статус",
      action: "update",
      summary: st.summary + (force ? " (принудительно)" : ""),
      details: (st.details || "") + warnNote,
    });
    if (CONTRACT_DEPT_STATUSES.includes(body.status as never)) {
      const heads = await prisma.user.findMany({
        where: { isActive: true, OR: [{ isAdmin: true }, { departmentId: current.departmentId }] },
        select: { id: true },
      });
      await notifyMany(
        [current.initiatorId, ...heads.map((h) => h.id)],
        `Статус закупки: ${body.status}`,
        `«${current.title}» → ${body.status}${body.comment ? `. ${body.comment}` : ""}`
      );
    }
    return { ...updated, transitionWarnings: check.warnings.map((w) => w.message) };
  });

  app.post("/api/procurements/:id/approve", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        kind: z.enum(["supervisor", "director", "all"]),
        comment: z.string().optional(),
        advance: z.boolean().optional(),
      })
      .parse(req.body);
    const current = await prisma.procurement.findUnique({
      where: { id },
      include: { documents: { select: { code: true, present: true } }, _count: { select: { quotes: true, memos: true } } },
    });
    if (!current) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canWriteContracts(user, current.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const now = new Date();
    const patch: Record<string, unknown> = {};
    let targetStatus: string | null = null;
    if (body.kind === "all") {
      patch.supervisorApprovedAt = current.supervisorApprovedAt || now;
      patch.supervisorApprovedById = current.supervisorApprovedById || user.id;
      patch.directorApprovedAt = now;
      patch.directorApprovedById = user.id;
      targetStatus = "transferred";
    } else if (body.kind === "supervisor") {
      patch.supervisorApprovedAt = now;
      patch.supervisorApprovedById = user.id;
      targetStatus = current.method === "electronic_shop" ? "director_approval" : "approval";
    } else {
      patch.directorApprovedAt = now;
      patch.directorApprovedById = user.id;
      targetStatus = "transferred";
    }
    if (body.advance !== false && targetStatus) {
      const wfInput = toWorkflowInput({ ...current, ...patch, status: current.status });
      // kind="all" осознанно сжимает оба согласования в один шаг — skip_steps здесь легитимен
      const check = validateTransition(wfInput, targetStatus, { force: body.kind === "all" });
      if (check.ok) {
        patch.status = targetStatus;
      } else if (check.blockers.length) {
        reply.code(409).send({ error: check.blockers.map((b) => b.message).join(". ") });
        return;
      }
    }
    const updated = await prisma.procurement.update({ where: { id }, data: patch });
    const label = body.kind === "all" ? "пакета" : body.kind === "supervisor" ? "руководителя" : "директора";
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Согласование",
      action: "approve",
      summary: `Согласование ${label} (отметил модератор)`,
      details: body.comment || undefined,
    });
    return updated;
  });

  app.post("/api/procurements/:id/contract-file", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const procCheck = await prisma.procurement.findUnique({ where: { id }, select: { departmentId: true } });
    if (!procCheck || !canWriteContracts(user, procCheck.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const file = await req.file();
    if (!file) {
      reply.code(400).send({ error: "Нужен файл договора" });
      return;
    }
    const buf = await file.toBuffer();
    const storedName = `contract-${Date.now()}-${file.filename.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_")}`;
    const dir = path.join(config.uploadDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storedName), buf);
    let parsed = null;
    try {
      const text = await extractContractFileText(file.filename, buf);
      parsed = text ? parseContractText(text) : { warnings: ["Текст из файла не извлечён — заполните реквизиты вручную"] };
    } catch {
      parsed = { warnings: ["Не удалось прочитать файл договора — заполните реквизиты вручную"] };
    }
    const current = await prisma.procurement.findUnique({ where: { id } });
    const data: Record<string, unknown> = { contractFileName: file.filename, contractStoredName: storedName };
    if (current && parsed && typeof parsed === "object" && "contractNumber" in parsed) {
      if (!current.contractNumber && parsed.contractNumber) data.contractNumber = parsed.contractNumber;
      if (!current.contractDate && parsed.contractDate) data.contractDate = parseDateOnly(parsed.contractDate);
      if (current.contractAmount == null && parsed.contractAmount != null) data.contractAmount = parsed.contractAmount;
      if (!current.executorName && parsed.executorName) data.executorName = parsed.executorName;
      if (current.performanceDays == null && parsed.performanceDays != null) data.performanceDays = parsed.performanceDays;
      if ((current.acceptanceDays == null || current.acceptanceDays === 10) && parsed.acceptanceDays != null)
        data.acceptanceDays = parsed.acceptanceDays;
      if (!current.validUntil && parsed.validUntil) data.validUntil = parseDateOnly(parsed.validUntil);
      if (!current.deliveryUntil && parsed.deliveryUntil) data.deliveryUntil = parseDateOnly(parsed.deliveryUntil);
    }
    await prisma.procurement.update({ where: { id }, data });
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Контракт",
      action: "upload",
      summary: "Загружен файл договора",
      details: file.filename,
    });
    return { ok: true, fileName: file.filename, parsed };
  });

  app.get("/api/procurements/:id/contract-file", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const proc = await prisma.procurement.findUnique({
      where: { id },
      select: { departmentId: true, contractFileName: true, contractStoredName: true },
    });
    if (!proc?.contractStoredName) {
      reply.code(404).send({ error: "Файл договора не загружен" });
      return;
    }
    if (!canReadContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const filePath = path.join(config.uploadDir, id, proc.contractStoredName);
    if (!fs.existsSync(filePath)) {
      reply.code(404).send({ error: "Файл отсутствует на сервере" });
      return;
    }
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(proc.contractFileName || "contract")}`
    );
    return reply.send(fs.createReadStream(filePath));
  });

  app.post("/api/procurements/:id/quotes", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const procCheck = await prisma.procurement.findUnique({ where: { id }, select: { departmentId: true } });
    if (!procCheck || !canWriteContracts(user, procCheck.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const file = await req.file();
    if (!file) {
      reply.code(400).send({ error: "Нужен файл КП" });
      return;
    }
    const buf = await file.toBuffer();
    const storedName = `${Date.now()}-${file.filename.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_")}`;
    const dir = path.join(config.uploadDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storedName), buf);
    const fields = file.fields as Record<string, { value?: string } | undefined>;
    const supplierName = String(fields.supplierName?.value || "").trim();
    if (!supplierName) {
      reply.code(400).send({ error: "Наименование поставщика обязательно" });
      return;
    }
    let supplierId = fields.supplierId?.value || null;
    if (supplierId) {
      const s = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!s) supplierId = null;
    }
    if (!supplierId) {
      const found = await prisma.supplier.findFirst({
        where: { name: { equals: supplierName, mode: "insensitive" }, isActive: true },
      });
      if (found) supplierId = found.id;
      else {
        const created = await prisma.supplier.create({
          data: {
            name: supplierName,
            inn: fields.inn?.value || null,
            phone: fields.phone?.value || null,
            comment: fields.comment?.value || null,
          },
        });
        supplierId = created.id;
      }
    }
    const quote = await prisma.quote.create({
      data: {
        procurementId: id,
        supplierId,
        supplierName,
        amount: fields.amount?.value ? Number(fields.amount.value) : null,
        validUntil: fields.validUntil?.value ? parseDateOnly(fields.validUntil.value) : null,
        comment: fields.comment?.value || null,
        fileName: file.filename,
        storedName,
        uploadedById: user.id,
      },
    });
    const proc = await prisma.procurement.findUnique({ where: { id } });
    if (proc && proc.status === "draft") {
      await prisma.procurement.update({ where: { id }, data: { status: "collecting_quotes" } });
      const st = statusChangeText("draft", "collecting_quotes", "Загружено КП");
      await logProcChange({
        procurementId: id,
        userId: user.id,
        section: "Статус",
        action: "update",
        summary: st.summary,
        details: st.details,
      });
    }
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Коммерческие предложения",
      action: "upload",
      summary: `Загружено КП: ${quote.supplierName}`,
      details: `Файл: ${quote.fileName}${quote.amount ? `, сумма: ${quote.amount}` : ""}`,
    });
    const kpDoc = await prisma.procDocument.findFirst({ where: { procurementId: id, code: "kp" } });
    if (kpDoc) await prisma.procDocument.update({ where: { id: kpDoc.id }, data: { present: true } });
    return quote;
  });

  app.get("/api/quotes/:id/file", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const quote = await prisma.quote.findUnique({ where: { id }, include: { procurement: { select: { departmentId: true } } } });
    if (!quote) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canReadContracts(user, quote.procurement.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const filePath = path.join(config.uploadDir, quote.procurementId, quote.storedName);
    if (!fs.existsSync(filePath)) {
      reply.code(404).send({ error: "Файл отсутствует" });
      return;
    }
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(quote.fileName)}`);
    return reply.send(fs.createReadStream(filePath));
  });

  app.post("/api/procurements/:id/memos", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const procCheck = await prisma.procurement.findUnique({
      where: { id },
      select: { departmentId: true, status: true, method: true, _count: { select: { quotes: true } } },
    });
    if (!procCheck || !canWriteContracts(user, procCheck.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    if (procCheck.method === "electronic_shop" && procCheck._count.quotes === 0) {
      reply.code(400).send({ error: "Загрузите хотя бы одно коммерческое предложение" });
      return;
    }
    const body = z
      .object({
        addressee: z.enum(["director", "deputy_director"]),
        fromUserId: z.string(),
        agreedUserId: z.string().optional().nullable(),
        agreedPosition: z.string().min(1),
        agreedFullName: z.string().min(1),
        compiledById: z.string(),
        body: z.string().min(3),
        letterheadKind: z.enum(["department", "management"]).optional(),
      })
      .parse(req.body);
    const settings = Object.fromEntries((await prisma.setting.findMany()).map((s) => [s.key, s.value]));
    const signatory = signatoryFromSettings(settings, body.addressee);
    if (!signatory?.dative || !signatory.positionDative) {
      reply.code(400).send({
        error:
          body.addressee === "director"
            ? "Заполните должность (дательный падеж) и «Кому» для подписанта 1 в Настройки → Общие"
            : "Заполните должность (дательный падеж) и «Кому» для подписанта 2 в Настройки → Общие",
      });
      return;
    }
    const memo = await prisma.serviceMemo.create({
      data: {
        procurementId: id,
        addressee: body.addressee,
        addresseePosition: signatory.position || null,
        addresseePositionDative: signatory.positionDative,
        addresseeFullName: signatory.fullName || null,
        addresseeShortName: signatory.shortName || null,
        addresseeDative: signatory.dative,
        fromUserId: body.fromUserId,
        agreedUserId: body.agreedUserId || null,
        agreedPosition: body.agreedPosition,
        agreedFullName: body.agreedFullName,
        compiledById: body.compiledById,
        body: body.body,
        letterheadKind: body.letterheadKind || (body.addressee === "director" ? "management" : "department"),
      },
      include: { fromUser: true, agreedUser: true, compiledBy: true },
    });
    const memoDoc = await prisma.procDocument.findFirst({ where: { procurementId: id, code: "memo" } });
    if (memoDoc) await prisma.procDocument.update({ where: { id: memoDoc.id }, data: { present: true } });
    await prisma.procurement.update({ where: { id }, data: { status: "memo" } });
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Служебная записка",
      action: "create",
      summary: "Сформирована служебная записка",
      details: `Кому: ${signatory.positionDative}, ${signatory.dative}`,
    });
    const st = statusChangeText(procCheck.status ?? undefined, "memo", "Служебная записка сформирована");
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Статус",
      action: "update",
      summary: st.summary,
      details: st.details,
    });
    return memo;
  });

  app.get("/api/cabinet", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const now = new Date();
    const hasContracts = canReadContracts(user);

    const sedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        sedLastTestOk: true,
        sedPasswordEnc: true,
        sedGroupId: true,
        sedUserId: true,
        sedLogin: true,
      },
    });
    const sedReady = Boolean(
      sedUser?.sedLastTestOk &&
        sedUser.sedPasswordEnc &&
        sedUser.sedGroupId &&
        sedUser.sedUserId &&
        sedUser.sedLogin
    );

    const deptScope = contractDepartmentScope(user);
    const [mine, unread, deadlines, contracts, sed] = await Promise.all([
      hasContracts
        ? prisma.procurement.findMany({
            where: { initiatorId: user.id, ...deptScope },
            orderBy: { updatedAt: "desc" },
            take: 8,
            include: { department: true },
          })
        : [],
      prisma.notification.findMany({
        where: { userId: user.id, readAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      hasContracts
        ? prisma.procurement.findMany({
            where: {
              ...deptScope,
              status: { in: ["contracted", "execution", "acceptance_window"] },
              OR: [{ acceptanceDueAt: { not: null } }, { acceptanceStartAt: { not: null } }],
            },
            orderBy: { acceptanceDueAt: "asc" },
            take: 8,
            include: { initiator: { select: { fullName: true } } },
          })
        : [],
      hasContracts
        ? Promise.all([
            prisma.procurement.count({ where: deptScope }),
            prisma.procurement.count({ where: { ...deptScope, status: { notIn: ["completed", "rejected"] } } }),
            prisma.procurement.count({ where: { ...deptScope, status: "completed" } }),
            prisma.procurement.count({
              where: {
                ...deptScope,
                status: { in: ["contracted", "execution", "acceptance_window"] },
                acceptanceDueAt: { lt: now },
              },
            }),
            prisma.procurement.findMany({
              where: deptScope,
              take: 5,
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                serialNo: true,
                title: true,
                status: true,
                updatedAt: true,
                department: { select: { name: true } },
              },
            }),
          ]).then(([total, active, completed, overdueAcceptance, recent]) => ({
            total,
            active,
            completed,
            overdueAcceptance,
            recent,
          }))
        : null,
      sedReady ? fetchSedCabinetPreview(user.id) : null,
    ]);
    return { mine, unread, deadlines, contracts, sed };
  });

  await registerContractRoutes(app);
  await registerAdRoutes(app);
  await registerSedRoutes(app);
}
