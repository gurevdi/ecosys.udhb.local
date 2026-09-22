import type { Me } from "../App";
import {
  NAV_DEFINITIONS,
  defaultNavWeightsFor,
  navWeight,
  parseNavWeights,
  type NavItemId,
} from "../lib/nav";

type Props = {
  me: Me;
  can: (resource: string) => boolean;
  weights: Record<string, number>;
  onChange: (weights: Record<string, number>) => void;
};

export function NavWeightsEditor({ me, can, weights, onChange }: Props) {
  const visible = NAV_DEFINITIONS.filter((item) => item.visible(me, can));
  const sorted = [...visible].sort(
    (a, b) => navWeight(a, weights) - navWeight(b, weights) || a.label.localeCompare(b.label, "ru")
  );

  function setWeight(id: NavItemId, value: number) {
    onChange({ ...weights, [id]: Math.max(0, Math.min(9999, value)) });
  }

  function move(id: NavItemId, dir: -1 | 1) {
    const idx = sorted.findIndex((i) => i.id === id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    const w1 = navWeight(sorted[idx], weights);
    const w2 = navWeight(swap, weights);
    onChange({ ...weights, [sorted[idx].id]: w2, [swap.id]: w1 });
  }

  return (
    <div className="nav-weights">
      <div className="nav-weights-head">
        <p className="muted">
          Меньший вес — выше в меню. Настройте порядок разделов в боковой колонке.
        </p>
        <button
          type="button"
          className="btn ghost btn-sm"
          onClick={() => onChange(defaultNavWeightsFor(me, can))}
        >
          Сбросить
        </button>
      </div>
      <div className="nav-weights-list">
        {sorted.map((item, index) => (
          <div key={item.id} className="nav-weights-row">
            <span className="nav-weights-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="nav-weights-label">{item.label}</span>
            <div className="nav-weights-controls">
              <button
                type="button"
                className="btn ghost btn-sm"
                disabled={index === 0}
                onClick={() => move(item.id, -1)}
                title="Выше"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn ghost btn-sm"
                disabled={index === sorted.length - 1}
                onClick={() => move(item.id, 1)}
                title="Ниже"
              >
                ↓
              </button>
              <input
                type="number"
                className="nav-weights-input"
                min={0}
                max={9999}
                value={navWeight(item, weights)}
                onChange={(e) => setWeight(item.id, Number(e.target.value) || 0)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function initialNavWeights(me: Me, can: (resource: string) => boolean) {
  const saved = parseNavWeights(me.user.navWeights);
  return { ...defaultNavWeightsFor(me, can), ...saved };
}
