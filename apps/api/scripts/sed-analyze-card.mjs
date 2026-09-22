import { PrismaClient } from "@prisma/client";
import { createDecipheriv, createHash } from "crypto";
import { loginSedSession } from "../src/lib/sed.ts";
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

const docId = process.argv[2] || "6234542";
const prisma = new PrismaClient();
const user = await prisma.user.findFirst({ where: { sedLastTestOk: true, sedPasswordEnc: { not: null } } });
const session = await loginSedSession({
  groupId: user.sedGroupId,
  userId: user.sedUserId,
  login: user.sedLogin,
  password: decrypt(user.sedPasswordEnc),
});
const url = `${session.base}/document.card.php?id=${docId}&DNSID=${encodeURIComponent(session.dnsId)}`;
const res = await fetch(url, { headers: { Cookie: session.jar.header() }, redirect: "follow" });
const html = iconv.decode(Buffer.from(await res.arrayBuffer()), "win1251");
writeFileSync("/tmp/sed-card.html", html, "utf8");

const mainIdx = html.indexOf("maintable-width scrollable-section");
console.log("mainIdx", mainIdx);
if (mainIdx >= 0) console.log(html.slice(mainIdx - 80, mainIdx + 500).replace(/\s+/g, " ").slice(0, 600));

const execIdx = html.search(/Исполнение документа|s-resolutions|resolution/i);
console.log("execIdx", execIdx);
if (execIdx >= 0) console.log(html.slice(execIdx - 40, execIdx + 600).replace(/\s+/g, " ").slice(0, 700));

// tables inside scrollable-section
const blockRe = /class="[^"]*maintable-width scrollable-section[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
let n = 0;
for (const m of html.matchAll(blockRe)) {
  console.log("\n=== TABLE BLOCK", ++n, "len", m[1].length);
  for (const r of m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
    );
    if (cells.some((c) => c && !c.startsWith("function"))) console.log("  ", cells.join(" | "));
  }
}

await prisma.$disconnect();
