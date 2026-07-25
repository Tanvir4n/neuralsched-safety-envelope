import { motion } from "framer-motion";
import { ReactNode } from "react";

export function Card({
  children,
  style,
  className = "",
}: {
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`glass ${className}`}
      style={{ padding: 20, ...style }}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({
  title,
  sub,
  accent = "var(--primary)",
  right,
}: {
  title: string;
  sub?: string;
  accent?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginBottom: 18,
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 4, height: 20, borderRadius: 4, background: accent }} />
          <h2 style={{ color: "var(--text-strong)", fontSize: 22, fontWeight: 700 }}>{title}</h2>
        </div>
        {sub && <p style={{ marginTop: 6, marginLeft: 14, fontSize: 13 }}>{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Metric({
  label,
  value,
  unit,
  color = "var(--text-strong)",
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, color, marginTop: 4 }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--text-dim)", marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

export function SimBadge() {
  return <span className="badge-sim">simulated data</span>;
}

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        padding: "3px 9px",
        borderRadius: 999,
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}
