import { readFileSync } from "fs";

const s = readFileSync("C:/Users/vra/ecosys.udhb.local/tmp-sed-shared.js", "utf8");
const i = s.indexOf('name:"SedPager"');
console.log("SedPager", i);
if (i >= 0) console.log(s.slice(i, i + 2000));

for (const term of ["sed-pagination-fixed-wrapper", "sed-pager", "SedPager"]) {
  let idx = 0;
  let n = 0;
  while ((idx = s.indexOf(term, idx)) >= 0 && n < 3) {
    console.log("\n", term, idx);
    console.log(s.slice(idx - 40, idx + 200).replace(/\s+/g, " "));
    idx += term.length;
    n++;
  }
}
