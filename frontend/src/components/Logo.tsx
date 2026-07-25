// NeuralSched wordmark + icon. Node-graph glyph merged with a leaf/circuit
// accent, in the cyan->emerald brand gradient. Hand-drawn SVG so it stays
// crisp at every size and consistent everywhere.

export function LogoIcon({ size = 28 }: { size?: number }) {
  const id = "nsgrad";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-label="NeuralSched">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C83FF" />
          <stop offset="1" stopColor="#34D399" />
        </linearGradient>
      </defs>
      {/* graph edges */}
      <path
        d="M8 9 L16 16 L24 9 M16 16 L16 25 M8 9 L8 20 L16 25 M24 9 L24 20 L16 25"
        stroke={`url(#${id})`}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
      {/* nodes */}
      <circle cx="8" cy="9" r="2.4" fill={`url(#${id})`} />
      <circle cx="24" cy="9" r="2.4" fill={`url(#${id})`} />
      <circle cx="8" cy="20" r="2.2" fill={`url(#${id})`} />
      <circle cx="24" cy="20" r="2.2" fill={`url(#${id})`} />
      <circle cx="16" cy="25" r="2.2" fill={`url(#${id})`} />
      {/* leaf accent on the central node */}
      <path
        d="M16 16 C13 13.5 13.5 10.5 16 9 C18.5 10.5 19 13.5 16 16 Z"
        fill="#34D399"
      />
      <circle cx="16" cy="16" r="2.6" fill="#7C83FF" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <LogoIcon size={size} />
      <span
        style={{
          fontWeight: 700,
          fontSize: size * 0.62,
          letterSpacing: "-0.02em",
          color: "var(--text-strong)",
        }}
      >
        Neural
        <span
          style={{
            background: "linear-gradient(90deg,#7C83FF,#34D399)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Sched
        </span>
      </span>
    </div>
  );
}
