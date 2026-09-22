import { readFileSync } from "fs";
import { parseSedPendingPagination, parseSedPendingDocuments } from "../src/lib/sed.ts";

const pathArg = process.argv.find((a) => !a.startsWith("-") && a.endsWith(".html"));
const path = pathArg || "C:/Users/vra/AppData/Local/Temp/sed-status3.html";
let text = readFileSync(path);
let html = new TextDecoder("windows-1251").decode(text);
if (process.argv.includes("--next-page")) {
  html = html.replace('"hasNextPage":false', '"hasNextPage":true');
}

const items = parseSedPendingDocuments(html, "http://sed.omskgov.ru", "TEST");
const pagination = parseSedPendingPagination(html, "http://sed.omskgov.ru/document.php?status=3&DNSID=TEST", "http://sed.omskgov.ru", {
  itemCount: items.length,
  total: items.length,
});

console.log("items", items.length);
console.log("pagination", JSON.stringify(pagination, null, 2));
console.log(
  "show UI",
  pagination.hasNextPage || pagination.currentPage > 1 || pagination.totalPages > 1
);
