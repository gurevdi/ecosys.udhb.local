import { Link } from "react-router-dom";
import {
  SED_REVIEW_METRICS,
  sedReviewMetricValue,
  sedReviewNavTo,
  type SedReviewDashboard,
  type SedReviewMetricKey,
} from "../../lib/sedReviewMetrics";

export function SedReviewMetrics({
  dashboard,
  fallbackTotal,
  activeKey,
  onSelect,
  busy,
  className,
}: {
  dashboard?: SedReviewDashboard | null;
  fallbackTotal?: number;
  activeKey?: SedReviewMetricKey;
  onSelect?: (key: SedReviewMetricKey) => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div className={`sed-metrics sed-metrics--dashboard${className ? ` ${className}` : ""}`}>
      {SED_REVIEW_METRICS.map((metric) => {
        const active = activeKey === metric.key;
        const content = (
          <>
            <span className="sed-metric-label">{metric.label}</span>
            <span className="sed-metric-value">{sedReviewMetricValue(dashboard, metric.key, fallbackTotal)}</span>
          </>
        );

        if (onSelect) {
          return (
            <button
              key={metric.key}
              type="button"
              className={`sed-metric sed-metric-btn ${metric.className}${active ? " sed-metric--active" : ""}`}
              disabled={busy}
              aria-pressed={active}
              onClick={() => onSelect(metric.key)}
            >
              {content}
            </button>
          );
        }

        return (
          <Link key={metric.key} to={sedReviewNavTo(metric.key)} className={`sed-metric sed-metric-link ${metric.className}`}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
