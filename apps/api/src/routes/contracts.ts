import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/config.ts";
import { can, requireUser } from "../lib/auth.ts";
import {
  canReadContracts,
  CONTRACT_ROLE_LABELS,
  CONTRACT_ROLES,
  getContractAccess,
  requireContractRoleManage,
  requireFolderManage,
} from "../lib/contracts.ts";
import { debugTry } from "../lib/debug.ts";
import { currentYearInAppTz, pickDefaultContractYear } from "../lib/time.ts";

type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  year: number | null;
  departmentId: string | null;
  sortOrder: number;
  department: { id: string; name: string } | null;
  _count: { procurements: number; children: number };
};

type FolderNode = {
  id: string;
  name: string;
  year: number | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  sortOrder: number;
  procurementCount: number;
  directProcurementCount: number;
  childCount: number;
  children: FolderNode[];
};

function buildFolderTree(rows: FolderRow[], parentId: string | null = null): FolderNode[] {
  return rows
    .filter((r) => r.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"))
    .map((r) => {
      const children = buildFolderTree(rows, r.id);
      const childTotal = children.reduce((sum, c) => sum + c.procurementCount, 0);
      return {
        id: r.id,
        name: r.name,
        year: r.year,
        departmentId: r.departmentId,
        department: r.department,
        sortOrder: r.sortOrder,
        directProcurementCount: r._count.procurements,
        procurementCount: r._count.procurements + childTotal,
        childCount: r._count.children,
        children,
      };
    });
}

/** Собрать id папки и всех потомков для фильтра закупок */
export async function collectFolderIds(folderId: string): Promise<string[]> {
  const rows = await prisma.contractFolder.findMany({ select: { id: true, parentId: true } });
  const byParent = new Map<string | null, string[]>();
  for (const r of rows) {
    const key = r.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(r.id);
  }
  const out: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    for (const child of byParent.get(id) || []) stack.push(child);
  }
  return out;
}

/** Годы, заданные в папках договоров (Настройки → Договоры) */
export async function getContractYears(): Promise<number[]> {
  const rows = await prisma.contractFolder.findMany({
    where: { year: { not: null } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year!).sort((a, b) => b - a);
}

export async function registerContractRoutes(app: FastifyInstance) {
  app.get("/api/contracts/years", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canReadContracts(user) && !can(user, "settings", false)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const years = await getContractYears();
    const currentYear = currentYearInAppTz();
    const defaultYear = pickDefaultContractYear(years, currentYear);
    return { years, currentYear, defaultYear, timezone: "Asia/Omsk" };
  });

  app.get("/api/contracts/access", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return getContractAccess(user);
  });

  app.get("/api/contracts/meta", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canReadContracts(user) && !can(user, "settings", false)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    return {
      roles: CONTRACT_ROLES.map((id) => ({ id, name: CONTRACT_ROLE_LABELS[id] })),
    };
  });

  app.get("/api/contracts/folders", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canReadContracts(user) && !can(user, "settings", false)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const rows = await prisma.contractFolder.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        department: { select: { id: true, name: true } },
        _count: { select: { procurements: true, children: true } },
      },
    });
    return { tree: buildFolderTree(rows), flat: rows };
  });

  app.post("/api/contracts/folders", async (req, reply) => {
    const user = await requireFolderManage(req, reply);
    if (!user) return;
    return debugTry("contracts", "create folder", async () => {
      const body = z
        .object({
          name: z.string().min(1),
          parentId: z.string().nullable().optional(),
          year: z.number().int().optional().nullable(),
          departmentId: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
        })
        .parse(req.body);
      if (body.parentId) {
        const parent = await prisma.contractFolder.findUnique({ where: { id: body.parentId } });
        if (!parent) {
          reply.code(400).send({ error: "Родительская папка не найдена" });
          return;
        }
      }
      const created = await prisma.contractFolder.create({
        data: {
          name: body.name.trim(),
          parentId: body.parentId || null,
          year: body.year ?? null,
          departmentId: body.departmentId || null,
          sortOrder: body.sortOrder ?? 0,
        },
        include: { department: { select: { id: true, name: true } } },
      });
      return created;
    });
  });

  app.patch("/api/contracts/folders/:id", async (req, reply) => {
    const user = await requireFolderManage(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().min(1).optional(),
        parentId: z.string().nullable().optional(),
        year: z.number().int().nullable().optional(),
        departmentId: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
      })
      .parse(req.body);
    if (body.parentId === id) {
      reply.code(400).send({ error: "Папка не может быть родителем самой себя" });
      return;
    }
    if (body.parentId) {
      const descendants = await collectFolderIds(id);
      if (descendants.includes(body.parentId)) {
        reply.code(400).send({ error: "Нельзя переместить папку внутрь своего потомка" });
        return;
      }
    }
    return prisma.contractFolder.update({
      where: { id },
      data: {
        name: body.name?.trim(),
        parentId: body.parentId,
        year: body.year,
        departmentId: body.departmentId,
        sortOrder: body.sortOrder,
      },
      include: { department: { select: { id: true, name: true } } },
    });
  });

  app.delete("/api/contracts/folders/:id", async (req, reply) => {
    const user = await requireFolderManage(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const folder = await prisma.contractFolder.findUnique({
      where: { id },
      include: { _count: { select: { children: true, procurements: true } } },
    });
    if (!folder) {
      reply.code(404).send({ error: "Папка не найдена" });
      return;
    }
    if (folder._count.children > 0) {
      reply.code(400).send({ error: "Сначала удалите вложенные папки" });
      return;
    }
    if (folder._count.procurements > 0) {
      reply.code(400).send({ error: "В папке есть закупки — переместите их или удалите" });
      return;
    }
    await prisma.contractFolder.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/api/contracts/roles", async (req, reply) => {
    const user = await requireContractRoleManage(req, reply);
    if (!user) return;
    const rows = await prisma.userContractRole.findMany({
      orderBy: [{ role: "asc" }],
      include: {
        user: { select: { id: true, fullName: true, login: true, departmentId: true } },
        department: { select: { id: true, name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      departmentId: r.departmentId,
      department: r.department,
      user: r.user,
    }));
  });

  app.post("/api/contracts/roles", async (req, reply) => {
    const user = await requireContractRoleManage(req, reply);
    if (!user) return;
    const body = z
      .object({
        userId: z.string(),
        role: z.enum(["admin", "moderator", "operator", "auditor"]),
        departmentId: z.string().nullable().optional(),
      })
      .parse(req.body);
    const scopeKey = body.departmentId || "";
    const created = await prisma.userContractRole.upsert({
      where: { userId_role_scopeKey: { userId: body.userId, role: body.role, scopeKey } },
      update: { departmentId: body.departmentId || null },
      create: {
        userId: body.userId,
        role: body.role,
        departmentId: body.departmentId || null,
        scopeKey,
      },
      include: {
        user: { select: { id: true, fullName: true, login: true } },
        department: { select: { id: true, name: true } },
      },
    });
    return created;
  });

  app.delete("/api/contracts/roles/:id", async (req, reply) => {
    const user = await requireContractRoleManage(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    await prisma.userContractRole.delete({ where: { id } });
    return { ok: true };
  });
}
