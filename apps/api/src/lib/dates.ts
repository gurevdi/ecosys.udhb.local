import { APP_TIMEZONE } from "./time.ts";

/** Календарный день YYYY-MM-DD в Asia/Omsk */
export function dateOnlyKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Дата из поля <input type="date"> без сдвига из‑за UTC.
 * Храним полдень UTC, чтобы календарный день совпадал в Омске и в UTC.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(date: Date, days: number): Date {
  const key = dateOnlyKey(date);
  if (!key) return date;
  const [y, m, d] = key.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + days, 12, 0, 0);
  return new Date(utc);
}

export function yearOf(value: Date | string | null | undefined): number | null {
  const key = dateOnlyKey(value);
  if (!key) return null;
  return Number(key.slice(0, 4));
}

/** Дата окончания не раньше даты начала — только календарные дни, без createdAt */
export function endBeforeStart(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined
): boolean {
  const a = dateOnlyKey(start);
  const b = dateOnlyKey(end);
  if (!a || !b) return false;
  return b < a;
}
