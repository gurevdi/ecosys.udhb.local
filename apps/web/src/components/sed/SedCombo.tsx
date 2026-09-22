import { useEffect, useRef } from "react";

export type SedOption = { id: string; label: string };

export function SedCombo({
  label,
  disabled,
  selectedId,
  selectedLabel,
  placeholder,
  items,
  open,
  onOpen,
  onClose,
  query,
  onQueryChange,
  onPick,
  onClear,
}: {
  label: string;
  disabled?: boolean;
  selectedId: string;
  selectedLabel: string;
  placeholder: string;
  items: SedOption[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  query: string;
  onQueryChange: (v: string) => void;
  onPick: (item: SedOption) => void;
  onClear: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (selectedId && selectedLabel) {
    return (
      <div className="field">
        <label>{label}</label>
        <div className="sed-chosen">
          <span>{selectedLabel}</span>
          <button type="button" className="btn ghost btn-sm" onClick={onClear} disabled={disabled}>
            Изменить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field sed-combo" ref={wrapRef}>
      <label>{label}</label>
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value);
          onOpen();
        }}
        onFocus={() => onOpen()}
      />
      {open && items.length > 0 && (
        <ul className="sed-picker" role="listbox">
          {items.slice(0, 20).map((item) => (
            <li key={item.id} role="option">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(item);
                  onClose();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query && items.length === 0 && <p className="sed-picker-empty muted">Ничего не найдено</p>}
    </div>
  );
}
