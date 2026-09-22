type Props = {
  /** Название организации внутри знака (настройка brand_org_name) */
  orgName?: string;
  /** dark=true — тёмный текст для светлого фона (страница входа) */
  dark?: boolean;
  className?: string;
};

const GOLD = "#d4af37";
const NAVY = "#1e3a5f";

/** Фирменный знак «волна в кольце» + название — единый SVG-локап */
export function Logo({ orgName = "УДХБ", dark = false, className }: Props) {
  const ink = dark ? NAVY : "#ffffff";
  const name = orgName.trim().toUpperCase() || "УДХБ";
  // Ширина полотна подстраивается под длину названия
  const textW = 84 + name.length * 15.5;
  const vbw = Math.max(212, Math.ceil(textW));
  return (
    <svg
      viewBox={`0 0 ${vbw} 64`}
      className={className}
      role="img"
      aria-label={`Экосистема ${orgName}`}
    >
      <circle cx="32" cy="32" r="30.2" fill="none" stroke={GOLD} strokeWidth="1.7" />
      <circle cx="32" cy="32" r="26.8" fill="none" stroke={GOLD} strokeWidth=".7" opacity=".55" />
      <g stroke={GOLD} strokeLinecap="round" fill="none">
        <path d="M16 27 q4 -4.5 8 0 t8 0 t8 0 t8 0" strokeWidth="2.1" />
        <path d="M16 35 q4 -4.5 8 0 t8 0 t8 0 t8 0" strokeWidth="1.6" opacity=".75" />
        <path d="M16 43 q4 -4.5 8 0 t8 0 t8 0 t8 0" strokeWidth="1.2" opacity=".45" />
      </g>
      <text
        x="74"
        y="30"
        fontFamily="Georgia, 'Playfair Display', 'PT Serif', serif"
        fontWeight="700"
        fontSize="21"
        fill={ink}
        letterSpacing="2.5"
      >
        {name}
      </text>
      <line x1="74" y1="38" x2={vbw - 24} y2="38" stroke={GOLD} strokeWidth=".8" opacity=".8" />
      <text x="74" y="50" fontFamily="Verdana, Arial, sans-serif" fontSize="8.4" fill={GOLD} letterSpacing="3.2">
        ЭКОСИСТЕМА
      </text>
    </svg>
  );
}
