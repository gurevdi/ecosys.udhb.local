/** Часовой пояс организации (Омск, UTC+6) */
export const APP_TIMEZONE = "Asia/Omsk";

/** Текущий календарный год в Asia/Omsk */
export function currentYearInAppTz(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  return Number(year || new Date().getFullYear());
}

/** Год по умолчанию: текущий, иначе ближайший не будущий из настроек */
export function pickDefaultContractYear(years: number[], currentYear = currentYearInAppTz()): number | null {
  if (!years.length) return null;
  if (years.includes(currentYear)) return currentYear;
  const notFuture = years.filter((y) => y <= currentYear).sort((a, b) => b - a);
  if (notFuture.length) return notFuture[0];
  return Math.min(...years);
}
