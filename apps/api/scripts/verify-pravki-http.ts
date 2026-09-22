const BASE = "http://127.0.0.1:3000";
const jar: string[] = [];

function cookieHeader() {
  return jar.map((c) => c.split(";")[0]).join("; ");
}

async function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookieHeader()) headers.set("Cookie", cookieHeader());
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(BASE + path, { ...init, headers });
  const set = res.headers.getSetCookie?.() || [];
  for (const c of set) jar.push(c);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers, buf: text };
}

let failed = 0;
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) console.log("OK  ", name);
  else {
    failed++;
    console.log("FAIL", name, detail);
  }
}

const login = await req("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ login: "admin", password: "EcosysAdmin47!" }),
});
check("login", login.status === 200, login.data);

const health = await req("/api/health");
check("health", (health.data as { ok?: boolean })?.ok === true, health.data);

const me = await req("/api/auth/me");
check("auth/me", me.status === 200, me.status);

const deps = (await req("/api/departments")).data as { id: string; name: string }[];
check("departments", Array.isArray(deps) && deps.length >= 3, deps);

const sup = await req("/api/suppliers", {
  method: "POST",
  body: JSON.stringify({ name: "ООО ОКС", inn: "5500000000", phone: "3812", comment: "менеджер может отсутствовать" }),
});
check("create supplier", sup.status === 200 && (sup.data as { name?: string }).name === "ООО ОКС", sup.data);

const supList = await req("/api/suppliers?q=ОКС");
check("search supplier", Array.isArray(supList.data) && (supList.data as { name: string }[]).some((s) => s.name.includes("ОКС")), supList.data);

const signs = {
  memo_signatory_1: JSON.stringify({
    position: "Директор",
    positionDative: "директору",
    fullName: "Иванов Иван Иванович",
    shortName: "Иванов И.И.",
    dative: "Иванову И.И.",
  }),
  memo_signatory_2: JSON.stringify({
    position: "Заместитель",
    positionDative: "заместителю директора",
    fullName: "Петров Пётр Петрович",
    shortName: "Петров П.П.",
    dative: "Петрову П.П.",
  }),
};
const setOk = await req("/api/settings", { method: "PUT", body: JSON.stringify(signs) });
check("memo signatories", setOk.status === 200, setOk.status);

const head = await req("/api/letterheads", {
  method: "PUT",
  body: JSON.stringify({ departmentId: null, title: "Управление", body: "БУ г. Омска «УДХБ»" }),
});
check("letterhead management", head.status === 200, head.status);

const years = (await req("/api/contracts/years")).data as { years: number[]; defaultYear: number };
const year = years.defaultYear || years.years?.[0] || 2026;
const proc = await req("/api/procurements", {
  method: "POST",
  body: JSON.stringify({
    title: "Тест WiFi мост",
    method: "electronic_shop",
    category: "supply",
    departmentId: deps[0].id,
    budgetYear: year,
    estimatedAmount: 4890,
  }),
});
const procId = (proc.data as { id?: string }).id;
check("create procurement", proc.status === 200 && Boolean(procId), proc.data);

const fd = new FormData();
fd.append("file", new Blob(["KP test"], { type: "text/plain" }), "kp.txt");
fd.append("supplierName", "ООО ОКС");
fd.append("inn", "5500000000");
fd.append("amount", "4890");
const quote = await req(`/api/procurements/${procId}/quotes`, { method: "POST", body: fd });
check("upload quote from directory name", quote.status === 200 && (quote.data as { supplierName?: string }).supplierName === "ООО ОКС", quote.data);

const people = (await req("/api/users/brief")).data as { id: string; fullName: string }[];
const uid = people[0]?.id;
const memo = await req(`/api/procurements/${procId}/memos`, {
  method: "POST",
  body: JSON.stringify({
    addressee: "director",
    fromUserId: uid,
    agreedPosition: "начальник",
    agreedFullName: "Тестов Т.Т.",
    compiledById: uid,
    letterheadKind: "management",
    body: "Прошу согласовать закупку WiFi мост",
  }),
});
const memoId = (memo.data as { id?: string }).id;
check("create memo", memo.status === 200 && Boolean(memoId), memo.data);

const patched = await req(`/api/procurements/${procId}/memos/${memoId}`, {
  method: "PATCH",
  body: JSON.stringify({ body: "Прошу согласовать закупку WiFi мост. Исправлена опечатка." }),
});
check("edit memo without delete", patched.status === 200 && String((patched.data as { body?: string }).body).includes("опечатка"), patched.data);

const docx = await fetch(BASE + `/api/procurements/${procId}/memos/${memoId}/docx`, { headers: { Cookie: cookieHeader() } });
const docxBuf = Buffer.from(await docx.arrayBuffer());
check("memo docx", docx.status === 200 && docxBuf[0] === 0x50 && docxBuf[1] === 0x4b, docx.status);

const appr = await req(`/api/procurements/${procId}/approve`, {
  method: "POST",
  body: JSON.stringify({ kind: "all", advance: true }),
});
check("approve all", appr.status === 200, appr.data);

await req(`/api/procurements/${procId}/status`, {
  method: "POST",
  body: JSON.stringify({ status: "contracted", force: true }),
});

const saveDates = await req(`/api/procurements/${procId}`, {
  method: "PATCH",
  body: JSON.stringify({
    contractNumber: "2026.94/155",
    contractDate: "2026-09-08",
    validUntil: "2026-12-31",
    contractAmount: 4890,
    deliveryUntil: "2026-09-18",
    executorName: "ООО ОКС",
    acceptanceDays: 10,
  }),
});
check("save contract 08.09 / 31.12", saveDates.status === 200, saveDates.data);

const badDates = await req(`/api/procurements/${procId}`, {
  method: "PATCH",
  body: JSON.stringify({ contractDate: "2026-09-08", validUntil: "2026-09-01" }),
});
check(
  "reject validUntil before contractDate",
  badDates.status === 400 && String((badDates.data as { error?: string }).error).includes("действует до"),
  badDates.data
);

const fact = await req(`/api/procurements/${procId}`, {
  method: "PATCH",
  body: JSON.stringify({ actualDeliveryAt: "2026-09-18", acceptanceDays: 10 }),
});
const due = (fact.data as { acceptanceDueAt?: string })?.acceptanceDueAt;
check("acceptance = fact + 10", Boolean(due && due.startsWith("2026-09-28")), due);

const pay = await req(`/api/procurements/${procId}/payments`, {
  method: "POST",
  body: JSON.stringify({ addressee: "Тыщенко", amount: 4890, paidAt: "2026-09-20", memoText: "служебка на оплату" }),
});
check("create payment", pay.status === 200 && (pay.data as { addressee?: string }).addressee === "Тыщенко", pay.data);

const xls = await fetch(BASE + "/api/procurements/export", { headers: { Cookie: cookieHeader() } });
const xlsText = await xls.text();
check("excel export", xls.status === 200 && xlsText.includes("2026.94/155") && xlsText.includes("ООО ОКС"), xls.status);

const csv = await fetch(BASE + "/api/procurements/export?format=csv", { headers: { Cookie: cookieHeader() } });
const csvText = await csv.text();
check("csv export", csv.status === 200 && csvText.includes("Дата заключения"), csv.status);

const zip = await fetch(BASE + `/api/procurements/${procId}/archive`, { headers: { Cookie: cookieHeader() } });
const zipBuf = Buffer.from(await zip.arrayBuffer());
check("card zip", zip.status === 200 && zipBuf[0] === 0x50 && zipBuf[1] === 0x4b, zip.status);

const yearList = await req(`/api/procurements?year=2026&yearField=any`);
check("year any filter", yearList.status === 200 && Array.isArray(yearList.data), yearList.status);

const supplierFilter = await req(`/api/procurements?supplier=ОКС`);
check(
  "supplier filter",
  supplierFilter.status === 200 && (supplierFilter.data as { title?: string }[]).some((r) => r.title?.includes("WiFi")),
  supplierFilter.status
);

const imported = await req("/api/procurements/import-archive", {
  method: "POST",
  body: JSON.stringify({
    rows: [
      {
        title: "Архивный договор ОКС 2025",
        supplierName: "ООО ОКС",
        contractNumber: "2025.1/1",
        contractDate: "2025-06-01",
        contractAmount: 1000,
        departmentId: deps[0].id,
        budgetYear: 2025,
      },
    ],
  }),
});
check("archive import", imported.status === 200 && (imported.data as { count?: number }).count === 1, imported.data);

const archRow = ((await req("/api/procurements")).data as { title: string; fromArchive: boolean }[]).find((r) =>
  r.title.includes("Архивный")
);
check("fromArchive flag", Boolean(archRow?.fromArchive), archRow);

if (failed) {
  console.log(`http tests failed: ${failed}`);
  process.exit(1);
}
console.log("http tests passed");
