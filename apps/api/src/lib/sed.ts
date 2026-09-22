import iconv from "iconv-lite";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { config, prisma } from "./config.ts";
import { debugLog } from "./debug.ts";
import { decryptSedPassword } from "./sed-crypto.ts";

export type SedOption = { id: string; label: string };

const DEFAULT_BASE = "http://sed.omskgov.ru";

function sedBaseUrl() {
  return (process.env.SED_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
}

function decodeHtml(html: Buffer | ArrayBuffer) {
  try {
    return iconv.decode(Buffer.from(html instanceof ArrayBuffer ? new Uint8Array(html) : html), "win1251");
  } catch {
    return new TextDecoder("utf-8").decode(html);
  }
}

/** Cookie-jar для цепочки GET → POST СЭД */
class CookieJar {
  private map = new Map<string, string>();

  absorb(res: Response) {
    const lines: string[] =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")!]
          : [];
    for (const line of lines) {
      const part = line.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) this.map.set(part.slice(0, eq).trim(), part.slice(eq + 1));
    }
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function encodeWin1251URIComponent(str: string) {
  const bytes = iconv.encode(str, "win1251");
  let out = "";
  for (const b of bytes) {
    if (
      (b >= 0x41 && b <= 0x5a) ||
      (b >= 0x61 && b <= 0x7a) ||
      (b >= 0x30 && b <= 0x39) ||
      b === 0x2d ||
      b === 0x2e ||
      b === 0x5f ||
      b === 0x7e
    ) {
      out += String.fromCharCode(b);
    } else {
      out += `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/** Тело формы в windows-1251, как отправляет браузер на sed.omskgov.ru */
function encodeFormWin1251(fields: Record<string, string>) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeWin1251URIComponent(k)}=${encodeWin1251URIComponent(v)}`)
    .join("&");
}

function parseJsonArray<T>(html: string, varName: string): T[] {
  const markers = [`window.${varName} = `, `${varName} = `, `const ${varName} = `];
  let idx = -1;
  for (const m of markers) {
    idx = html.indexOf(m);
    if (idx >= 0) break;
  }
  if (idx < 0) return [];
  const start = html.indexOf("[", idx);
  if (start < 0) return [];
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as T[];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function extractDnsId(html: string) {
  const m = html.match(/name="DNSID"\s+value="([^"]+)"/);
  return m?.[1] || "";
}

function extractFormAction(html: string, base: string) {
  const m = html.match(/id="login_form"[^>]*action="([^"]+)"/);
  if (!m) return `${base}/auth.php`;
  const action = m[1].replace(/&amp;/g, "&");
  if (action.startsWith("http")) return action;
  return `${base}${action.startsWith("/") ? "" : "/"}${action}`;
}

function sedHeaders(jar: CookieJar, extra: Record<string, string> = {}) {
  const cookie = jar.header();
  return {
    "User-Agent": "Mozilla/5.0 (compatible; ecosys-sed/1.0)",
    Accept: "text/html,application/xhtml+xml",
    ...(cookie ? { Cookie: cookie } : {}),
    ...extra,
  };
}

/** Загрузка страницы входа СЭД */
export async function fetchSedAuthPage(groupId?: string, jar = new CookieJar()) {
  const base = sedBaseUrl();
  const url = groupId ? `${base}/auth.php?group_id=${encodeURIComponent(groupId)}` : `${base}/auth.php`;
  const res = await fetch(url, { headers: sedHeaders(jar), redirect: "follow" });
  jar.absorb(res);
  if (!res.ok) throw new Error(`СЭД недоступен (${res.status})`);
  const html = decodeHtml(await res.arrayBuffer());
  return { html, url, jar };
}

export async function listSedOrganizations(query = "") {
  const { html } = await fetchSedAuthPage();
  type Raw = { id: number | string; label: string };
  const rows = parseJsonArray<Raw>(html, "availableOrganizations")
    .filter((r) => r.id && r.label)
    .map((r) => ({ id: String(r.id), label: r.label.trim() }));
  const q = query.trim().toLowerCase();
  if (!q) return rows.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  return rows.filter((r) => r.label.toLowerCase().includes(q)).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

export async function listSedLogins(groupId: string, query = "") {
  if (!groupId || groupId === "0") return [] as SedOption[];
  const { html } = await fetchSedAuthPage(groupId);
  type Raw = { id: number | string; label: string };
  const rows = parseJsonArray<Raw>(html, "availableLogins")
    .filter((r) => r.id && r.label)
    .map((r) => ({ id: String(r.id), label: r.label.trim() }));
  const q = query.trim().toLowerCase();
  if (!q) return rows.sort((a, b) => a.label.localeCompare(b.label, "ru"));
  return rows.filter((r) => r.label.toLowerCase().includes(q)).sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

export type SedLoginInput = {
  groupId: string;
  userId: string;
  login: string;
  password: string;
};

export type SedSession = {
  jar: CookieJar;
  dnsId: string;
  base: string;
};

export type SedPendingDocument = {
  id: string;
  kind: string | null;
  number: string | null;
  regDate: string | null;
  outNumber: string | null;
  outDate: string | null;
  correspondent: string | null;
  title: string | null;
  url: string;
  files: SedDocumentFile[];
};

export type SedPendingPeriod = {
  shownText: string | null;
  toggleLabel: string | null;
  toggleUrl: string | null;
  wholePeriod: boolean;
};

export type SedPaginationLink = {
  page: number;
  label: string;
  followUrl: string;
  current: boolean;
};

export type SedPendingPagination = {
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  pages: SedPaginationLink[];
  prevUrl: string | null;
  nextUrl: string | null;
};

export type SedReviewDashboard = {
  total: number;
  burning: number;
  urgent: number;
  other: number;
};

export type SedPendingList = {
  items: SedPendingDocument[];
  total: number;
  fetchedAt: Date;
  period: SedPendingPeriod;
  pagination: SedPendingPagination;
  listPath: string;
  dashboard: SedReviewDashboard | null;
  pageSize: number;
  searchMode?: boolean;
  searchQuery?: string | null;
  matchedCount?: number;
};

export type SedDocumentField = { label: string; value: string };
export type SedDocumentFile = { id: string; name: string; size: string | null; mime: string | null };
export type SedDocumentPage = { id: string; body: string };
export type SedDocumentCardMain = {
  docNumber: string | null;
  docDate: string | null;
  signature: string | null;
  executor: string | null;
  to: string | null;
  docKind: string | null;
  regPlace: string | null;
};
export type SedExecutionItem = {
  text: string;
  author: string | null;
  date: string | null;
  status: string | null;
};
export type SedDocumentCard = {
  id: string;
  title: string | null;
  summary: string | null;
  main: SedDocumentCardMain;
  files: SedDocumentFile[];
  pages: SedDocumentPage[];
  execution: SedExecutionItem[];
  sedUrl: string;
  fetchedAt: Date;
};

async function fetchSedRaw(jar: CookieJar, url: string, opts: RequestInit = {}) {
  const res = await fetch(url, { ...opts, headers: sedHeaders(jar, opts.headers as Record<string, string>), redirect: "manual" });
  jar.absorb(res);
  return res;
}

async function readSedHtml(res: Response) {
  if (res.status !== 200) return "";
  return decodeHtml(await res.arrayBuffer());
}

async function followSed(jar: CookieJar, res: Response, startUrl: string) {
  const base = sedBaseUrl();
  let finalUrl = startUrl;
  for (let i = 0; i < 6; i++) {
    if (res.status === 200) return { html: await readSedHtml(res), finalUrl, res };
    if (res.status < 300 || res.status >= 400) break;
    const loc = res.headers.get("location");
    if (!loc) break;
    finalUrl = loc.startsWith("http") ? loc : `${base}${loc.startsWith("/") ? "" : "/"}${loc}`;
    res = await fetchSedRaw(jar, finalUrl);
  }
  return { html: "", finalUrl, res };
}

function extractDnsIdFromHtml(html: string) {
  const fromHidden = html.match(/name="DNSID"\s+value="([^"]+)"/)?.[1];
  if (fromHidden) return fromHidden;
  const fromUrl = html.match(/DNSID=([A-Za-z0-9_-]+)/)?.[1];
  return fromUrl || "";
}

/** Вход в СЭД — одна сессия для последующих запросов */
export async function loginSedSession(input: SedLoginInput): Promise<SedSession> {
  const base = sedBaseUrl();
  const jar = new CookieJar();
  let res = await fetchSedRaw(jar, `${base}/auth.php?group_id=${encodeURIComponent(input.groupId)}`);
  let { html } = await followSed(jar, res, `${base}/auth.php?group_id=${input.groupId}`);
  const dnsId = extractDnsId(html) || extractDnsIdFromHtml(html);
  const postAction = extractFormAction(html, base);

  const fields = {
    DNSID: dnsId,
    group_id: input.groupId,
    user_id: input.userId,
    login: input.login,
    password: input.password,
    x: "1",
  };
  const body = encodeFormWin1251(fields);

  if (config.debug) {
    debugLog("sed", "login attempt", { groupId: input.groupId, userId: input.userId, login: input.login, action: postAction });
  }

  res = await fetchSedRaw(jar, postAction, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${base}/auth.php?group_id=${input.groupId}`,
      Origin: base,
    },
    body,
  });
  const { html: loggedInHtml, finalUrl } = await followSed(jar, res, postAction);

  const stillOnAuth = isAuthPage(loggedInHtml, finalUrl);
  if (stillOnAuth) {
    const errText = extractLoginError(loggedInHtml);
    throw new Error(errText || "Не удалось войти в СЭД — проверьте организацию, пользователя и пароль");
  }

  const sessionDnsId = extractDnsIdFromHtml(loggedInHtml) || dnsId;
  return { jar, dnsId: sessionDnsId, base };
}

const SED_SESSION_TTL_MS = 12 * 60 * 1000;
const sedSessionCache = new Map<string, { session: SedSession; expiresAt: number }>();
const sedFilesCache = new Map<string, { files: SedDocumentFile[]; expiresAt: number }>();
const SED_FILES_CACHE_TTL_MS = 10 * 60 * 1000;

function sedSessionCacheKey(input: SedLoginInput) {
  return `${input.groupId}:${input.userId}:${input.login}`;
}

export function invalidateSedSessionCache(input?: SedLoginInput) {
  if (!input) {
    sedSessionCache.clear();
    sedFilesCache.clear();
    return;
  }
  sedSessionCache.delete(sedSessionCacheKey(input));
}

/** Кэшированная сессия СЭД — один login на несколько запросов */
export async function getSedSession(input: SedLoginInput): Promise<SedSession> {
  const key = sedSessionCacheKey(input);
  const cached = sedSessionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.session;
  const session = await loginSedSession(input);
  sedSessionCache.set(key, { session, expiresAt: Date.now() + SED_SESSION_TTL_MS });
  return session;
}

function sedFilesCacheKey(session: SedSession, docId: string) {
  return `${session.dnsId}:${docId}`;
}

function stripHtmlText(fragment: string) {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tdByClass(rowHtml: string, classPart: string) {
  const re = new RegExp(`<td[^>]*document-list__td--${classPart}[^>]*>([\\s\\S]*?)<\\/td>`, "i");
  const m = rowHtml.match(re);
  return m ? stripHtmlText(m[1]) : null;
}

function parseAuthor(raw: string | null) {
  if (!raw) return null;
  const parts: string[] = [];
  const from = raw.match(/От\s*кого:\s*(.+?)(?=Кому:|$)/i)?.[1]?.trim();
  const to = raw.match(/Кому:\s*(.+?)(?=От\s*кого:|$)/i)?.[1]?.trim();
  if (from) parts.push(`От: ${from}`);
  if (to) parts.push(`Кому: ${to}`);
  if (parts.length) return parts.join(" · ");
  return raw || null;
}

function splitNumberDate(raw: string | null) {
  if (!raw) return { number: null, date: null };
  const m = raw.match(/^(.+?)\s+(\d{2}\.\d{2}\.\d{4})$/);
  if (m) return { number: m[1].trim(), date: m[2] };
  return { number: raw, date: null };
}

/** Парсинг списка «На рассмотрении» из HTML СЭД */
export function parseSedPendingDocuments(html: string, base: string, dnsId: string): SedPendingDocument[] {
  const rows = [...html.matchAll(/<tr[^>]*name="s-doc__item"[^>]*>([\s\S]*?)<\/tr>/gi)];
  const items: SedPendingDocument[] = [];
  for (const row of rows) {
    const rowHtml = row[0];
    const id = rowHtml.match(/data-docId="(\d+)"/)?.[1];
    if (!id) continue;
    const reg = splitNumberDate(tdByClass(rowHtml, "reg-date"));
    const out = splitNumberDate(tdByClass(rowHtml, "number-outbox"));
    const qs = dnsId ? `&DNSID=${encodeURIComponent(dnsId)}` : "";
    items.push({
      id,
      kind: tdByClass(rowHtml, "type"),
      number: reg.number,
      regDate: reg.date,
      outNumber: out.number,
      outDate: out.date,
      correspondent: parseAuthor(tdByClass(rowHtml, "author")),
      title: tdByClass(rowHtml, "short-content"),
      url: `${base}/document.card.php?id=${id}${qs}`,
      files: parseSedFiles(rowHtml),
    });
  }
  return items;
}

/** Подсказка периода и ссылка «за 30 дней / за весь период» */
export function parseSedPendingPeriod(html: string): SedPendingPeriod {
  const shownText =
    cleanSedText(html.match(/class="[^"]*s-hint__document-shown-text[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "") || null;
  const link = html.match(/<a[^>]*class="[^"]*s-hint__period-href[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
  if (!link) {
    return { shownText, toggleLabel: null, toggleUrl: null, wholePeriod: false };
  }
  const toggleLabel = cleanSedText(link[2]) || null;
  const toggleUrl = link[1].replace(/&amp;/g, "&").trim() || null;
  const wholePeriod = Boolean(toggleLabel && /30\s*дн/i.test(toggleLabel));
  return { shownText, toggleLabel, toggleUrl, wholePeriod };
}

function toRelativeListPath(fullUrl: string, base: string) {
  const url = new URL(fullUrl);
  const baseUrl = new URL(base);
  if (url.host !== baseUrl.host) return fullUrl;
  return url.pathname + url.search;
}

function buildListPagePath(listUrl: string, page: number) {
  const url = listUrl.startsWith("http") ? new URL(listUrl) : new URL(listUrl, "http://sed.local");
  url.searchParams.set("page", String(page));
  return url.pathname + url.search;
}

function extractPageFromHref(href: string) {
  const m = href.match(/[?&](?:page|list_page|p)=(\d+)/i);
  return m ? Number(m[1]) : 0;
}

/** Данные пагинации из inline-скрипта DocumentListData (initialProps) */
function parseSedDocumentListProps(html: string) {
  const pagesRaw = html.match(/pagesOptions:\s*(\{[^}]+\})/)?.[1];
  if (!pagesRaw && !html.includes("currentPageNumber:")) return null;

  let pagesOptions: { hasNextPage?: boolean; currentPage?: number } = {};
  if (pagesRaw) {
    try {
      pagesOptions = JSON.parse(pagesRaw) as { hasNextPage?: boolean; currentPage?: number };
    } catch {
      /* ignore malformed JSON */
    }
  }

  const currentPageNumber = Number(html.match(/currentPageNumber:\s*(\d+)/)?.[1] || 0);
  const loadPageUrl = html.match(/loadPageUrl:\s*'([^']+)'/)?.[1]?.replace(/&amp;/g, "&") || null;
  const currentPage = pagesOptions.currentPage || currentPageNumber || 1;

  return {
    currentPage: Math.max(1, currentPage),
    hasNextPage: Boolean(pagesOptions.hasNextPage),
    loadPageUrl,
  };
}

function buildPageFollowUrl(listUrl: string, page: number) {
  return buildListPagePath(listUrl, page);
}

/** Пагинация списка документов (initialProps.pagesOptions, s-pager, Vue-обёртка) */
export function parseSedPendingPagination(
  html: string,
  listUrl: string,
  base: string,
  hints?: { total?: number; pageSize?: number; currentPage?: number; hasNextPage?: boolean }
): SedPendingPagination {
  const listProps = html ? parseSedDocumentListProps(html) : null;

  let currentPage = Number(
    hints?.currentPage ||
      listProps?.currentPage ||
      extractPageFromHref(listUrl) ||
      1
  );
  const hasNextPage = hints?.hasNextPage ?? listProps?.hasNextPage ?? false;
  currentPage = Math.max(1, currentPage);

  const total = hints?.total ?? 0;
  const pageSize = hints?.pageSize && hints.pageSize > 0 ? hints.pageSize : 12;

  let totalPages = 1;
  if (total > 0 && pageSize > 0) {
    totalPages = Math.ceil(total / pageSize);
  } else if (!hasNextPage) {
    totalPages = currentPage;
  } else {
    totalPages = currentPage + 1;
  }
  totalPages = Math.max(1, totalPages);

  const pages: SedPaginationLink[] = [];
  for (let p = 1; p <= totalPages; p++) {
    pages.push({
      page: p,
      label: String(p),
      followUrl: buildPageFollowUrl(listUrl, p),
      current: p === currentPage,
    });
  }

  const prevUrl = currentPage > 1 ? buildPageFollowUrl(listUrl, currentPage - 1) : null;
  const nextUrl = hasNextPage ? buildPageFollowUrl(listUrl, currentPage + 1) : null;

  return { currentPage, totalPages, hasNextPage, pages, prevUrl, nextUrl };
}

function inferSedPageSize(
  itemCount: number,
  hasNextPage: boolean,
  currentPage: number,
  total: number,
  hintPageSize?: number
) {
  if (hintPageSize && hintPageSize > 0) return hintPageSize;
  if (hasNextPage && itemCount > 0) return itemCount;
  if (currentPage === 1 && itemCount > 0) return itemCount;
  if (total > 0 && !hasNextPage && currentPage > 1 && itemCount >= 0) {
    const prevPages = currentPage - 1;
    if (prevPages > 0 && total > itemCount) {
      return Math.max(1, Math.ceil((total - itemCount) / prevPages));
    }
  }
  return 12;
}

function filterSedPendingDocuments(items: SedPendingDocument[], search?: string) {
  const q = search?.trim().toLowerCase();
  if (!q) return items;
  return items.filter((d) =>
    [d.number, d.kind, d.correspondent, d.title, d.outNumber, d.regDate, d.outDate, d.id].some((v) =>
      v?.toLowerCase().includes(q)
    )
  );
}

function applySessionDnsToListUrl(session: SedSession, pathOrUrl: string) {
  const raw = decodeURIComponent(pathOrUrl).replace(/&amp;/g, "&").trim();
  const base = session.base;
  let url: URL;
  try {
    url =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? new URL(raw)
        : new URL(raw.startsWith("/") ? raw : `/${raw}`, base);
  } catch {
    throw new Error("Недопустимый адрес списка СЭД");
  }
  if (url.host !== new URL(base).host) throw new Error("Недопустимый адрес списка СЭД");
  if (!url.pathname.endsWith("document.php")) throw new Error("Недопустимый путь списка СЭД");
  url.searchParams.delete("DNSID");
  if (session.dnsId) url.searchParams.set("DNSID", session.dnsId);
  return url.toString();
}

function resolveSedListUrl(session: SedSession, followPath?: string) {
  if (followPath) return applySessionDnsToListUrl(session, followPath);
  const qs = session.dnsId ? `&DNSID=${encodeURIComponent(session.dnsId)}` : "";
  return `${session.base}/document.php?status=3${qs}`;
}

function readSedCounterValue(value: unknown) {
  if (Array.isArray(value)) return Number(value[0]) || 0;
  if (typeof value === "number") return value;
  return 0;
}

/** Total для текущего фильтра «на рассмотрении» (all / burning / urgent / other) */
function reviewListTotal(dashboard: SedReviewDashboard | null, followPath?: string) {
  if (!dashboard || !followPath) return null;
  if (followPath.includes("control_execution_link=burning")) return dashboard.burning;
  if (followPath.includes("control_execution_link=urgent")) return dashboard.urgent;
  if (followPath.includes("control_execution_link=other")) return dashboard.other;
  if (followPath.includes("control_execution_link=all") || followPath.includes("status=3")) {
    return dashboard.total;
  }
  return null;
}

function parseSedListTotalFromHtml(html: string) {
  const patterns = [
    /Незамедлительн[\s\S]{0,120}?\((\d+)\)/i,
    /Срочн[\s\S]{0,120}?\((\d+)\)/i,
    /Проч[\s\S]{0,120}?\((\d+)\)/i,
    /На\s+рассмотрении[\s\S]{0,120}?\((\d+)\)/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return Number(m[1]) || 0;
  }
  return null;
}

function rebuildSedPagination(
  listUrl: string,
  base: string,
  opts: { total: number; pageSize: number; currentPage: number; hasNextPageHint?: boolean },
) {
  const totalPages = Math.max(1, Math.ceil(opts.total / opts.pageSize));
  const currentPage = Math.min(Math.max(1, opts.currentPage), totalPages);
  const hasNextPage = currentPage < totalPages;
  return parseSedPendingPagination("", listUrl, base, {
    total: opts.total,
    pageSize: opts.pageSize,
    currentPage,
    hasNextPage,
  });
}

/** Счётчики «На рассмотрении» с дашборда control_execution (как на sed.omskgov.ru) */
export async function fetchSedReviewDashboard(session: SedSession): Promise<SedReviewDashboard | null> {
  const dns = session.dnsId ? `&DNSID=${encodeURIComponent(session.dnsId)}` : "";
  const countersUrl = `${session.base}/web/?url=controlExecution%2Fdashboard%2Fcounters${dns}`;

  async function readCounters() {
    const res = await fetchSedRaw(session.jar, countersUrl, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (res.status !== 200) return null;
    try {
      const json = JSON.parse(await res.text()) as {
        state?: boolean;
        data?: { review?: Record<string, unknown> };
      };
      if (!json.state || !json.data?.review) return null;
      const review = json.data.review;
      return {
        total: readSedCounterValue(review.all),
        burning: readSedCounterValue(review.burning),
        urgent: readSedCounterValue(review.urgent),
        other: readSedCounterValue(review.other),
      };
    } catch {
      return null;
    }
  }

  const direct = await readCounters();
  if (direct) return direct;

  const qs = session.dnsId ? `?DNSID=${encodeURIComponent(session.dnsId)}` : "";
  await fetchSedRaw(session.jar, `${session.base}/control_execution.php${qs}`);
  return readCounters();
}

/** Документы «На рассмотрении» — один вход, один запрос списка */
export async function listSedPendingDocuments(
  input: SedLoginInput,
  opts?: { followPath?: string; pageSize?: number; search?: string }
) {
  const session = await getSedSession(input);
  if (opts?.search?.trim()) {
    return fetchSedPendingSearch(session, opts.search.trim(), opts);
  }
  return fetchSedPendingList(session, opts);
}

/** Краткая сводка СЭД для панели управления */
export async function fetchSedCabinetPreview(userId: string) {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sedGroupId: true,
      sedUserId: true,
      sedLogin: true,
      sedPasswordEnc: true,
      sedLastTestOk: true,
    },
  });
  if (!row?.sedLastTestOk || !row.sedPasswordEnc || !row.sedGroupId || !row.sedUserId || !row.sedLogin) {
    return null;
  }
  try {
    const password = decryptSedPassword(row.sedPasswordEnc);
    const list = await listSedPendingDocuments(
      { groupId: row.sedGroupId, userId: row.sedUserId, login: row.sedLogin, password },
      { pageSize: 5 }
    );
    return {
      ok: true as const,
      dashboard: list.dashboard,
      items: list.items.slice(0, 5).map((d) => ({
        id: d.id,
        kind: d.kind,
        number: d.number,
        regDate: d.regDate,
        correspondent: d.correspondent,
        title: d.title,
        files: d.files,
      })),
      fetchedAt: list.fetchedAt,
    };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "СЭД недоступен",
      dashboard: null,
      items: [] as {
        id: string;
        kind: string | null;
        number: string | null;
        regDate: string | null;
        correspondent: string | null;
        title: string | null;
        files: SedDocumentFile[];
      }[],
    };
  }
}

type SedPendingPageResult = {
  items: SedPendingDocument[];
  total: number;
  period: SedPendingPeriod;
  pagination: SedPendingPagination;
  listPath: string;
  pageSize: number;
};

async function fetchSedPendingPage(
  session: SedSession,
  opts?: { followPath?: string; pageSize?: number; total?: number }
): Promise<SedPendingPageResult> {
  const listUrl = resolveSedListUrl(session, opts?.followPath);
  const res = await fetchSedRaw(session.jar, listUrl);
  const { html, finalUrl } = await followSed(session.jar, res, listUrl);
  if (!html || isAuthPage(html, finalUrl)) {
    throw new Error("Сессия СЭД истекла или список недоступен");
  }

  const items = parseSedPendingDocuments(html, session.base, session.dnsId);
  const listProps = parseSedDocumentListProps(html);
  const hasNextPageHint = listProps?.hasNextPage ?? false;
  const currentPage = listProps?.currentPage ?? extractPageFromHref(listUrl) ?? 1;
  const htmlTotal = parseSedListTotalFromHtml(html);
  const total = opts?.total ?? htmlTotal ?? items.length;
  const pageSize = inferSedPageSize(items.length, hasNextPageHint, currentPage, total, opts?.pageSize);
  const period = parseSedPendingPeriod(html);
  const pagination = rebuildSedPagination(listUrl, session.base, {
    total,
    pageSize,
    currentPage,
    hasNextPageHint,
  });
  const listPath = toRelativeListPath(listUrl, session.base);

  return { items, total, period, pagination, listPath, pageSize };
}

async function fetchSedPendingAllItems(
  session: SedSession,
  opts?: { followPath?: string; pageSize?: number; total?: number }
) {
  const seen = new Set<string>();
  const allItems: SedPendingDocument[] = [];
  let followPath = opts?.followPath;
  let pageSize = opts?.pageSize ?? 12;
  let period: SedPendingPeriod = {
    shownText: null,
    toggleLabel: null,
    toggleUrl: null,
    wholePeriod: false,
  };
  let listPath = "";
  let total = opts?.total ?? 0;

  for (let step = 0; step < 100; step++) {
    const page = await fetchSedPendingPage(session, { followPath, pageSize, total: total || undefined });
    period = page.period;
    listPath = page.listPath;
    pageSize = page.pageSize;
    if (!total) total = page.total;
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      allItems.push(item);
    }
    if (!page.pagination.hasNextPage || !page.pagination.nextUrl) break;
    followPath = page.pagination.nextUrl;
  }

  return { allItems, period, listPath, pageSize, total: total || allItems.length };
}

async function fetchSedPendingSearch(
  session: SedSession,
  search: string,
  opts?: { followPath?: string; pageSize?: number }
) {
  const dashboard = await fetchSedReviewDashboard(session);
  const filterTotal = reviewListTotal(dashboard, opts?.followPath);
  const allResult = await fetchSedPendingAllItems(session, {
    followPath: opts?.followPath,
    pageSize: opts?.pageSize,
    total: filterTotal ?? dashboard?.total,
  });
  const total = filterTotal ?? dashboard?.total ?? allResult.total;
  const matched = filterSedPendingDocuments(allResult.allItems, search);
  const emptyPagination: SedPendingPagination = {
    currentPage: 1,
    totalPages: 1,
    hasNextPage: false,
    pages: [],
    prevUrl: null,
    nextUrl: null,
  };

  return {
    items: matched,
    total,
    fetchedAt: new Date(),
    period: allResult.period,
    pagination: emptyPagination,
    listPath: allResult.listPath,
    dashboard,
    pageSize: allResult.pageSize,
    searchMode: true,
    searchQuery: search,
    matchedCount: matched.length,
  };
}

async function fetchSedPendingList(session: SedSession, opts?: { followPath?: string; pageSize?: number }) {
  const [dashboard, page] = await Promise.all([
    fetchSedReviewDashboard(session),
    fetchSedPendingPage(session, { followPath: opts?.followPath, pageSize: opts?.pageSize }),
  ]);
  const filterTotal = reviewListTotal(dashboard, opts?.followPath);
  const total = filterTotal ?? page.total;
  const pageSize = inferSedPageSize(
    page.items.length,
    page.pagination.hasNextPage,
    page.pagination.currentPage,
    total,
    page.pageSize || opts?.pageSize
  );
  const listUrl = resolveSedListUrl(session, opts?.followPath);
  const pagination = rebuildSedPagination(listUrl, session.base, {
    total,
    pageSize,
    currentPage: page.pagination.currentPage,
    hasNextPageHint: page.pagination.hasNextPage,
  });

  return {
    items: page.items,
    total,
    fetchedAt: new Date(),
    period: page.period,
    pagination,
    listPath: page.listPath,
    dashboard,
    pageSize,
  };
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanSedText(raw: string) {
  return decodeHtmlEntities(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

function guessMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "zip") return "application/zip";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return null;
}

/** Парсинг регистрационной карточки документа (maintable scrollable-section) */
export function parseSedDocumentCard(html: string, base: string, dnsId: string, docId: string): Omit<SedDocumentCard, "pages" | "fetchedAt"> {
  const title = cleanSedText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").split("|")[0]?.trim() || null;
  const maintable = extractMaintableInner(html);
  const main = parseMaintableSection(maintable);
  const summary = parseSedSummary(html, maintable);
  const files = parseSedFiles(html);
  const execution = parseSedExecution(html);

  const qs = dnsId ? `&DNSID=${encodeURIComponent(dnsId)}` : "";
  return {
    id: docId,
    title,
    summary,
    main,
    files,
    execution,
    sedUrl: `${base}/document.card.php?id=${docId}${qs}`,
  };
}

function extractMaintableInner(html: string) {
  const m = html.match(/<table[^>]*class="[^"]*maintable-width scrollable-section[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  return m?.[1] || "";
}

function parseSedSummary(html: string, maintable: string) {
  const fromAnnotation =
    cleanSedText(html.match(/class="[^"]*card-annotation-short-content[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "") || null;
  if (fromAnnotation) return fromAnnotation;

  const map = extractFieldMap(maintable);
  return pickField(map, "краткое содержание", "краткое содержимое", "содержание");
}

function normalizeFieldKey(label: string) {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function isGarbageValue(value: string) {
  return !value || value.length > 500 || /var\s|function\s*\(|Statuses\s*=|renderStatusRow/.test(value);
}

/** Извлекает пары «метка → значение» из строк maintable */
function extractFieldMap(tableInner: string) {
  const map = new Map<string, string>();
  for (const row of tableInner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (/table-width-setter|script|Statuses|info-row|Показать статусы/.test(row[0])) continue;
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => cleanSedText(c[1]));
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const inline = cell.match(/^(.{1,100}?):\s*(.*)$/);
      if (inline) {
        const key = normalizeFieldKey(inline[1]);
        const val = (inline[2] || cells[i + 1] || "").trim();
        if (!isGarbageValue(val)) map.set(key, val);
        if (!inline[2] && cells[i + 1]) i++;
        continue;
      }
      if (/^.+:\s*$/.test(cell) || cell.endsWith(":")) {
        const key = normalizeFieldKey(cell.replace(/:$/, "").replace(/\s*↓.*$/, "").trim());
        const val = (cells[i + 1] || "").trim();
        if (key && !isGarbageValue(val)) map.set(key, val);
        if (cells[i + 1]) i++;
      }
    }
  }
  return map;
}

function pickField(map: Map<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const v = map.get(normalizeFieldKey(k));
    if (v) return v;
  }
  return null;
}

function parseMaintableSection(tableInner: string): SedDocumentCardMain {
  const map = extractFieldMap(tableInner);
  let to = pickField(map, "кому");
  if (to) to = to.replace(/^адресаты\s*\(\d+\)\s*/i, "").trim();

  return {
    docNumber: pickField(map, "№ документа", "номер документа"),
    docDate: pickField(map, "дата документа"),
    signature: pickField(map, "подпись", "от кого"),
    executor: pickField(map, "исполнитель"),
    to,
    docKind: pickField(map, "вид документа"),
    regPlace: pickField(map, "место первичной регистрации"),
  };
}

function parseSedFiles(html: string): SedDocumentFile[] {
  const files: SedDocumentFile[] = [];
  const fileIds = new Set<string>();
  for (const m of html.matchAll(/href="(d_getfile\.php\?id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = m[2];
    if (fileIds.has(id)) continue;
    fileIds.add(id);
    let name = cleanSedText(m[3]);
    if (!name || name === "Перейти" || name === "Скачать") {
      const ctx = cleanSedText(m[0]);
      name = ctx.match(/([\w\u0400-\u04FF(). -]+\.(pdf|docx?|xlsx?|zip|rtf|jpg|jpeg|png))/i)?.[1] || `Файл ${id}`;
    }
    name = name.replace(/^\d+\.\s*/, "").replace(/\s*\([^)]+\)\s*$/, "").trim();
    const sizeMatch = cleanSedText(m[0]).match(/\(([\d,.]+\s*[KMG]?Б)\)/i);
    files.push({ id, name, size: sizeMatch?.[1] || null, mime: guessMime(name) });
  }
  return files;
}

function parseSedExecution(html: string): SedExecutionItem[] {
  const items: SedExecutionItem[] = [];

  for (const table of html.matchAll(/<table[^>]*class="[^"]*s-resolutions-table[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)) {
    for (const row of table[1].matchAll(/<tr[^>]*\bclass="[^"]*\bresolution-item\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const item = parseResolutionItemRow(row[1]);
      if (item) items.push(item);
    }
  }

  if (!items.length) {
    const blockStart = html.search(/s-resolutions-table|id="rez-list"|Исполнение документа/i);
    const block = blockStart >= 0 ? html.slice(blockStart, blockStart + 250000) : html;
    for (const row of block.matchAll(/<tr[^>]*\bclass="[^"]*\bresolution-item\b[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const item = parseResolutionItemRow(row[1]);
      if (item) items.push(item);
    }
  }

  const seen = new Set<string>();
  return items
    .filter((it) => {
      const key = it.text.slice(0, 160);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

function parseResolutionItemRow(rowHtml: string): SedExecutionItem | null {
  const prefix =
    cleanSedText(rowHtml.match(/class="[^"]*resolution-item__prefix[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "") || "";
  const author =
    cleanSedText(rowHtml.match(/class="[^"]*resolution-item__author[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "") || null;
  const authorInfo =
    cleanSedText(rowHtml.match(/class="[^"]*resolution-item__author-info[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "") ||
    null;
  const timestamp =
    cleanSedText(rowHtml.match(/class="[^"]*resolution-item__timestamp[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "") || null;
  const date = timestamp.match(/\d{2}\.\d{2}\.\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/)?.[0] || null;

  const recipients = [...rowHtml.matchAll(/class="[^"]*to-user-container[^"]*"[^>]*>([\s\S]*?)<\//gi)]
    .map((m) => cleanSedText(m[1]))
    .filter(Boolean);

  const comment =
    cleanSedText(
      rowHtml.match(/class="[^"]*document-execution-commentary[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ||
        rowHtml.match(/class="[^"]*resolution-item__row--text[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] ||
        ""
    ) || null;

  const fullAuthor = [prefix, author].filter(Boolean).join(" ").trim() || null;
  const lines: string[] = [];
  if (fullAuthor) lines.push(fullAuthor);
  if (authorInfo) lines.push(authorInfo);
  if (timestamp && !lines.some((l) => l.includes(date || ""))) lines.push(timestamp.trim());
  if (recipients.length) lines.push(`Кому: ${recipients.join(", ")}`);
  if (comment) lines.push(comment);

  let text = lines.join("\n").trim();
  if (!text) {
    text = cleanSedText(rowHtml)
      .replace(/\b(Подробно|Исполнение|Добавить подрезолюцию|Скачать|История|Удалить|Правка)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (text.length < 6 || isGarbageValue(text)) return null;
  if (/^Развернуть/i.test(text)) return null;

  return { text, author: fullAuthor, date, status: comment };
}

async function fetchSedPagesLayout(session: SedSession, docId: string): Promise<SedDocumentPage[]> {
  const url = `${session.base}/web/?url=document/pages/layout&id=${encodeURIComponent(docId)}&DNSID=${encodeURIComponent(session.dnsId)}`;
  const res = await fetchSedRaw(session.jar, url, { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } });
  const { html } = await followSed(session.jar, res, url);
  if (!html) return [];
  try {
    const json = JSON.parse(html) as { state?: boolean; data?: Record<string, { body?: string }> };
    if (!json.state || !json.data) return [];
    return Object.entries(json.data)
      .filter(([, row]) => row.body?.trim())
      .map(([id, row]) => ({ id, body: row.body!.trim() }));
  } catch {
    return [];
  }
}

/** HTML рег. карточки документа (без текста страниц) */
async function fetchSedCardHtml(session: SedSession, docId: string) {
  const cardUrl = `${session.base}/document.card.php?id=${encodeURIComponent(docId)}&DNSID=${encodeURIComponent(session.dnsId)}`;
  const res = await fetchSedRaw(session.jar, cardUrl);
  const { html, finalUrl } = await followSed(session.jar, res, cardUrl);
  if (!html || isAuthPage(html, finalUrl)) {
    throw new Error("Не удалось открыть карточку документа в СЭД");
  }
  return html;
}

function uniqueArchiveName(name: string, used: Map<string, number>) {
  const n = used.get(name) || 0;
  used.set(name, n + 1);
  if (n === 0) return name;
  const dot = name.lastIndexOf(".");
  if (dot > 0) {
    return `${name.slice(0, dot)} (${n + 1})${name.slice(dot)}`;
  }
  return `${name} (${n + 1})`;
}

async function buildSedFilesZip(session: SedSession, files: SedDocumentFile[]) {
  return new Promise<Buffer>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);
    archive.pipe(stream);

    (async () => {
      const used = new Map<string, number>();
      for (const f of files) {
        const file = await fetchSedFileFromSession(session, f.id, f.name);
        archive.append(file.data, { name: uniqueArchiveName(file.name, used) });
      }
      await archive.finalize();
    })().catch(reject);
  });
}

/** Список вложений документа */
export async function getSedDocumentFiles(input: SedLoginInput, docId: string) {
  const session = await getSedSession(input);
  const cacheKey = sedFilesCacheKey(session, docId);
  const cached = sedFilesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { files: cached.files };

  const html = await fetchSedCardHtml(session, docId);
  const files = parseSedFiles(html);
  sedFilesCache.set(cacheKey, { files, expiresAt: Date.now() + SED_FILES_CACHE_TTL_MS });
  return { files };
}

/** ZIP-архив вложений документа */
export async function buildSedDocumentFilesArchive(input: SedLoginInput, docId: string, fileIds?: string[]) {
  const session = await getSedSession(input);
  const html = await fetchSedCardHtml(session, docId);
  let files = parseSedFiles(html);
  if (fileIds?.length) {
    const set = new Set(fileIds);
    files = files.filter((f) => set.has(f.id));
  }
  if (!files.length) throw new Error("Нет вложений для скачивания");
  const data = await buildSedFilesZip(session, files);
  return { data, name: `document-${docId}.zip` };
}

function decodeContentDispositionFilename(cd: string, fallback: string) {
  if (!cd) return fallback;

  const star = cd.match(/filename\*=(?:UTF-8''|utf-8'')([^;\n]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }

  const quoted = cd.match(/filename="([^"]*)"/i)?.[1] ?? cd.match(/filename='([^']*)'/i)?.[1];
  if (quoted) {
    if (/[\u0400-\u04FF]/.test(quoted)) return quoted;
    if (/[\x80-\xff]/.test(quoted) || /[ÐÑÃ]/.test(quoted)) {
      try {
        return iconv.decode(Buffer.from(quoted, "latin1"), "win1251");
      } catch {
        return quoted;
      }
    }
    return quoted;
  }

  const plain = cd.match(/filename=([^;\n]+)/i)?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (plain) {
    try {
      return decodeURIComponent(plain);
    } catch {
      return plain;
    }
  }

  return fallback;
}

function resolveSedContentType(name: string, fromSed: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "rtf") return "application/rtf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (fromSed && fromSed !== "application/octet-stream") return fromSed;
  return "application/octet-stream";
}

export function sedContentDisposition(fileName: string, inline: boolean) {
  const disp = inline ? "inline" : "attachment";
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape);
  const ascii = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/_+/g, "_") || "file";
  return `${disp}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Скачивание вложения из СЭД через активную сессию */
async function fetchSedFileFromSession(session: SedSession, fileId: string, hintName?: string) {
  const url = `${session.base}/d_getfile.php?id=${encodeURIComponent(fileId)}&DNSID=${encodeURIComponent(session.dnsId)}`;
  const res = await fetch(url, {
    headers: sedHeaders(session.jar),
    redirect: "follow",
  });
  if (!res.ok) throw new Error("Файл недоступен в СЭД");
  const data = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "application/octet-stream";
  const cd = res.headers.get("content-disposition") || "";
  const fallback = hintName?.trim() || `file-${fileId}`;
  const decoded = decodeContentDispositionFilename(cd, fallback);
  const name = hintName?.trim() || decoded;
  return { data, contentType: resolveSedContentType(name, ct.split(";")[0].trim()), name };
}

/** Регистрационная карточка — один вход, карточка + текст страниц */
export async function getSedDocumentCard(input: SedLoginInput, docId: string) {
  const session = await getSedSession(input);
  const [html, pages] = await Promise.all([
    fetchSedCardHtml(session, docId),
    fetchSedPagesLayout(session, docId),
  ]);
  const parsed = parseSedDocumentCard(html, session.base, session.dnsId, docId);
  const files = parseSedFiles(html);
  sedFilesCache.set(sedFilesCacheKey(session, docId), {
    files,
    expiresAt: Date.now() + SED_FILES_CACHE_TTL_MS,
  });
  return { ...parsed, pages, fetchedAt: new Date() };
}

/** Скачивание вложения из СЭД */
export async function fetchSedFile(input: SedLoginInput, fileId: string, hintName?: string) {
  const session = await getSedSession(input);
  return fetchSedFileFromSession(session, fileId, hintName);
}

function sedFileExt(name: string) {
  const p = name.split(".").pop();
  return p && p !== name ? p.toLowerCase() : "";
}

function escapePreviewHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Текстовый предпросмотр legacy .doc (Word 97–2003) */
export async function previewSedDocFile(input: SedLoginInput, fileId: string, hintName?: string) {
  const file = await fetchSedFile(input, fileId, hintName);
  if (sedFileExt(file.name) !== "doc") {
    throw new Error("Предпросмотр через API доступен только для .doc");
  }
  const WordExtractor = (await import("word-extractor")).default;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(file.data);
  const body = doc.getBody().trim() || "Документ пуст";
  const html = `<div class="sed-doc-legacy-preview"><pre>${escapePreviewHtml(body)}</pre></div>`;
  return { html, kind: "doc" as const };
}

function extractLoginError(html: string) {
  const block = html.match(/login-form__error[^>]*>([\s\S]*?)<\/p>/i);
  if (block?.[1]) {
    const text = block[1].replace(/<[^>]+>/g, "").trim();
    if (text) return text;
  }
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const attempts = plain.match(/остал[^\d]*(\d+)[^\d]*попыт/i);
  if (attempts) return `Неверный логин или пароль. Осталось ${attempts[1]} попыток входа`;
  if (/неверн/i.test(html) && /парол|имя/i.test(html)) return "Неверный логин или пароль";
  if (/заблокирован/i.test(html)) return "Учётная запись временно заблокирована";
  return "";
}

function isAuthPage(html: string, url: string) {
  return url.includes("auth.php") || html.includes('id="login_form"') || html.includes("login-form__");
}

/** Проверка подключения к СЭД */
export async function testSedLogin(input: SedLoginInput) {
  try {
    invalidateSedSessionCache(input);
    await loginSedSession(input);
    return { ok: true as const, message: "Подключение успешно" };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Не удалось войти в СЭД — проверьте организацию, пользователя и пароль",
    };
  }
}

export function sedPublicConfig() {
  return { baseUrl: sedBaseUrl(), debug: config.debug };
}
