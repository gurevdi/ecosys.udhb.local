import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export type Supplier = {
  id: string;
  name: string;
  inn: string | null;
  phone: string | null;
  comment: string | null;
};

export function SupplierCombo({
  value,
  supplierId,
  extra,
  required,
  invalid,
  onChange,
  disabled,
}: {
  value: string;
  supplierId: string;
  extra: { inn: string; phone: string; comment: string };
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (next: { name: string; supplierId: string; inn: string; phone: string; comment: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Supplier[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    const t = window.setTimeout(() => {
      api<Supplier[]>(`/api/suppliers${q ? `?q=${encodeURIComponent(q)}` : ""}`)
        .then(setItems)
        .catch(() => setItems([]));
    }, 200);
    return () => window.clearTimeout(t);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s: Supplier) {
    onChange({
      name: s.name,
      supplierId: s.id,
      inn: s.inn || extra.inn,
      phone: s.phone || extra.phone,
      comment: s.comment || extra.comment,
    });
    setOpen(false);
  }

  return (
    <div className="supplier-combo" ref={box}>
      <div className={invalid ? "field field-invalid" : "field"}>
        <label>Поставщик (наименование)</label>
        <input
          value={value}
          disabled={disabled}
          required={required}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => onChange({ name: e.target.value, supplierId: "", inn: extra.inn, phone: extra.phone, comment: extra.comment })}
        />
        {open && items.length > 0 && (
          <ul className="supplier-combo-list">
            {items.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => pick(s)}>
                  <strong>{s.name}</strong>
                  <span>{[s.inn, s.phone, s.comment].filter(Boolean).join(" · ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="proc-form-grid">
        <div className="field">
          <label>ИНН</label>
          <input
            value={extra.inn}
            disabled={disabled}
            onChange={(e) => onChange({ name: value, supplierId, inn: e.target.value, phone: extra.phone, comment: extra.comment })}
          />
        </div>
        <div className="field">
          <label>Телефон</label>
          <input
            value={extra.phone}
            disabled={disabled}
            onChange={(e) => onChange({ name: value, supplierId, inn: extra.inn, phone: e.target.value, comment: extra.comment })}
          />
        </div>
        <div className="field proc-span-2">
          <label>Комментарий / менеджер</label>
          <input
            value={extra.comment}
            disabled={disabled}
            placeholder="необязательно"
            onChange={(e) => onChange({ name: value, supplierId, inn: extra.inn, phone: extra.phone, comment: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
