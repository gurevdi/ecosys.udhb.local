import { PrismaClient } from "@prisma/client";
import { RESOURCES } from "../src/lib/catalog.ts";
import { currentYearInAppTz } from "../src/lib/time.ts";

const prisma = new PrismaClient();

/**
 * Начальное наполнение БД: отделы, admin, папки договоров по годам.
 */
async function main() {
  const departments = [
    { code: "ioib", name: "Отдел информационного обеспечения и информационной безопасности" },
    { code: "video", name: "Отдел видеонаблюдения" },
    { code: "nav", name: "Сектор навигационных систем" },
  ];
  for (const d of departments) {
    await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: d,
    });
  }

  const password = process.env.INIT_ADMIN_PASSWORD || "EcosysAdmin47!";
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { login: "admin" },
    update: { isAdmin: true, isActive: true, fullName: "Администратор экосистемы" },
    create: {
      login: "admin",
      passwordHash: hash,
      fullName: "Администратор экосистемы",
      position: "Администратор",
      email: "ecosys@udhb.local",
      isAdmin: true,
      source: "local",
    },
  });
  if (!admin.passwordHash) {
    await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: hash } });
  }

  for (const resource of RESOURCES) {
    await prisma.userPermission.upsert({
      where: { userId_resource: { userId: admin.id, resource } },
      update: { canRead: true, canWrite: true },
      create: { userId: admin.id, resource, canRead: true, canWrite: true },
    });
  }

  const adminRole = await prisma.userContractRole.findFirst({
    where: { userId: admin.id, role: "admin", scopeKey: "" },
  });
  if (!adminRole) {
    await prisma.userContractRole.create({
      data: { userId: admin.id, role: "admin", departmentId: null, scopeKey: "" },
    });
  }

  const year = currentYearInAppTz();
  for (const y of [year - 1, year, year + 1]) {
    const exists = await prisma.contractFolder.findFirst({ where: { parentId: null, year: y, departmentId: null } });
    if (!exists) {
      await prisma.contractFolder.create({
        data: { name: `Договоры ${y}`, year: y, sortOrder: y, parentId: null, departmentId: null },
      });
    }
  }

  await prisma.setting.upsert({
    where: { key: "contracts_view_mode" },
    update: {},
    create: { key: "contracts_view_mode", value: "folders" },
  });

  await prisma.setting.upsert({
    where: { key: "brand_org_name" },
    update: {},
    create: { key: "brand_org_name", value: "УДХБ" },
  });

  await prisma.setting.upsert({
    where: { key: "payment_addressees" },
    update: {},
    create: { key: "payment_addressees", value: JSON.stringify(["Тыщенко", "Матюха", "Бузько", "Дыц"]) },
  });

  const mgmt = await prisma.memoLetterhead.findFirst({ where: { departmentId: null } });
  if (!mgmt) {
    await prisma.memoLetterhead.create({
      data: {
        departmentId: null,
        title: "Шапка управления",
        body: "Бюджетное учреждение города Омска\n«Управление дорожного хозяйства и благоустройства»",
      },
    });
  }

  console.log("seed ok, admin login=admin");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
