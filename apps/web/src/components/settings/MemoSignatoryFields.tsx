import type { MemoSignatory } from "../../lib/memo-signatories";
import { memoAddresseeLines } from "../../lib/memo-signatories";

export function MemoSignatoryFields({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: MemoSignatory;
  onChange: (next: MemoSignatory) => void;
}) {
  function set<K extends keyof MemoSignatory>(key: K, v: string) {
    onChange({ ...value, [key]: v });
  }

  const previewLines = memoAddresseeLines({
    addressee: "director",
    addresseePositionDative: value.positionDative,
    addresseeDative: value.dative,
  });

  return (
    <fieldset className="memo-signatory-block">
      <legend>{title}</legend>
      <p className="muted memo-signatory-hint">{hint}</p>
      <div className="memo-signatory-grid">
        <div className="field">
          <label>Должность (именительный)</label>
          <input
            value={value.position}
            onChange={(e) => set("position", e.target.value)}
            placeholder="Директор"
          />
        </div>
        <div className="field">
          <label>Должность (дательный падеж)</label>
          <input
            value={value.positionDative}
            onChange={(e) => set("positionDative", e.target.value)}
            placeholder="директору"
            required
          />
        </div>
        <div className="field">
          <label>Фамилия Имя Отчество</label>
          <input
            value={value.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            placeholder="Глебов Александр Александрович"
          />
        </div>
        <div className="field">
          <label>Фамилия И.О.</label>
          <input
            value={value.shortName}
            onChange={(e) => set("shortName", e.target.value)}
            placeholder="Глебов А.А."
          />
        </div>
        <div className="field">
          <label>Фамилия И.О. (дательный падеж)</label>
          <input
            value={value.dative}
            onChange={(e) => set("dative", e.target.value)}
            placeholder="Глебову А.А."
            required
          />
        </div>
      </div>
      <div className="memo-signatory-preview">
        <span className="muted">В СЗ:</span>
        <div className="memo-addressee-preview-block">
          <span>Кому:</span>
          {previewLines.map((line) => (
            <strong key={line}>{line}</strong>
          ))}
        </div>
      </div>
    </fieldset>
  );
}
