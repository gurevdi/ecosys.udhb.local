import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { DOCUMENT_PACKAGES } from "../src/lib/catalog.ts";
import { config } from "../src/lib/config.ts";
import { MEMO_SIGNATORY_SETTING_KEYS } from "../src/lib/memo-signatories.ts";
import { nextProcurementSerialNo } from "../src/lib/proc-serial.ts";
import { currentYearInAppTz } from "../src/lib/time.ts";

const prisma = new PrismaClient();

/**
 * Демо-наполнение для разработки: пользователи, поставщики, карточки
 * во всех статусах, КП, СЗ, оплаты, уведомления.
 *
 * Идемпотентно: тестовые карточки помечены префиксом «[тест]» и
 * пересоздаются при повторном запуске. Запуск: npm run seed:dev
 */

const TEST_PREFIX = "[тест]";
const TEST_PASSWORD = "Test123!";

function d(s: string) {
  return new Date(`${s}T12:00:00+06:00`);
}
function addDays(base: Date, days: number) {
  const t = new Date(base);
  t.setDate(t.getDate() + days);
  return t;
}

/** Минимальный валидный PDF-файл для демо-вложений */
function stubPdf(text: string) {
  const content = `BT /F1 12 Tf 40 750 Td (${text}) Tj ET`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n` +
      `2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n` +
      `trailer<</Root 1 0 R>>\n%%EOF`,
    "latin1",
  );
}

async function main() {
  // Базовый сид: отделы, admin, папки годов, настройки — переиспользуем как есть
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

  const year = currentYearInAppTz();
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);

  const deptIoib = await prisma.department.findUniqueOrThrow({ where: { code: "ioib" } });
  const deptVideo = await prisma.department.findUniqueOrThrow({ where: { code: "video" } });
  const deptNav = await prisma.department.findUniqueOrThrow({ where: { code: "nav" } });
  const deptBuh = await prisma.department.upsert({
    where: { code: "buh" },
    update: { name: "Бухгалтерия" },
    create: { code: "buh", name: "Бухгалтерия" },
  });
  const departments = [deptIoib, deptVideo, deptNav];
  const admin = await prisma.user.findUniqueOrThrow({ where: { login: "admin" } });

  // ---------- Пользователи ----------
  const testUsers: {
    login: string;
    fullName: string;
    position: string;
    departmentId: string;
    email?: string;
    source?: "local" | "ad";
    adDn?: string;
    adGroups?: string[];
    role?: "admin" | "moderator" | "operator" | "auditor";
    roleDeptId?: string | null;
    canWriteContracts?: boolean;
  }[] = [
    {
      login: "moderator", fullName: "Модераторова Анна Сергеевна", position: "Ведущий специалист",
      departmentId: deptIoib.id, email: "moderator@udhb.local",
      role: "moderator", canWriteContracts: true,
    },
    {
      login: "operator", fullName: "Операторов Ярослав Игоревич", position: "Специалист ОИиИБ",
      departmentId: deptIoib.id, email: "operator@udhb.local",
      role: "operator", roleDeptId: deptIoib.id, canWriteContracts: true,
    },
    {
      login: "auditor", fullName: "Ревизорова Ольга Павловна", position: "Контролёр",
      departmentId: deptBuh.id, role: "auditor",
    },
    {
      login: "ivanov", fullName: "Иванов Пётр Николаевич", position: "Инженер видеонаблюдения",
      departmentId: deptVideo.id, role: "operator", roleDeptId: deptVideo.id, canWriteContracts: true,
    },
    {
      login: "petrov", fullName: "Петрова Мария Дмитриевна", position: "Техник навигации",
      departmentId: deptNav.id, source: "ad", adDn: "CN=Петрова Мария,OU=Users,DC=udhb,DC=local",
      adGroups: ["ECOSYS-Users", "Отдел навигационных систем"],
    },
    {
      login: "sidorov", fullName: "Сидоров Олег Викторович", position: "Гл. специалист (уволен)",
      departmentId: deptVideo.id, source: "ad",
      adDn: "CN=Сидоров Олег,OU=Users,DC=udhb,DC=local", adGroups: ["ECOSYS-Users"],
    },
  ];

  const users: Record<string, { id: string; fullName: string }> = { admin };
  for (const u of testUsers) {
    const user = await prisma.user.upsert({
      where: { login: u.login },
      update: { isActive: u.login !== "sidorov", adAccountDisabled: u.login === "sidorov" },
      create: {
        login: u.login,
        passwordHash: hash,
        fullName: u.fullName,
        position: u.position,
        email: u.email || null,
        departmentId: u.departmentId,
        source: u.source || "local",
        adDn: u.adDn || null,
        adGroups: (u.adGroups as Prisma.InputJsonValue) || undefined,
        adSyncedAt: u.source === "ad" ? new Date() : null,
        isActive: u.login !== "sidorov",
        adAccountDisabled: u.login === "sidorov",
      },
    });
    users[u.login] = user;

    await prisma.userPermission.upsert({
      where: { userId_resource: { userId: user.id, resource: "contracts" } },
      update: { canRead: true, canWrite: Boolean(u.canWriteContracts) },
      create: { userId: user.id, resource: "contracts", canRead: true, canWrite: Boolean(u.canWriteContracts) },
    });
    if (u.role) {
      const scopeKey = u.roleDeptId || "";
      const exists = await prisma.userContractRole.findFirst({
        where: { userId: user.id, role: u.role, scopeKey },
      });
      if (!exists) {
        await prisma.userContractRole.create({
          data: { userId: user.id, role: u.role, departmentId: u.roleDeptId ?? null, scopeKey },
        });
      }
    }
  }

  // ---------- Маппинги групп AD ----------
  for (const [i, m] of [
    { adGroup: "ECOSYS-Admins", label: "Администраторы экосистемы", isAdmin: true, permissions: ["contracts", "users", "directory", "settings"], contractRoles: [] as object[] },
    { adGroup: "ECOSYS-Contracts", label: "Специалисты договорной работы", isAdmin: false, permissions: ["contracts"], contractRoles: [{ role: "operator", departmentCode: "ioib" }] },
  ].entries()) {
    await prisma.adGroupMapping.upsert({
      where: { adGroup: m.adGroup },
      update: {},
      create: {
        adGroup: m.adGroup,
        label: m.label,
        isAdmin: m.isAdmin,
        permissions: m.permissions as Prisma.InputJsonValue,
        contractRoles: m.contractRoles as Prisma.InputJsonValue,
        sortOrder: i,
      },
    });
  }

  // ---------- Подписанты СЗ ----------
  await prisma.setting.upsert({
    where: { key: MEMO_SIGNATORY_SETTING_KEYS.director },
    update: {},
    create: {
      key: MEMO_SIGNATORY_SETTING_KEYS.director,
      value: JSON.stringify({
        position: "Директор БУ г. Омска «УДХБ»",
        positionDative: "директору БУ г. Омска «УДХБ»",
        fullName: "Тыщенко Андрей Владимирович",
        shortName: "Тыщенко А.В.",
        dative: "Тыщенко Андрею Владимировичу",
      }),
    },
  });
  await prisma.setting.upsert({
    where: { key: MEMO_SIGNATORY_SETTING_KEYS.deputy },
    update: {},
    create: {
      key: MEMO_SIGNATORY_SETTING_KEYS.deputy,
      value: JSON.stringify({
        position: "Заместитель директора",
        positionDative: "заместителю директора",
        fullName: "Матюхина Елена Борисовна",
        shortName: "Матюхина Е.Б.",
        dative: "Матюхиной Елене Борисовне",
      }),
    },
  });

  // ---------- Шапки СЗ по отделам ----------
  for (const dept of departments) {
    const exists = await prisma.memoLetterhead.findFirst({ where: { departmentId: dept.id } });
    if (!exists) {
      await prisma.memoLetterhead.create({
        data: {
          departmentId: dept.id,
          title: `Шапка: ${dept.name}`,
          body: `Бюджетное учреждение города Омска\n«Управление дорожного хозяйства и благоустройства»\n${dept.name}`,
        },
      });
    }
  }

  // ---------- Поставщики ----------
  const supplierDefs = [
    { name: "ООО «ОКС»", inn: "5501234567", phone: "+7 (3812) 45-67-89", comment: "Кабельные сети, менеджер Игорь" },
    { name: "ООО «Техносерв»", inn: "5502345678", phone: "+7 (3812) 55-12-34", comment: "Серверное и сетевое оборудование" },
    { name: "АО «Дом.ru Бизнес»", inn: "6663123456", phone: "8-800-333-7000", comment: "Интернет и VPN-каналы" },
    { name: "ПАО «Ростелеком»", inn: "7707049388", phone: "8-800-100-0800", comment: "Телефония, каналы связи" },
    { name: "ООО «ЭР-Телеком»", inn: "5902199733", phone: "+7 (3812) 246-000", comment: null },
    { name: "ООО «Инфорсер Инжиниринг»", inn: "5504567890", phone: "+7 (3812) 90-11-22", comment: "Лицензии ПО, СХД" },
    { name: "ООО «СибирьТелеком»", inn: "5505678901", phone: null, comment: "Менеджер часто в отпуске — писать на общий ящик" },
    { name: "ИП Ковалёв А.С.", inn: "550678901234", phone: "+7 913 600-11-22", comment: "Мелкий ремонт оборудования" },
  ];
  const suppliers: Record<string, { id: string; name: string }> = {};
  for (const s of supplierDefs) {
    const row = await prisma.supplier.findFirst({ where: { name: s.name } });
    suppliers[s.name] = row ?? (await prisma.supplier.create({ data: s }));
  }

  // ---------- Папки: год → отдел ----------
  const yearFolders: Record<number, string> = {};
  for (const y of [year - 1, year, year + 1]) {
    const f = await prisma.contractFolder.findFirst({ where: { parentId: null, year: y } });
    if (f) yearFolders[y] = f.id;
  }
  async function deptFolder(y: number, deptId: string, name: string) {
    const parentId = yearFolders[y];
    if (!parentId) return null;
    const exists = await prisma.contractFolder.findFirst({ where: { parentId, departmentId: deptId } });
    if (exists) return exists.id;
    const created = await prisma.contractFolder.create({
      data: { name, parentId, departmentId: deptId, sortOrder: 10 },
    });
    return created.id;
  }
  const folderIoib = await deptFolder(year, deptIoib.id, "ОИиИБ");
  const folderVideo = await deptFolder(year, deptVideo.id, "Видеонаблюдение");
  const folderNav = await deptFolder(year, deptNav.id, "Навигация");
  const folderIoibPrev = await deptFolder(year - 1, deptIoib.id, "ОИиИБ");

  // ---------- Карточки договоров ----------
  await prisma.procurement.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } });

  type Card = {
    title: string;
    method: "electronic_shop" | "auction";
    category: "service" | "supply" | "telecom";
    status:
      | "draft" | "collecting_quotes" | "memo" | "approval" | "supervisor_approval"
      | "director_approval" | "transferred" | "returned" | "published" | "bidding"
      | "contracted" | "execution" | "acceptance_window" | "completed" | "rejected";
    dept: string;
    initiator: string;
    estimated: number;
    budgetYear: number;
    folderId?: string | null;
    contract?: { number: string; date: string; amount: number; validUntil: string; deliveryUntil?: string };
    supplier?: string;
    quotes?: { supplier: string; amount: number }[];
    memo?: boolean;
    docsPresent?: number;
    payments?: { amount: number; paidAt: string; addressee: string; note?: string }[];
    actualDeliveryAt?: string;
    acceptanceOverdue?: boolean;
    fromArchive?: boolean;
    description?: string;
  };

  const cards: Card[] = [
    // --- Черновики и ранние этапы ---
    { title: `${TEST_PREFIX} Замена АКБ в ИБП серверной`, method: "electronic_shop", category: "supply", status: "draft", dept: deptIoib.id, initiator: "operator", estimated: 84000, budgetYear: year, folderId: folderIoib },
    { title: `${TEST_PREFIX} Камеры перекрёстка Ленина–Масленникова`, method: "electronic_shop", category: "supply", status: "collecting_quotes", dept: deptVideo.id, initiator: "ivanov", estimated: 460000, budgetYear: year, folderId: folderVideo, docsPresent: 1 },
    { title: `${TEST_PREFIX} Лицензии антивируса на 120 рабочих мест`, method: "electronic_shop", category: "service", status: "collecting_quotes", dept: deptIoib.id, initiator: "moderator", estimated: 180000, budgetYear: year, folderId: folderIoib, docsPresent: 2, quotes: [{ supplier: "ООО «Инфорсер Инжиниринг»", amount: 176500 }] },
    // --- СЗ и согласование ---
    { title: `${TEST_PREFIX} Wi-Fi мост ЦПКиО — ст. Нефтяников`, method: "electronic_shop", category: "telecom", status: "memo", dept: deptIoib.id, initiator: "operator", estimated: 240000, budgetYear: year, folderId: folderIoib, docsPresent: 3, memo: true, quotes: [{ supplier: "ООО «ОКС»", amount: 234900 }, { supplier: "ООО «СибирьТелеком»", amount: 249800 }] },
    { title: `${TEST_PREFIX} Аудит каналов связи филиалов`, method: "electronic_shop", category: "telecom", status: "supervisor_approval", dept: deptNav.id, initiator: "petrov", estimated: 95000, budgetYear: year, folderId: folderNav, docsPresent: 4, memo: true, quotes: [{ supplier: "ПАО «Ростелеком»", amount: 92000 }, { supplier: "АО «Дом.ru Бизнес»", amount: 98500 }] },
    { title: `${TEST_PREFIX} ТО системы видеонаблюдения, квартал`, method: "electronic_shop", category: "service", status: "director_approval", dept: deptVideo.id, initiator: "ivanov", estimated: 120000, budgetYear: year, folderId: folderVideo, docsPresent: 4, memo: true, quotes: [{ supplier: "ООО «Техносерв»", amount: 118000 }] },
    { title: `${TEST_PREFIX} Модернизация СКУД проходной`, method: "auction", category: "service", status: "transferred", dept: deptIoib.id, initiator: "moderator", estimated: 780000, budgetYear: year, folderId: folderIoib, docsPresent: 5 },
    { title: `${TEST_PREFIX} Аукцион: уборка территорий, ТЗ`, method: "auction", category: "service", status: "approval", dept: deptVideo.id, initiator: "ivanov", estimated: 540000, budgetYear: year, folderId: folderVideo, docsPresent: 5, memo: true },
    { title: `${TEST_PREFIX} Поставка кабеля ВОЛС`, method: "auction", category: "supply", status: "published", dept: deptIoib.id, initiator: "operator", estimated: 350000, budgetYear: year, folderId: folderIoib, docsPresent: 5 },
    { title: `${TEST_PREFIX} Услуги связи ЦОД, год`, method: "auction", category: "telecom", status: "bidding", dept: deptNav.id, initiator: "petrov", estimated: 620000, budgetYear: year, folderId: folderNav, docsPresent: 5 },
    { title: `${TEST_PREFIX} Ремонт радиорелейного пролёта`, method: "auction", category: "service", status: "returned", dept: deptNav.id, initiator: "petrov", estimated: 410000, budgetYear: year, folderId: folderNav, docsPresent: 4, description: "Возвращено договорным отделом: доработать ТЗ" },
    { title: `${TEST_PREFIX} Закупка картриджей (отменена)`, method: "electronic_shop", category: "supply", status: "rejected", dept: deptIoib.id, initiator: "operator", estimated: 45000, budgetYear: year, folderId: folderIoib },
    // --- Контракт и исполнение ---
    {
      title: `${TEST_PREFIX} Интернет-канал офис 100 Мбит/с`, method: "electronic_shop", category: "telecom", status: "contracted",
      dept: deptIoib.id, initiator: "operator", estimated: 360000, budgetYear: year, folderId: folderIoib, docsPresent: 4, memo: true,
      supplier: "АО «Дом.ru Бизнес»",
      quotes: [{ supplier: "АО «Дом.ru Бизнес»", amount: 348000 }, { supplier: "ПАО «Ростелеком»", amount: 356000 }, { supplier: "ООО «ЭР-Телеком»", amount: 361000 }],
      contract: { number: `${year}.12/044`, date: `${year}-06-15`, amount: 348000, validUntil: `${year}-12-31`, deliveryUntil: `${year}-07-01` },
    },
    {
      title: `${TEST_PREFIX} Поставка коммутаторов доступа`, method: "electronic_shop", category: "supply", status: "execution",
      dept: deptIoib.id, initiator: "operator", estimated: 890000, budgetYear: year, folderId: folderIoib, docsPresent: 4, memo: true,
      supplier: "ООО «Техносерв»",
      quotes: [{ supplier: "ООО «Техносерв»", amount: 872400 }, { supplier: "ООО «Инфорсер Инжиниринг»", amount: 905000 }],
      contract: { number: `${year}.12/038`, date: `${year}-05-20`, amount: 872400, validUntil: `${year}-12-31`, deliveryUntil: `${year}-10-15` },
      payments: [{ amount: 436200, paidAt: `${year}-06-05`, addressee: "Тыщенко", note: "Аванс 50%" }],
    },
    {
      // Просроченная приёмка: факт поставки давно, окно истекло
      title: `${TEST_PREFIX} Замена видеосерверов архива`, method: "electronic_shop", category: "supply", status: "acceptance_window",
      dept: deptVideo.id, initiator: "ivanov", estimated: 1250000, budgetYear: year, folderId: folderVideo, docsPresent: 4, memo: true,
      supplier: "ООО «Инфорсер Инжиниринг»",
      quotes: [{ supplier: "ООО «Инфорсер Инжиниринг»", amount: 1240000 }],
      contract: { number: `${year}.12/019`, date: `${year}-04-10`, amount: 1240000, validUntil: `${year}-12-31` },
      actualDeliveryAt: `${year}-08-20`, acceptanceOverdue: true,
    },
    {
      // Прошлый год, оплата в текущем — сценарий п.16 чеклиста
      title: `${TEST_PREFIX} ОКС: реконструкция линии, этап 2`, method: "auction", category: "service", status: "execution",
      dept: deptIoib.id, initiator: "operator", estimated: 2100000, budgetYear: year - 1, folderId: folderIoibPrev, docsPresent: 5, memo: true,
      supplier: "ООО «ОКС»",
      quotes: [{ supplier: "ООО «ОКС»", amount: 1980000 }],
      contract: { number: `${year - 1}.12/102`, date: `${year - 1}-11-12`, amount: 1980000, validUntil: `${year}-03-31` },
      payments: [
        { amount: 990000, paidAt: `${year - 1}-12-20`, addressee: "Матюха", note: "Аванс 50%" },
        { amount: 990000, paidAt: `${year}-02-14`, addressee: "Бузько", note: "Окончательный расчёт" },
      ],
    },
    // --- Завершённые ---
    {
      title: `${TEST_PREFIX} Телефония офиса, год`, method: "auction", category: "telecom", status: "completed",
      dept: deptNav.id, initiator: "petrov", estimated: 240000, budgetYear: year - 1, folderId: folderIoibPrev, docsPresent: 5, memo: true,
      supplier: "ПАО «Ростелеком»",
      quotes: [{ supplier: "ПАО «Ростелеком»", amount: 238000 }],
      contract: { number: `${year - 1}.12/071`, date: `${year - 1}-09-01`, amount: 238000, validUntil: `${year}-08-31` },
      actualDeliveryAt: `${year}-08-20`,
      payments: [{ amount: 238000, paidAt: `${year - 1}-10-05`, addressee: "Тыщенко" }],
    },
    {
      title: `${TEST_PREFIX} Заправка картриджей, полугодие`, method: "electronic_shop", category: "service", status: "completed",
      dept: deptIoib.id, initiator: "moderator", estimated: 60000, budgetYear: year, folderId: folderIoib, docsPresent: 4,
      supplier: "ИП Ковалёв А.С.",
      quotes: [{ supplier: "ИП Ковалёв А.С.", amount: 58400 }],
      contract: { number: `${year}.12/011`, date: `${year}-02-10`, amount: 58400, validUntil: `${year}-07-31` },
      actualDeliveryAt: `${year}-07-10`,
      payments: [{ amount: 58400, paidAt: `${year}-08-01`, addressee: "Дыц" }],
    },
    // --- Архивная карточка (импорт) ---
    {
      title: `${TEST_PREFIX} Архивный договор ОКС ${year - 1}`, method: "auction", category: "service", status: "execution",
      dept: deptIoib.id, initiator: "admin", estimated: 1450000, budgetYear: year - 1, folderId: folderIoibPrev,
      supplier: "ООО «ОКС»", fromArchive: true,
      contract: { number: `${year - 1}.12/096`, date: `${year - 1}-10-28`, amount: 1450000, validUntil: `${year}-12-31` },
      description: "Импортировано из архива Excel. Комплект документов не полный.",
      payments: [{ amount: 725000, paidAt: `${year - 1}-12-15`, addressee: "Тыщенко", note: "Аванс по архиву" }],
    },
  ];

  let created = 0;
  for (const c of cards) {
    const initiatorId = users[c.initiator]?.id || admin.id;
    const serialNo = await nextProcurementSerialNo();
    const docs = DOCUMENT_PACKAGES[c.method] || [];
    const presentCount = c.docsPresent ?? 0;
    const contractDate = c.contract ? d(c.contract.date) : null;
    const actualDelivery = c.actualDeliveryAt ? d(c.actualDeliveryAt) : null;
    const acceptanceDays = 10;

    const proc = await prisma.procurement.create({
      data: {
        serialNo,
        title: c.title,
        law: "fz44",
        method: c.method,
        category: c.category,
        status: c.status,
        departmentId: c.dept,
        folderId: c.folderId || null,
        budgetYear: c.budgetYear,
        initiatorId,
        description: c.description || null,
        estimatedAmount: c.estimated,
        contractNumber: c.contract?.number || null,
        contractDate,
        contractAmount: c.contract?.amount ?? null,
        deliveryUntil: c.contract?.deliveryUntil ? d(c.contract.deliveryUntil) : null,
        validUntil: c.contract ? d(c.contract.validUntil) : null,
        executorName: c.contract ? users[c.initiator]?.fullName || admin.fullName : null,
        executorUserId: c.contract ? initiatorId : null,
        performanceDays: c.contract ? 60 : null,
        acceptanceDays,
        actualDeliveryAt: actualDelivery,
        acceptanceStartAt: actualDelivery,
        acceptanceDueAt: actualDelivery ? addDays(actualDelivery, acceptanceDays) : null,
        fromArchive: Boolean(c.fromArchive),
        supervisorApprovedAt: ["director_approval", "transferred", "published", "bidding", "contracted", "execution", "acceptance_window", "completed"].includes(c.status) ? contractDate || d(`${c.budgetYear}-03-01`) : null,
        supervisorApprovedById: ["director_approval", "transferred", "published", "bidding", "contracted", "execution", "acceptance_window", "completed"].includes(c.status) ? users.moderator.id : null,
        directorApprovedAt: ["transferred", "published", "bidding", "contracted", "execution", "acceptance_window", "completed"].includes(c.status) ? contractDate || d(`${c.budgetYear}-03-05`) : null,
        directorApprovedById: ["transferred", "published", "bidding", "contracted", "execution", "acceptance_window", "completed"].includes(c.status) ? admin.id : null,
        publishedAt: ["published", "bidding", "contracted", "execution", "acceptance_window", "completed"].includes(c.status) ? d(`${c.budgetYear}-04-01`) : null,
        documents: {
          create: docs.map((doc, i) => ({
            code: doc.code,
            title: doc.title,
            present: i < presentCount,
            note: i < presentCount && doc.code === "memo" ? "подписана" : null,
          })),
        },
      },
    });

    // КП
    let selectedQuoteId: string | null = null;
    for (const [qi, q] of (c.quotes || []).entries()) {
      const quote = await prisma.quote.create({
        data: {
          procurementId: proc.id,
          supplierId: suppliers[q.supplier]?.id || null,
          supplierName: q.supplier,
          amount: q.amount,
          fileName: `kp-${proc.serialNo}-${qi + 1}.pdf`,
          storedName: `demo-kp-${proc.serialNo}-${qi + 1}.pdf`,
          uploadedById: initiatorId,
        },
      });
      if (c.supplier === q.supplier) selectedQuoteId = quote.id;
    }
    if (selectedQuoteId) {
      await prisma.procurement.update({ where: { id: proc.id }, data: { selectedQuoteId } });
    }

    // СЗ
    if (c.memo) {
      await prisma.serviceMemo.create({
        data: {
          procurementId: proc.id,
          addressee: "director",
          addresseePosition: "Директор БУ г. Омска «УДХБ»",
          addresseePositionDative: "директору БУ г. Омска «УДХБ»",
          addresseeFullName: "Тыщенко Андрей Владимирович",
          addresseeShortName: "Тыщенко А.В.",
          addresseeDative: "Тыщенко Андрею Владимировичу",
          fromUserId: initiatorId,
          agreedPosition: "Директор БУ г. Омска «УДХБ»",
          agreedFullName: "Тыщенко А.В.",
          compiledById: initiatorId,
          letterheadKind: c.dept === deptIoib.id ? "department" : "management",
          body: `Прошу рассмотреть вопрос о заключении договора «${c.title.replace(TEST_PREFIX + " ", "")}» ` +
            `на сумму ${(c.contract?.amount ?? c.estimated).toLocaleString("ru-RU")} ₽. ` +
            `Поставщик: ${c.supplier || "определяется по результатам сбора КП"}.`,
        },
      });
    }

    // Оплаты
    for (const [pi, p] of (c.payments || []).entries()) {
      const storedName = `demo-pay-${proc.serialNo}-${pi + 1}.pdf`;
      const dir = path.join(config.uploadDir, "payments");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, storedName), stubPdf(`Sluzhebnaya zapiska na oplatu ${p.amount}`));
      await prisma.procPayment.create({
        data: {
          procurementId: proc.id,
          amount: p.amount,
          paidAt: d(p.paidAt),
          addressee: p.addressee,
          memoText: `Прошу произвести оплату по договору ${c.contract?.number || "—"} на сумму ${p.amount.toLocaleString("ru-RU")} ₽.`,
          note: p.note || null,
          createdById: initiatorId,
          files: { create: [{ fileName: `sz-oplata-${pi + 1}.pdf`, storedName }] },
        },
      });
    }

    // История изменений
    await prisma.procChangeLog.createMany({
      data: [
        {
          procurementId: proc.id, userId: initiatorId, section: "Карточка", action: "create",
          summary: `Создана карточка №${serialNo}`,
        },
        ...(c.contract
          ? [{
              procurementId: proc.id, userId: initiatorId, section: "Заключение", action: "update",
              summary: `Заключён договор ${c.contract.number} от ${c.contract.date}`,
            }]
          : []),
        ...(c.status === "returned"
          ? [{
              procurementId: proc.id, userId: admin.id, section: "Согласование", action: "status",
              summary: "Возвращено договорным отделом",
              details: "Доработать ТЗ: не хватает требований к гарантии",
            }]
          : []),
      ],
    });
    created++;
  }

  // ---------- Уведомления ----------
  const notifyTargets = [admin.id, users.moderator.id, users.operator.id];
  await prisma.notification.deleteMany({
    where: { userId: { in: notifyTargets }, title: { startsWith: TEST_PREFIX } },
  });
  const notifications = [
    { userId: admin.id, title: `${TEST_PREFIX} Приёмка просрочена`, body: "«Замена видеосерверов архива»: срок приёмки документов истёк", kind: "warn" },
    { userId: users.moderator.id, title: `${TEST_PREFIX} На согласовании`, body: "СЗ по «Аудит каналов связи филиалов» ожидает отметки", kind: "info" },
    { userId: users.operator.id, title: `${TEST_PREFIX} Пакет возвращён`, body: "«Ремонт радиорелейного пролёта» — доработать ТЗ", kind: "warn" },
    { userId: admin.id, title: `${TEST_PREFIX} Добро пожаловать`, body: "Демо-данные загружены. Карточки с префиксом «[тест]» можно удалять и пересоздавать через npm run seed:dev", kind: "info", read: true },
  ];
  for (const { read, ...n } of notifications) {
    await prisma.notification.create({
      data: { ...n, readAt: read ? new Date() : null },
    });
  }

  console.log(`seed-dev ok: ${created} карточек, ${testUsers.length} пользователей, ${supplierDefs.length} поставщиков`);
  console.log(`Вход: admin / ${process.env.INIT_ADMIN_PASSWORD || "EcosysAdmin47!"} · тестовые (${testUsers.map((u) => u.login).join(", ")}) / ${TEST_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
