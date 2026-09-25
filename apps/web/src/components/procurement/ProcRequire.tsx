import type { WorkflowCheck } from "../../lib/proc-workflow";
import { checkTarget, type ProcCardSectionId } from "../../lib/proc-workflow";

export function ProcRequire({
  checks,
  extra,
  onFocus,
}: {
  checks: WorkflowCheck[];
  extra?: { text: string; danger: boolean; section?: ProcCardSectionId }[];
  onFocus: (section: ProcCardSectionId, focus?: string) => void;
}) {
  const items: { id: string; text: string; danger: boolean; section: ProcCardSectionId; focus?: string; actionLabel?: string }[] = [];

  for (const c of checks) {
    const t = checkTarget(c.id);
    items.push({
      id: c.id,
      text: c.message,
      danger: c.level === "blocker",
      section: t.section,
      focus: t.focus,
      actionLabel: t.actionLabel,
    });
  }
  for (const e of extra || []) {
    items.push({
      id: `extra-${e.text}`,
      text: e.text,
      danger: e.danger,
      section: e.section || "execution",
      actionLabel: "перейти",
    });
  }

  if (items.length === 0) return null;

  const primary = items.find((i) => i.danger) || items[0];
  const rest = items.filter((i) => i !== primary).length;

  return (
    <div className={`require require--lean${primary.danger ? " require--danger" : ""}`} id="proc-require">
      <div className="require-lean-main">
        <span className="stamp">К исполнению</span>
        <p className="require-lean-text">{primary.text}</p>
        {primary.actionLabel && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onFocus(primary.section, primary.focus)}
          >
            {primary.actionLabel}
          </button>
        )}
      </div>
      {rest > 0 && (
        <p className="require-lean-more muted">
          ещё {rest}{" "}
          {rest === 1 ? "пункт" : rest < 5 ? "пункта" : "пунктов"}
          {" — "}
          <button type="button" className="btn-link" onClick={() => onFocus(items[1].section, items[1].focus)}>
            следующий
          </button>
        </p>
      )}
    </div>
  );
}
