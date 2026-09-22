import { PrismaClient } from "@prisma/client";
import { createDecipheriv, createHash } from "crypto";
import { loginSedSession, parseSedPendingPagination, parseSedPendingDocuments } from "../src/lib/sed.ts";
import iconv from "iconv-lite";
import { writeFileSync } from "fs";

function decrypt(payload) {
  const secret = process.env.JWT_SECRET;
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const key = createHash("sha256").update(`${secret}:sed`).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

const prisma = new PrismaClient();
const user = await prisma.user.findFirst({ where: { sedLastTestOk: true, sedPasswordEnc: { not: null } } });
if (!user) throw new Error("no user");
const session = await loginSedSession({
  groupId: user.sedGroupId,
  userId: user.sedUserId,
  login: user.sedLogin,
  password: decrypt(user.sedPasswordEnc),
});
const listUrl = `${session.base}/document.php?status=3&DNSID=${encodeURIComponent(session.dnsId)}`;
const res = await fetch(listUrl, { headers: { Cookie: session.jar.header() }, redirect: "follow" });
const html = iconv.decode(Buffer.from(await res.arrayBuffer()), "win1251");
writeFileSync("/tmp/sed-pending.html", html, "utf8");

const items = parseSedPendingDocuments(html, session.base, session.dnsId);
const pagination = parseSedPendingPagination(html, listUrl, session.base);

console.log("items", items.length);
console.log("pagination", JSON.stringify(pagination, null, 2));
for (const term of ["sed-pagination", "page-count", "totalPages", "currentPage", "sed-pager", "s-doc__item"]) {
  console.log(term, html.includes(term) ? "yes" : "no");
}
const idx = html.indexOf("pagination");
if (idx >= 0) console.log("ctx", html.slice(idx - 80, idx + 400).replace(/\s+/g, " ").slice(0, 480));

await prisma.$disconnect();
