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

const prisma = new PrismaClient();
const user = await prisma.user.findFirst({ where: { sedLastTestOk: true, sedPasswordEnc: { not: null } } });
if (!user) throw new Error("no user");

const session = await loginSedSession({
  groupId: user.sedGroupId,
  userId: user.sedUserId,
  login: user.sedLogin,
  password: decrypt(user.sedPasswordEnc),
});

const urls = [
  `${session.base}/document.php?status=3&DNSID=${encodeURIComponent(session.dnsId)}`,
  `${session.base}/control_execution.php?DNSID=${encodeURIComponent(session.dnsId)}`,
  `${session.base}/index.php?DNSID=${encodeURIComponent(session.dnsId)}`,
];

for (const url of urls) {
  const res = await fetch(url, { headers: { Cookie: session.jar.header() }, redirect: "follow" });
  const html = iconv.decode(Buffer.from(await res.arrayBuffer()), "win1251");
  const name = url.includes("control_execution") ? "control" : url.includes("index") ? "index" : "pending";
  writeFileSync(`/tmp/sed-${name}.html`, html, "utf8");
  console.log("\n===", name, "len", html.length);
}

const controlUrl = `${session.base}/control_execution.php?DNSID=${encodeURIComponent(session.dnsId)}`;
await fetch(controlUrl, { headers: { Cookie: session.jar.header() }, redirect: "follow" });

const countersUrl = `${session.base}/web/?url=controlExecution%2Fdashboard%2Fcounters&DNSID=${encodeURIComponent(session.dnsId)}`;
const countersRes = await fetch(countersUrl, {
  headers: {
    Cookie: session.jar.header(),
    Accept: "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
  },
});
const countersText = await countersRes.text();
writeFileSync("/tmp/sed-counters.json", countersText, "utf8");
console.log("\n=== counters status", countersRes.status, "ctype", countersRes.headers.get("content-type"));
console.log(countersText.slice(0, 4000));

await prisma.$disconnect();
