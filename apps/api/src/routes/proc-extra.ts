import fs from "fs";
import path from "path";
import { z } from "zod";
import { PassThrough } from "stream";
import type { FastifyInstance } from "fastify";
import archiver from "archiver";
import { prisma, config } from "../lib/config.ts";
import { requireUser } from "../lib/auth.ts";
import { canReadContracts, canWriteContracts, contractDepartmentScope } from "../lib/contracts.ts";
import { logProcChange } from "../lib/proc-audit.ts";
import { parseDateOnly, addDays, yearOf } from "../lib/dates.ts";
import { toCsv, toSpreadsheetXml } from "../lib/proc-export.ts";
import { extractContractFileText, parseContractText } from "../lib/contract-parse.ts";
import { buildMemoDocx } from "../lib/memo-docx.ts";
import { memoAddresseeLines } from "../lib/memo-signatories.ts";
import { collectFolderIds } from "./contracts.ts";

function uploadName(original: string) {
  return `${Date.now()}-${original.replace(/[^\w.\-а-яА-ЯёЁ]+/g, "_")}`;
}

export async function registerProcExtraRoutes(app: FastifyInstance) {
  app.get("/api/suppliers", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canReadContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const q = (req.query as { q?: string }).q?.trim();
    return prisma.supplier.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { inn: { contains: q, mode: "insensitive" } },
                { comment: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 80,
    });
  });

  app.post("/api/suppliers", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canWriteContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const body = z
      .object({
        name: z.string().trim().min(1, "Наименование поставщика обязательно"),
        inn: z.string().trim().optional().nullable(),
        phone: z.string().trim().optional().nullable(),
        comment: z.string().trim().optional().nullable(),
      })
      .parse(req.body);
    const existing = await prisma.supplier.findFirst({
      where: { name: { equals: body.name, mode: "insensitive" }, isActive: true },
    });
    if (existing) {
      return prisma.supplier.update({
        where: { id: existing.id },
        data: {
          inn: body.inn ?? existing.inn,
          phone: body.phone ?? existing.phone,
          comment: body.comment ?? existing.comment,
        },
      });
    }
    return prisma.supplier.create({
      data: {
        name: body.name,
        inn: body.inn || null,
        phone: body.phone || null,
        comment: body.comment || null,
      },
    });
  });

  app.patch("/api/suppliers/:id", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canWriteContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const { id } = req.params as { id: string };
    const body = z
      .object({
        name: z.string().trim().min(1).optional(),
        inn: z.string().trim().nullable().optional(),
        phone: z.string().trim().nullable().optional(),
        comment: z.string().trim().nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return prisma.supplier.update({ where: { id }, data: body });
  });

  app.put("/api/payment-addressees", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canWriteContracts(user) && !user.isAdmin) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const body = z.object({ names: z.array(z.string()) }).parse(req.body);
    const value = JSON.stringify(body.names.map((n) => n.trim()).filter(Boolean));
    await prisma.setting.upsert({
      where: { key: "payment_addressees" },
      update: { value },
      create: { key: "payment_addressees", value },
    });
    return { ok: true };
  });

  app.get("/api/letterheads", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    return prisma.memoLetterhead.findMany({ include: { department: { select: { id: true, name: true } } } });
  });

  app.put("/api/letterheads", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!user.isAdmin && !canWriteContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const body = z
      .object({
        departmentId: z.string().nullable(),
        title: z.string().trim().min(1),
        body: z.string(),
      })
      .parse(req.body);
    const existing = await prisma.memoLetterhead.findFirst({
      where: body.departmentId ? { departmentId: body.departmentId } : { departmentId: null },
    });
    if (existing) {
      return prisma.memoLetterhead.update({
        where: { id: existing.id },
        data: { title: body.title, body: body.body },
      });
    }
    return prisma.memoLetterhead.create({
      data: { departmentId: body.departmentId, title: body.title, body: body.body },
    });
  });

  app.get("/api/procurements/export", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canReadContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const q = req.query as { format?: string; year?: string; yearField?: string };
    const where = await listWhere(user, q);
    const rows = await prisma.procurement.findMany({
      where,
      orderBy: { serialNo: "asc" },
      include: {
        department: { select: { name: true } },
        initiator: { select: { fullName: true } },
        selectedQuote: { select: { supplierName: true } },
        payments: { select: { amount: true, paidAt: true, addressee: true } },
      },
    });
    const format = q.format === "csv" ? "csv" : "xls";
    if (format === "csv") {
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", "attachment; filename*=UTF-8''contracts.csv");
      return reply.send(toCsv(rows));
    }
    reply.header("Content-Type", "application/vnd.ms-excel");
    reply.header("Content-Disposition", "attachment; filename*=UTF-8''contracts.xls");
    return reply.send(toSpreadsheetXml(rows));
  });

  app.post("/api/procurements/import-archive", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!canWriteContracts(user)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const body = z
      .object({
        rows: z.array(
          z.object({
            title: z.string().min(1),
            departmentId: z.string().optional(),
            departmentCode: z.string().optional(),
            category: z.enum(["service", "supply", "telecom"]).optional(),
            supplierName: z.string().optional(),
            inn: z.string().optional(),
            contractNumber: z.string().optional(),
            contractDate: z.string().optional(),
            contractAmount: z.number().optional(),
            validUntil: z.string().optional(),
            deliveryUntil: z.string().optional(),
            budgetYear: z.number().optional(),
            status: z.string().optional(),
          })
        ),
      })
      .parse(req.body);
    const departments = await prisma.department.findMany();
    const created: string[] = [];
    for (const row of body.rows) {
      const dept =
        departments.find((d) => d.id === row.departmentId) ||
        departments.find((d) => d.code === row.departmentCode) ||
        departments[0];
      if (!dept) continue;
      let supplier = null;
      if (row.supplierName?.trim()) {
        supplier = await prisma.supplier.findFirst({
          where: { name: { equals: row.supplierName.trim(), mode: "insensitive" } },
        });
        if (!supplier) {
          supplier = await prisma.supplier.create({
            data: { name: row.supplierName.trim(), inn: row.inn || null },
          });
        }
      }
      const serialNo = await nextSerial();
      const proc = await prisma.procurement.create({
        data: {
          serialNo,
          title: row.title,
          law: "fz44",
          method: "electronic_shop",
          category: row.category || "service",
          status: (row.status as never) || "execution",
          departmentId: dept.id,
          initiatorId: user.id,
          budgetYear: row.budgetYear || yearOf(row.contractDate) || null,
          contractNumber: row.contractNumber || null,
          contractDate: parseDateOnly(row.contractDate),
          contractAmount: row.contractAmount ?? null,
          validUntil: parseDateOnly(row.validUntil),
          deliveryUntil: parseDateOnly(row.deliveryUntil),
          fromArchive: true,
          acceptanceDays: 10,
        },
      });
      if (supplier) {
        const quote = await prisma.quote.create({
          data: {
            procurementId: proc.id,
            supplierId: supplier.id,
            supplierName: supplier.name,
            fileName: "archive.txt",
            storedName: "archive.txt",
            uploadedById: user.id,
            amount: row.contractAmount ?? null,
          },
        });
        await prisma.procurement.update({ where: { id: proc.id }, data: { selectedQuoteId: quote.id } });
      }
      created.push(proc.id);
    }
    return { ok: true, count: created.length, ids: created };
  });

  app.get("/api/procurements/:id/archive", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const proc = await prisma.procurement.findUnique({
      where: { id },
      include: {
        quotes: true,
        documents: true,
        payments: { include: { files: true } },
      },
    });
    if (!proc) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    if (!canReadContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    reply.header("Content-Type", "application/zip");
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`dogovor-${proc.serialNo}.zip`)}`
    );
    const stream = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => stream.destroy(err));
    archive.pipe(stream);
    const dir = path.join(config.uploadDir, id);
    if (proc.contractStoredName) {
      const p = path.join(dir, proc.contractStoredName);
      if (fs.existsSync(p)) archive.file(p, { name: `dogovor/${proc.contractFileName || proc.contractStoredName}` });
    }
    for (const doc of proc.documents) {
      if (!doc.storedName) continue;
      const p = path.join(dir, doc.storedName);
      if (fs.existsSync(p)) archive.file(p, { name: `komplekt/${doc.code}-${doc.fileName || doc.storedName}` });
    }
    for (const q of proc.quotes) {
      const p = path.join(dir, q.storedName);
      if (fs.existsSync(p)) archive.file(p, { name: `kp/${q.supplierName}-${q.fileName}` });
    }
    for (const pay of proc.payments) {
      for (const f of pay.files) {
        const p = path.join(dir, f.storedName);
        if (fs.existsSync(p)) archive.file(p, { name: `oplata/${pay.addressee}-${f.fileName}` });
      }
    }
    void archive.finalize();
    return reply.send(stream);
  });

  // Файл документа комплекта (обоснование, ТЗ, спецификация…)
  app.post("/api/procurements/:id/documents/:docId/file", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, docId } = req.params as { id: string; docId: string };
    const doc = await prisma.procDocument.findFirst({
      where: { id: docId, procurementId: id },
      include: { procurement: { select: { departmentId: true } } },
    });
    if (!doc || !canWriteContracts(user, doc.procurement.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const file = await req.file();
    if (!file) {
      reply.code(400).send({ error: "Нужен файл" });
      return;
    }
    const buf = await file.toBuffer();
    const dir = path.join(config.uploadDir, id);
    fs.mkdirSync(dir, { recursive: true });
    const storedName = `doc-${docId}-${uploadName(file.filename)}`;
    fs.writeFileSync(path.join(dir, storedName), buf);
    if (doc.storedName) {
      const old = path.join(dir, doc.storedName);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    const updated = await prisma.procDocument.update({
      where: { id: docId },
      data: { fileName: file.filename, storedName, present: true },
    });
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Комплект документов",
      action: "upload",
      summary: `Файл к «${doc.title}»`,
      details: file.filename,
    });
    return updated;
  });

  app.delete("/api/procurements/:id/documents/:docId/file", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, docId } = req.params as { id: string; docId: string };
    const doc = await prisma.procDocument.findFirst({
      where: { id: docId, procurementId: id },
      include: { procurement: { select: { departmentId: true } } },
    });
    if (!doc || !canWriteContracts(user, doc.procurement.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    if (doc.storedName) {
      const p = path.join(config.uploadDir, id, doc.storedName);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const updated = await prisma.procDocument.update({
      where: { id: docId },
      data: { fileName: null, storedName: null, present: false },
    });
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Комплект документов",
      action: "delete",
      summary: `Удалён файл «${doc.title}»`,
      details: doc.fileName || undefined,
    });
    return updated;
  });

  app.get("/api/proc-documents/:docId/file", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { docId } = req.params as { docId: string };
    const doc = await prisma.procDocument.findUnique({
      where: { id: docId },
      include: { procurement: { select: { departmentId: true } } },
    });
    if (!doc?.storedName || !canReadContracts(user, doc.procurement.departmentId)) {
      reply.code(doc?.storedName ? 403 : 404).send({ error: "Файл не найден" });
      return;
    }
    const filePath = path.join(config.uploadDir, doc.procurementId, doc.storedName);
    if (!fs.existsSync(filePath)) {
      reply.code(404).send({ error: "Файл отсутствует на сервере" });
      return;
    }
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName || "document")}`
    );
    return reply.send(fs.createReadStream(filePath));
  });

  app.get("/api/procurements/:id/memos/:memoId/docx", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, memoId } = req.params as { id: string; memoId: string };
    const memo = await prisma.serviceMemo.findFirst({
      where: { id: memoId, procurementId: id },
      include: {
        fromUser: true,
        compiledBy: true,
        procurement: { include: { department: true } },
      },
    });
    if (!memo) {
      reply.code(404).send({ error: "СЗ не найдена" });
      return;
    }
    if (!canReadContracts(user, memo.procurement.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const kind = memo.letterheadKind === "management" ? null : memo.procurement.departmentId;
    const letter =
      (await prisma.memoLetterhead.findFirst({
        where: kind ? { departmentId: kind } : { departmentId: null },
      })) ||
      (await prisma.memoLetterhead.findFirst({ where: { departmentId: null } }));
    const letterhead =
      letter?.body?.trim() ||
      `Бюджетное учреждение города Омска\n«Управление дорожного хозяйства и благоустройства»${
        kind ? `\n${memo.procurement.department.name}` : ""
      }`;
    const buf = await buildMemoDocx({
      letterhead,
      addresseeLines: memoAddresseeLines(memo),
      fromLine: `От: ${memo.fromUser.position || "сотрудник"}, ${memo.fromUser.fullName}`,
      agreedLine: `Согласовано: ${memo.agreedPosition}, ${memo.agreedFullName}`,
      body: memo.body,
      compiledLine: `Составил: ${memo.compiledBy.position || "сотрудник"}, ${memo.compiledBy.fullName}`,
      dateLine: new Date(memo.createdAt).toLocaleDateString("ru-RU"),
    });
    reply.header(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    reply.header(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`SZ-${memo.procurement.serialNo}.docx`)}`
    );
    return reply.send(buf);
  });

  app.patch("/api/procurements/:id/memos/:memoId", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, memoId } = req.params as { id: string; memoId: string };
    const proc = await prisma.procurement.findUnique({ where: { id } });
    if (!proc || !canWriteContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const body = z
      .object({
        addressee: z.enum(["director", "deputy_director"]).optional(),
        fromUserId: z.string().optional(),
        agreedUserId: z.string().nullable().optional(),
        agreedPosition: z.string().optional(),
        agreedFullName: z.string().optional(),
        compiledById: z.string().optional(),
        body: z.string().min(3).optional(),
        letterheadKind: z.enum(["department", "management"]).optional(),
      })
      .parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.addressee) {
      const settings = Object.fromEntries((await prisma.setting.findMany()).map((s) => [s.key, s.value]));
      const { signatoryFromSettings } = await import("../lib/memo-signatories.ts");
      const signatory = signatoryFromSettings(settings, body.addressee);
      if (signatory) {
        data.addresseePosition = signatory.position || null;
        data.addresseePositionDative = signatory.positionDative;
        data.addresseeFullName = signatory.fullName || null;
        data.addresseeShortName = signatory.shortName || null;
        data.addresseeDative = signatory.dative;
      }
    }
    const updated = await prisma.serviceMemo.update({
      where: { id: memoId },
      data,
      include: { fromUser: true, agreedUser: true, compiledBy: true },
    });
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Служебная записка",
      action: "update",
      summary: "Исправлена служебная записка",
    });
    return updated;
  });

  app.get("/api/procurements/:id/payments", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const proc = await prisma.procurement.findUnique({ where: { id }, select: { departmentId: true } });
    if (!proc || !canReadContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    return prisma.procPayment.findMany({
      where: { procurementId: id },
      orderBy: { createdAt: "desc" },
      include: { files: true, createdBy: { select: { fullName: true } } },
    });
  });

  app.post("/api/procurements/:id/payments", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id } = req.params as { id: string };
    const proc = await prisma.procurement.findUnique({ where: { id } });
    if (!proc || !canWriteContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const body = z
      .object({
        amount: z.number().nullable().optional(),
        paidAt: z.string().nullable().optional(),
        addressee: z.string().trim().min(1),
        memoText: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(req.body);
    const row = await prisma.procPayment.create({
      data: {
        procurementId: id,
        amount: body.amount ?? null,
        paidAt: parseDateOnly(body.paidAt),
        addressee: body.addressee,
        memoText: body.memoText || null,
        note: body.note || null,
        createdById: user.id,
      },
      include: { files: true },
    });
    await logProcChange({
      procurementId: id,
      userId: user.id,
      section: "Оплата",
      action: "create",
      summary: `Оплата: ${body.addressee}`,
      details: body.amount != null ? `Сумма ${body.amount}` : null,
    });
    return row;
  });

  app.delete("/api/procurements/:id/payments/:paymentId", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, paymentId } = req.params as { id: string; paymentId: string };
    const proc = await prisma.procurement.findUnique({ where: { id } });
    if (!proc || !canWriteContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    await prisma.procPayment.delete({ where: { id: paymentId } });
    return { ok: true };
  });

  app.post("/api/procurements/:id/payments/:paymentId/files", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { id, paymentId } = req.params as { id: string; paymentId: string };
    const proc = await prisma.procurement.findUnique({ where: { id } });
    if (!proc || !canWriteContracts(user, proc.departmentId)) {
      reply.code(403).send({ error: "Недостаточно прав" });
      return;
    }
    const file = await req.file();
    if (!file) {
      reply.code(400).send({ error: "Нужен файл" });
      return;
    }
    const buf = await file.toBuffer();
    const storedName = uploadName(file.filename);
    const dir = path.join(config.uploadDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storedName), buf);
    return prisma.procPaymentFile.create({
      data: { paymentId, fileName: file.filename, storedName },
    });
  });

  app.get("/api/payment-files/:fileId", async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const { fileId } = req.params as { fileId: string };
    const file = await prisma.procPaymentFile.findUnique({
      where: { id: fileId },
      include: { payment: { include: { procurement: { select: { id: true, departmentId: true } } } } },
    });
    if (!file || !canReadContracts(user, file.payment.procurement.departmentId)) {
      reply.code(404).send({ error: "Не найдено" });
      return;
    }
    const filePath = path.join(config.uploadDir, file.payment.procurement.id, file.storedName);
    if (!fs.existsSync(filePath)) {
      reply.code(404).send({ error: "Файл отсутствует" });
      return;
    }
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    return reply.send(fs.createReadStream(filePath));
  });
}

async function nextSerial() {
  const { nextProcurementSerialNo } = await import("../lib/proc-serial.ts");
  return nextProcurementSerialNo();
}

export async function listWhere(user: { isAdmin: boolean; contractRoles: { role: string; departmentId: string | null }[]; permissions: { resource: string; canRead: boolean; canWrite: boolean }[] }, q: Record<string, string | undefined>) {
  let folderIds: string[] | undefined;
  if (q.folderId) folderIds = await collectFolderIds(q.folderId);
  const deptScope = contractDepartmentScope(user as never);
  let departmentId: string | { in: string[] } | undefined = q.departmentId || undefined;
  if (deptScope.departmentId) {
    if (departmentId && typeof departmentId === "string") {
      if (!deptScope.departmentId.in.includes(departmentId)) return { id: "__none__" };
    } else {
      departmentId = deptScope.departmentId;
    }
  }
  const year = q.year || q.budgetYear;
  const yearField = q.yearField || "any";
  const yearNum = year ? Number(year) : null;
  const yearFilter =
    yearNum && Number.isFinite(yearNum)
      ? yearField === "budget"
        ? { budgetYear: yearNum }
        : yearField === "contract"
          ? {
              contractDate: {
                gte: new Date(`${yearNum}-01-01T00:00:00.000Z`),
                lt: new Date(`${yearNum + 1}-01-01T00:00:00.000Z`),
              },
            }
          : yearField === "payment"
            ? {
                payments: {
                  some: {
                    paidAt: {
                      gte: new Date(`${yearNum}-01-01T00:00:00.000Z`),
                      lt: new Date(`${yearNum + 1}-01-01T00:00:00.000Z`),
                    },
                  },
                },
              }
            : {
                OR: [
                  { budgetYear: yearNum },
                  {
                    contractDate: {
                      gte: new Date(`${yearNum}-01-01T00:00:00.000Z`),
                      lt: new Date(`${yearNum + 1}-01-01T00:00:00.000Z`),
                    },
                  },
                  {
                    payments: {
                      some: {
                        paidAt: {
                          gte: new Date(`${yearNum}-01-01T00:00:00.000Z`),
                          lt: new Date(`${yearNum + 1}-01-01T00:00:00.000Z`),
                        },
                      },
                    },
                  },
                ],
              }
      : {};
  const supplier = q.supplier?.trim();
  const and: Record<string, unknown>[] = [];
  const search = q.q?.trim();
  if (search) {
    for (const t of search.split(/\s+/).filter(Boolean).slice(0, 6)) {
      const or: Record<string, unknown>[] = [
        { title: { contains: t, mode: "insensitive" as const } },
        { contractNumber: { contains: t, mode: "insensitive" as const } },
        { executorName: { contains: t, mode: "insensitive" as const } },
        { description: { contains: t, mode: "insensitive" as const } },
        { initiator: { fullName: { contains: t, mode: "insensitive" as const } } },
        { department: { name: { contains: t, mode: "insensitive" as const } } },
        { selectedQuote: { supplierName: { contains: t, mode: "insensitive" as const } } },
        { quotes: { some: { supplierName: { contains: t, mode: "insensitive" as const } } } },
      ];
      const num = t.replace(/^[#№]/, "");
      if (/^\d+$/.test(num)) or.push({ serialNo: Number(num) });
      and.push({ OR: or });
    }
  }
  if (supplier) {
    and.push({
      OR: [
        { selectedQuote: { supplierName: { contains: supplier, mode: "insensitive" as const } } },
        { executorName: { contains: supplier, mode: "insensitive" as const } },
      ],
    });
  }
  if (yearFilter && Object.keys(yearFilter).length) and.push(yearFilter);
  return {
    status: q.status ? (q.status as never) : undefined,
    category: q.category ? (q.category as never) : undefined,
    departmentId,
    folderId: folderIds ? { in: folderIds } : undefined,
    fromArchive: q.archive === "1" ? true : q.archive === "0" ? false : undefined,
    ...(and.length ? { AND: and } : {}),
  };
}

export { addDays, parseDateOnly };
