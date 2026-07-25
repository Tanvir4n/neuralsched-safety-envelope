import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Logo } from "../components/Logo";
import { moduleMeta, ModuleKey } from "../theme/tokens";
import { useAuth } from "../lib/store";

export default function Landing() {
  const token = useAuth((s) => s.token);
  const mods = Object.keys(moduleMeta) as ModuleKey[];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 26px" }}>
        <Logo size={28} />
        <div style={{ display: "flex", gap: 10 }}>
          <Link to="/login" style={ghostBtn}>Sign in</Link>
          <Link to={token ? "/dashboard" : "/signup"} style={cta}>
            {token ? "Open dashboard" : "Get started"}
          </Link>
        </div>
      </header>

      <section style={{ maxWidth: 900, margin: "0 auto", padding: "70px 24px 40px", textAlign: "center" }}>
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mono"
          style={{ fontSize: 13, color: "var(--primary)", letterSpacing: "0.08em" }}
        >
          GPU-CLUSTER-INTELLIGENCE MIDDLEWARE
        </motion.span>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: 52, lineHeight: 1.05, color: "var(--text-strong)", margin: "16px 0", fontWeight: 700 }}
        >
          Schedule smarter.
          <br />
          <span style={{ background: "linear-gradient(90deg,#7C83FF,#34D399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Run greener. Fail less.
          </span>
        </motion.h1>
        <p style={{ maxWidth: 620, margin: "0 auto 30px", fontSize: 17, lineHeight: 1.6 }}>
          A middleware layer above Kubernetes/SLURM with four ML modules for
          topology-aware placement, carbon-aware routing, predictive failure
          detection, and idle-GPU cost recovery.
        </p>
        <Link to={token ? "/dashboard" : "/signup"} style={{ ...cta, fontSize: 15, padding: "13px 26px" }}>
          {token ? "Open dashboard" : "Launch console"}
        </Link>
      </section>

      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "10px 24px 60px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16 }}>
        {mods.map((k, i) => {
          const m = moduleMeta[k];
          return (
            <motion.div
              key={k}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="glass"
              style={{ padding: 20 }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 999, background: m.color, display: "inline-block" }} />
              <h3 style={{ color: "var(--text-strong)", margin: "10px 0 6px", fontSize: 18 }}>{m.label}</h3>
              <p style={{ fontSize: 13.5 }}>{m.blurb}</p>
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}

const cta: React.CSSProperties = {
  background: "linear-gradient(90deg,#7C83FF,#34D399)",
  color: "#0a0b14",
  fontWeight: 700,
  padding: "10px 18px",
  borderRadius: 10,
  fontSize: 14,
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  color: "var(--text-strong)",
  padding: "10px 18px",
  borderRadius: 10,
  fontSize: 14,
};
