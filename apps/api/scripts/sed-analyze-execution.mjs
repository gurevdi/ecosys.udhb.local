import { readFileSync } from "fs";

const html = readFileSync(process.argv[2] || "/tmp/sed-card.html", "utf8");
const tableStart = html.indexOf('class="card s-resolutions-table"');
const end = html.indexOf("</table>", tableStart);
const chunk = html.slice(tableStart, end);

for (const m of chunk.matchAll(/<tr[^>]*class="([^"]*)"[^>]*>/gi)) {
  console.log("tr class:", m[1]);
}

console.log("--- first items ---");
for (const m of chunk.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cls = m[0].match(/class="([^"]*)"/)?.[1] || "";
  const text = m[1]
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  if (text && !text.includes("function")) console.log(cls || "(no class)", "->", text);
}
