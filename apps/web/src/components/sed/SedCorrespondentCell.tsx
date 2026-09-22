import { useEffect, useRef, useState } from "react";

type Props = {
  text: string | null;
};

export function SedCorrespondentCell({ text }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  if (!text) return <span className="sed-muted-dash">—</span>;

  return (
    <>
      <div
        ref={ref}
        className={`sed-correspondent-text${truncated ? " sed-correspondent-text--truncated" : ""}`}
        role={truncated ? "button" : undefined}
        tabIndex={truncated ? 0 : undefined}
        title={truncated ? "Показать полностью" : undefined}
        onClick={
          truncated
            ? (e) => {
                e.stopPropagation();
                setOpen(true);
              }
            : undefined
        }
        onKeyDown={
          truncated
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(true);
                }
              }
            : undefined
        }
      >
        {text}
      </div>
      {open && (
        <div className="modal-backdrop sed-correspondent-backdrop" onClick={() => setOpen(false)} role="presentation">
          <div
            className="modal sed-correspondent-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sed-correspondent-title"
          >
            <div className="modal-head">
              <h2 id="sed-correspondent-title">Корреспондент</h2>
              <button type="button" className="btn ghost btn-sm" onClick={() => setOpen(false)}>
                Закрыть
              </button>
            </div>
            <div className="modal-body sed-correspondent-modal-body">{text}</div>
          </div>
        </div>
      )}
    </>
  );
}
