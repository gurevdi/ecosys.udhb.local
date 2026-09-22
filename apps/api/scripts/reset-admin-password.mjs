import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const password = process.env.INIT_ADMIN_PASSWORD || "EcosysAdmin47!";
const hash = await bcrypt.hash(password, 12);

const user = await prisma.user.update({
  where: { login: "admin" },
  data: {
    passwordHash: hash,
    source: "local",
    isActive: true,
    isAdmin: true,
  },
});

console.log(`reset ok login=${user.login} source=${user.source}`);
await prisma.$disconnect();
