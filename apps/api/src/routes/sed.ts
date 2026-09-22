import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/config.ts";
import { requireUser } from "../lib/auth.ts";
import { decryptSedPassword, encryptSedPassword } from "../lib/sed-crypto.ts";
import { fetchSedFile, getSedDocumentCard, getSedDocumentFiles, buildSedDocumentFilesArchive, listSedLogins, listSedOrganizations, listSedPendingDocuments, previewSedDocFile, sedContentDisposition, sedPublicConfig, testSedLogin } from "../lib/sed.ts";
import type { SedLoginInput } from "../lib/sed.ts";

function sedIntegrationDto(u: {
  sedGroupId: string | null;
  sedGroupName: string | null;
  sedUserId: string | null;
  sedLogin: string | null;
  sedPasswordEnc: string | null;
  sedConnectedAt: Date | null;
  sedLastTestAt: Date | null;
  sedLastTestOk: boolean | null;
}) {
  return {
    groupId: u.sedGroupId,
    groupName: u.sedGroupName,
    userId: u.sedUserId,
    login: u.sedLogin,
    hasPassword: Boolean(u.sedPasswordEnc),
    connectedAt: u.sedConnectedAt,
    lastTestAt: u.sedLastTestAt,
    lastTestOk: u.sedLastTestOk,
  };
}

async function loadSedLogin(userId: string, reply: { code: (n: number) => { send: (b: unknown) => void } }) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sedGroupId: true,
      sedUserId: true,
      sedLogin: true,
      sedPasswordEnc: true,
      sedLastTestOk: true,
    },
  });
  if (!row) {
    reply.code(404).send({ error: "Пользователь не найден" });
    return null;
  }
  if (!row.sedLastTestOk || !row.sedPasswordEnc || !row.sedGroupId || !row.sedUserId || !row.sedLogin) {
    reply.code(400).send({ error: "Сначала настройте и проверьте подключение к СЭД" });
    return null;
  }
  let password: string;
  try {
    password = decryptSedPassword(row.sedPasswordEnc);
  } catch {
    reply.code(400).send({ error: "Не удалось расшифровать сохранённый пароль СЭД" });
    return null;
  }
  return {
    groupId: row.sedGroupId,
    userId: row.sedUserId,
    login: row.sedLogin,
    password,
  } satisfies SedLoginInput;
}

export async function registerSedRoutes(app: FastifyInstance) {
  app.get("/api/sed/config", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return sedPublicConfig();
  });

  app.get("/api/sed/organizations", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const q = req.query as { q?: string };
    try {
      return { items: await listSedOrganizations(q.q || "") };
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/logins", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const q = req.query as { groupId?: string; q?: string };
    if (!q.groupId) {
      reply.code(400).send({ error: "Укажите организацию" });
      return;
    }
    try {
      return { items: await listSedLogins(q.groupId, q.q || "") };
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/integration", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        sedGroupId: true,
        sedGroupName: true,
        sedUserId: true,
        sedLogin: true,
        sedPasswordEnc: true,
        sedConnectedAt: true,
        sedLastTestAt: true,
        sedLastTestOk: true,
      },
    });
    if (!row) {
      reply.code(404).send({ error: "Пользователь не найден" });
      return;
    }
    return sedIntegrationDto(row);
  });

  app.put("/api/sed/integration", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        groupId: z.string().min(1),
        groupName: z.string().min(1),
        userId: z.string().min(1),
        login: z.string().min(1),
        password: z.string().min(1).optional(),
      })
      .parse(req.body);

    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { sedPasswordEnc: true },
    });
    if (!current) {
      reply.code(404).send({ error: "Пользователь не найден" });
      return;
    }

    let sedPasswordEnc = current.sedPasswordEnc;
    if (body.password) {
      sedPasswordEnc = encryptSedPassword(body.password);
    } else if (!sedPasswordEnc) {
      reply.code(400).send({ error: "Укажите пароль СЭД" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        sedGroupId: body.groupId,
        sedGroupName: body.groupName,
        sedUserId: body.userId,
        sedLogin: body.login,
        sedPasswordEnc,
      },
      select: {
        sedGroupId: true,
        sedGroupName: true,
        sedUserId: true,
        sedLogin: true,
        sedPasswordEnc: true,
        sedConnectedAt: true,
        sedLastTestAt: true,
        sedLastTestOk: true,
      },
    });
    return sedIntegrationDto(updated);
  });

  app.post("/api/sed/integration/test", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const body = z
      .object({
        groupId: z.string().optional(),
        groupName: z.string().optional(),
        userId: z.string().optional(),
        login: z.string().optional(),
        password: z.string().optional(),
      })
      .parse(req.body ?? {});

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        sedGroupId: true,
        sedGroupName: true,
        sedUserId: true,
        sedLogin: true,
        sedPasswordEnc: true,
      },
    });
    if (!row) {
      reply.code(404).send({ error: "Пользователь не найден" });
      return;
    }

    const groupId = body.groupId || row.sedGroupId;
    const userId = body.userId || row.sedUserId;
    const login = body.login || row.sedLogin;
    let password = body.password;
    if (!password && row.sedPasswordEnc) {
      try {
        password = decryptSedPassword(row.sedPasswordEnc);
      } catch {
        reply.code(400).send({ error: "Не удалось расшифровать сохранённый пароль" });
        return;
      }
    }

    if (!groupId || !userId || !login || !password) {
      reply.code(400).send({ error: "Заполните организацию, логин и пароль" });
      return;
    }

    try {
      const result = await testSedLogin({ groupId, userId, login, password });
      const now = new Date();
      const data: Record<string, unknown> = {
        sedLastTestAt: now,
        sedLastTestOk: result.ok,
      };
      if (result.ok) {
        data.sedConnectedAt = now;
        if (body.groupId) data.sedGroupId = body.groupId;
        if (body.groupName) data.sedGroupName = body.groupName;
        if (body.userId) data.sedUserId = body.userId;
        if (body.login) data.sedLogin = body.login;
        if (body.password) data.sedPasswordEnc = encryptSedPassword(body.password);
      }
      await prisma.user.update({ where: { id: user.id }, data });

      if (!result.ok) {
        reply.code(400).send({ ok: false, error: result.message });
        return;
      }
      return { ok: true, message: result.message, testedAt: now };
    } catch (e) {
      await prisma.user.update({
        where: { id: user.id },
        data: { sedLastTestAt: new Date(), sedLastTestOk: false },
      });
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/documents/pending", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const creds = await loadSedLogin(user.id, reply);
    if (!creds) return;
    const q = req.query as { follow?: string; pageSize?: string; search?: string };
    try {
      return await listSedPendingDocuments(creds, {
        followPath: q.follow,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
        search: q.search,
      });
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/documents/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) {
      reply.code(400).send({ error: "Некорректный идентификатор документа" });
      return;
    }
    const creds = await loadSedLogin(user.id, reply);
    if (!creds) return;
    try {
      return await getSedDocumentCard(creds, id);
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/documents/:id/files", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) {
      reply.code(400).send({ error: "Некорректный идентификатор документа" });
      return;
    }
    const creds = await loadSedLogin(user.id, reply);
    if (!creds) return;
    try {
      return await getSedDocumentFiles(creds, id);
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/documents/:id/files/archive", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) {
      reply.code(400).send({ error: "Некорректный идентификатор документа" });
      return;
    }
    const creds = await loadSedLogin(user.id, reply);
    if (!creds) return;
    const q = req.query as { fileIds?: string };
    const fileIds = q.fileIds?.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const archive = await buildSedDocumentFilesArchive(creds, id, fileIds);
      const encoded = encodeURIComponent(archive.name).replace(/['()]/g, escape);
      reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename*=UTF-8''${encoded}`)
        .send(archive.data);
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/documents/:id/files/:fileId/preview", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, fileId } = req.params as { id: string; fileId: string };
    if (!/^\d+$/.test(id) || !/^\d+$/.test(fileId)) {
      reply.code(400).send({ error: "Некорректный идентификатор" });
      return;
    }
    const creds = await loadSedLogin(user.id, reply);
    if (!creds) return;
    const q = req.query as { name?: string };
    let hintName: string | undefined;
    if (q.name) {
      try {
        hintName = decodeURIComponent(q.name);
      } catch {
        hintName = q.name;
      }
    }
    try {
      const preview = await previewSedDocFile(creds, fileId, hintName);
      reply.send(preview);
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.get("/api/sed/documents/:id/files/:fileId", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, fileId } = req.params as { id: string; fileId: string };
    if (!/^\d+$/.test(id) || !/^\d+$/.test(fileId)) {
      reply.code(400).send({ error: "Некорректный идентификатор" });
      return;
    }
    const creds = await loadSedLogin(user.id, reply);
    if (!creds) return;
    const q = req.query as { download?: string; name?: string };
    let hintName: string | undefined;
    if (q.name) {
      try {
        hintName = decodeURIComponent(q.name);
      } catch {
        hintName = q.name;
      }
    }
    try {
      const file = await fetchSedFile(creds, fileId, hintName);
      const inline = q.download !== "1";
      reply
        .header("Content-Type", file.contentType)
        .header("Content-Disposition", sedContentDisposition(file.name, inline))
        .send(file.data);
    } catch (e) {
      reply.code(502).send({ error: e instanceof Error ? e.message : "СЭД недоступен" });
    }
  });

  app.delete("/api/sed/integration", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        sedGroupId: null,
        sedGroupName: null,
        sedUserId: null,
        sedLogin: null,
        sedPasswordEnc: null,
        sedConnectedAt: null,
        sedLastTestAt: null,
        sedLastTestOk: null,
      },
    });
    return { ok: true };
  });
}
