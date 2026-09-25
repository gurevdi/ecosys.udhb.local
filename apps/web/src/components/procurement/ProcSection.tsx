import { type ReactNode, useEffect, useState } from "react";
import type { ProcCardSectionId, SectionVis } from "../../lib/proc-workflow";
import { SECTION_STUB_HINT } from "../../lib/proc-workflow";

export function ProcSection({
  id,
  title,
  hint,
  action,
  vis,
  summary,
  forceOpen,
  onToggle,
  children,
}: {
  id: ProcCardSectionId;
  title: string;
  hint?: string;
  action?: ReactNode;
  vis: SectionVis;
  summary?: ReactNode;
  forceOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(vis === "active");

  useEffect(() => {
    if (vis === "active" || forceOpen) setOpen(true);
    else if (vis === "stub") setOpen(false);
    else if (vis === "collapsed" && !forceOpen) setOpen(false);
  }, [vis, forceOpen]);

  function toggle() {
    if (vis === "stub") return;
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  }

  if (vis === "stub") {
    return (
      <section className="sec sec--stub" id={`proc-sec-${id}`} data-section={id}>
        <div className="sec-head">
          <h2 className="sec-title">{title}</h2>
          <span className="st st--muted">ожидает</span>
        </div>
        <p className="note">{SECTION_STUB_HINT[id] || "Раздел активируется позже"}</p>
      </section>
    );
  }

  if (vis === "collapsed" && !open) {
    return (
      <section className="sec sec--collapsed" id={`proc-sec-${id}`} data-section={id}>
        <div className="sec-head">
          <button type="button" className="sec-toggle" onClick={toggle}>
            <h2 className="sec-title">{title}</h2>
            <span className="sec-toggle-hint">развернуть</span>
          </button>
          {action}
        </div>
        {summary && <div className="sec-summary">{summary}</div>}
      </section>
    );
  }

  return (
    <section className={`sec${vis === "collapsed" ? " sec--expanded" : ""}`} id={`proc-sec-${id}`} data-section={id}>
      <div className="sec-head">
        <div>
          {vis === "collapsed" ? (
            <button type="button" className="sec-toggle" onClick={toggle}>
              <h2 className="sec-title">{title}</h2>
              <span className="sec-toggle-hint">свернуть</span>
            </button>
          ) : (
            <>
              <h2 className="sec-title">{title}</h2>
              {hint && <p className="muted">{hint}</p>}
            </>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
