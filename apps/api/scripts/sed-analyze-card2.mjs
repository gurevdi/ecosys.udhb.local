import { readFileSync } from "fs";

const html = readFileSync("/tmp/sed-card.html", "utf8");

for (const term of ["Подпись", "Исполнение документа", "s-resolutions", "resolution", "ход исполнения"]) {
  let idx = 0;
  let n = 0;
  while ((idx = html.indexOf(term, idx)) >= 0 && n < 3) {
    console.log("\nTERM", term, "at", idx);
    console.log(html.slice(idx - 30, idx + 200).replace(/\s+/g, " ").slice(0, 250));
    idx += term.length;
    n++;
  }
}

// resolutions table
for (const m of html.matchAll(/class="[^"]*s-resolutions[^"]*"[^>]*>([\s\S]{0,3000})/gi)) {
  console.log("\nRES BLOCK", m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400));
}

// id blocks
for (const m of html.matchAll(/id="([^"]*(?:resolution|execution|исполн)[^"]*)"/gi)) {
  console.log("id", m[1]);
}

// h3 headers in card area
for (const m of html.matchAll(/<h3[^>]*>([^<]+)/gi)) {
  const t = m[1].trim();
  if (/исполн|резолю|документ|карточ/i.test(t)) console.log("h3", t);
}
