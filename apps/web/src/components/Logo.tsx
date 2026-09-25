type Props = {
  /** Название организации внутри знака (настройка brand_org_name) */
  orgName?: string;
  /** dark=true — тёмный текст для светлого фона (страница входа) */
  dark?: boolean;
  /** Только эмблема (кольцо + волны), без текста */
  markOnly?: boolean;
  className?: string;
};

const GOLD = "#d4af37";
const NAVY = "#1e3a5f";

function Mark() {
  return (
    <>
      <circle cx="20" cy="20" r="18.4" fill="none" stroke={GOLD} strokeWidth="1.4" />
      <circle cx="20" cy="20" r="16" fill="none" stroke={GOLD} strokeWidth=".55" opacity=".5" />
      <g stroke={GOLD} strokeLinecap="round" fill="none">
        <path d="M10.5 16.5 q2.6 -2.8 5.2 0 t5.2 0 t5.2 0" strokeWidth="1.55" />
        <path d="M10.5 21.5 q2.6 -2.8 5.2 0 t5.2 0 t5.2 0" strokeWidth="1.2" opacity=".75" />
        <path d="M10.5 26.5 q2.6 -2.8 5.2 0 t5.2 0 t5.2 0" strokeWidth=".9" opacity=".45" />
      </g>
    </>
  );
}

/** Фирменный знак: кольцо + волны (+ опционально название) */
export function Logo({ orgName = "УДХБ", dark = false, markOnly = false, className }: Props) {
  const ink = dark ? NAVY : "#ffffff";
  const name = orgName.trim().toUpperCase() || "УДХБ";

  if (markOnly) {
    return (
      <svg viewBox="0 0 40 40" className={className} role="img" aria-label={`Экосистема ${orgName}`}>
        <Mark />
      </svg>
    );
  }

  const textW = 52 + name.length * 11.2;
  const vbw = Math.max(148, Math.ceil(textW));
  return (
    <svg
      viewBox={`0 0 ${vbw} 40`}
      className={className}
      role="img"
      aria-label={`Экосистема ${orgName}`}
    >
      <Mark />
      <text
        x="46"
        y="18"
        fontFamily="Georgia, 'Playfair Display', 'PT Serif', serif"
        fontWeight="700"
        fontSize="13.5"
        fill={ink}
        letterSpacing="1.6"
      >
        {name}
      </text>
      <line x1="46" y1="23" x2={vbw - 10} y2="23" stroke={GOLD} strokeWidth=".7" opacity=".75" />
      <text
        x="46"
        y="32"
        fontFamily="Verdana, Arial, sans-serif"
        fontSize="6.2"
        fill={GOLD}
        letterSpacing="2.4"
      >
        ЭКОСИСТЕМА
      </text>
    </svg>
  );
}
