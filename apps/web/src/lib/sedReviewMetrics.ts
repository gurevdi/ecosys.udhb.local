export type SedReviewMetricKey = "all" | "burning" | "urgent" | "other";

export type SedReviewDashboard = {
  total: number;
  burning: number;
  urgent: number;
  other: number;
};

const REVIEW_LIST_BASE =
  "/document.php?forceuser=1&in_work=1&control_execution_block=review&control_execution_link=";

export const SED_REVIEW_METRICS: {
  key: SedReviewMetricKey;
  label: string;
  className: string;
}[] = [
  { key: "all", label: "На рассмотрении", className: "sed-metric--accent" },
  { key: "burning", label: "Незамедлительные", className: "sed-metric--burning" },
  { key: "urgent", label: "Срочные", className: "sed-metric--urgent" },
  { key: "other", label: "Прочие", className: "sed-metric--other" },
];

export function sedReviewFollowPath(key: SedReviewMetricKey) {
  return `${REVIEW_LIST_BASE}${key}`;
}

export function sedReviewMetricValue(
  dashboard: SedReviewDashboard | null | undefined,
  key: SedReviewMetricKey,
  fallbackTotal?: number,
) {
  if (!dashboard) return fallbackTotal != null && key === "all" ? fallbackTotal : "—";
  switch (key) {
    case "all":
      return dashboard.total ?? fallbackTotal ?? "—";
    case "burning":
      return dashboard.burning ?? "—";
    case "urgent":
      return dashboard.urgent ?? "—";
    case "other":
      return dashboard.other ?? "—";
  }
}

export function sedReviewNavTo(key: SedReviewMetricKey) {
  return key === "all" ? "/sed" : `/sed?review=${key}`;
}

export function parseReviewMetricKey(raw: string | null): SedReviewMetricKey {
  if (raw === "burning" || raw === "urgent" || raw === "other") return raw;
  return "all";
}
