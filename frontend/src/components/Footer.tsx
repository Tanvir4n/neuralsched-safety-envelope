import { Link } from "react-router-dom";
import { Github, Mail, Globe } from "lucide-react";
import { Logo } from "./Logo";

const columns: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: "Modules",
    links: [
      { label: "SmartPack", to: "/dashboard" },
      { label: "GreenSched", to: "/carbon" },
      { label: "SentinelAI", to: "/health" },
      { label: "CostCut", to: "/cost" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--surface) 55%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        marginTop: 40,
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "40px 22px 26px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: 32,
          }}
        >
          {/* Brand column */}
          <div style={{ minWidth: 220 }}>
            <Logo size={26} />
            <p style={{ marginTop: 14, fontSize: 13, color: "var(--text)", maxWidth: 280, lineHeight: 1.6 }}>
              GPU-cluster intelligence for greener AI infrastructure.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {[
                { icon: <Github size={16} />, label: "GitHub" },
                { icon: <Mail size={16} />, label: "Email" },
                { icon: <Globe size={16} />, label: "Website" },
              ].map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  title={s.label}
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "var(--surface-alt)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.title}>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-dim)",
                  marginBottom: 14,
                }}
              >
                {col.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {col.links.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    style={{ fontSize: 13, color: "var(--text)" }}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 34,
            paddingTop: 18,
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
            © 2026 NeuralSched · Simulated telemetry for demonstration
          </span>
          <span className="badge-sim">Demo build</span>
        </div>
      </div>
    </footer>
  );
}
