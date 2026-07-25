import { motion } from "framer-motion";
import { Cpu, Leaf, ShieldCheck, PiggyBank } from "lucide-react";
import { moduleMeta, ModuleKey, tokens } from "../theme/tokens";

const moduleOrder: ModuleKey[] = ["smartpack", "greensched", "sentinelai", "costcut"];

const moduleIcon: Record<ModuleKey, JSX.Element> = {
  smartpack: <Cpu size={20} />,
  greensched: <Leaf size={20} />,
  sentinelai: <ShieldCheck size={20} />,
  costcut: <PiggyBank size={20} />,
};

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, delay },
});

export default function About() {
  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* Mission */}
      <motion.section {...fade()}>
        <span className="badge-sim">About NeuralSched</span>
        <h1
          className="brand-animate"
          style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", margin: "16px 0 14px", lineHeight: 1.1 }}
        >
          Intelligent middleware for GPU clusters
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--text)", maxWidth: 720 }}>
          NeuralSched is a control plane that sits above Kubernetes and SLURM, making GPU clusters{" "}
          <strong style={{ color: "var(--text-strong)" }}>topology-aware</strong>,{" "}
          <strong style={{ color: "var(--text-strong)" }}>carbon-aware</strong>,{" "}
          <strong style={{ color: "var(--text-strong)" }}>failure-aware</strong>, and{" "}
          <strong style={{ color: "var(--text-strong)" }}>cost-aware</strong>. It reads live telemetry, learns from
          placement decisions, and routes work to the right hardware at the right time, squeezing more useful
          compute out of every watt.
        </p>
      </motion.section>

      {/* Modules */}
      <motion.section {...fade(0.05)} style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, color: "var(--text-strong)", marginBottom: 18 }}>The four modules</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 18,
          }}
        >
          {moduleOrder.map((key, i) => {
            const m = moduleMeta[key];
            return (
              <motion.div
                key={key}
                {...fade(0.08 * i)}
                className="glass"
                style={{ padding: 22 }}
              >
                <div
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    color: m.color,
                    background: `color-mix(in srgb, ${m.color} 16%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`,
                  }}
                >
                  {moduleIcon[key]}
                </div>
                <h3 style={{ margin: "14px 0 6px", fontSize: 17, color: "var(--text-strong)" }}>{m.label}</h3>
                <div className="mono" style={{ fontSize: 11, color: m.color, marginBottom: 8 }}>{m.blurb}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }}>
                  {blurbLong[key]}
                </p>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* Sustainability */}
      <motion.section
        {...fade(0.05)}
        className="glass glow-border"
        style={{ marginTop: 48, padding: 30 }}
      >
        <h2 style={{ fontSize: 22, color: "var(--text-strong)", marginBottom: 12 }}>Sustainability by design</h2>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--text)", maxWidth: 760 }}>
          Training and serving large models is energy-intensive. NeuralSched treats carbon as a first-class
          scheduling signal. It defers flexible workloads to greener grid windows and consolidates idle GPUs.
          Our design goals map directly to the United Nations Sustainable Development Goals.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 20 }}>
          {[
            { n: "SDG 7", t: "Affordable & Clean Energy", c: tokens.color.green },
            { n: "SDG 13", t: "Climate Action", c: tokens.color.sky },
          ].map((s) => (
            <div
              key={s.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 12,
                background: `color-mix(in srgb, ${s.c} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${s.c} 35%, transparent)`,
              }}
            >
              <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: s.c }}>{s.n}</span>
              <span style={{ fontSize: 13.5, color: "var(--text-strong)" }}>{s.t}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Team */}
      <motion.section {...fade(0.05)} style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 22, color: "var(--text-strong)", marginBottom: 6 }}>Meet the team</h2>
        <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20 }}>
          Team ShadowForge, Daffodil International University
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 18,
          }}
        >
          {team.map((member, i) => (
            <motion.div
              key={member.name}
              {...fade(0.08 * i)}
              className="glass"
              style={{ padding: 22 }}
            >
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: tokens.gradient.brand,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: "0.02em",
                }}
              >
                {initials(member.name)}
              </div>
              <h3 style={{ margin: "14px 0 6px", fontSize: 17, color: "var(--text-strong)" }}>{member.name}</h3>
              <div className="mono" style={{ fontSize: 11, color: member.color, marginBottom: 8 }}>{member.role}</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }}>{member.focus}</p>
            </motion.div>
          ))}
        </div>

        {/* Mentor */}
        <motion.div
          {...fade(0.1)}
          className="glass"
          style={{
            marginTop: 18,
            padding: 22,
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "grid",
              placeItems: "center",
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: tokens.gradient.coolDeep,
              color: "#fff",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "0.02em",
              flexShrink: 0,
            }}
          >
            {initials("Md. Mezbaul Islam Zion")}
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: tokens.color.sky, marginBottom: 4 }}>Mentor</div>
            <h3 style={{ margin: "0 0 4px", fontSize: 17, color: "var(--text-strong)" }}>Md. Mezbaul Islam Zion</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }}>
              Department of CSE, Daffodil International University
            </p>
          </div>
        </motion.div>
      </motion.section>

      {/* Hackathon note */}
      <motion.section {...fade(0.05)} style={{ marginTop: 40, textAlign: "center", paddingBottom: 10 }}>
        <div
          style={{
            display: "inline-block",
            padding: "10px 18px",
            borderRadius: 999,
            background: tokens.gradient.coolDeep,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          Built for the ShadowForge hackathon
        </div>
      </motion.section>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const team = [
  {
    name: "Abdullah Rubab",
    role: "Team Leader and ML Architect",
    focus:
      "Deep learning, graph neural networks, reinforcement learning, and explainable AI. Designed the four ML modules.",
    color: tokens.color.primary,
  },
  {
    name: "Md. Tanvir Hasan",
    role: "Backend and Infrastructure Developer",
    focus:
      "Python, FastAPI, real-time telemetry streaming, and the scheduling API.",
    color: tokens.color.green,
  },
  {
    name: "Sourov Kumar",
    role: "Frontend and Dashboard Developer",
    focus:
      "Real-time React dashboards, data visualization, and 3D cluster views.",
    color: tokens.color.teal,
  },
];

const blurbLong: Record<ModuleKey, string> = {
  smartpack:
    "A graph neural network paired with a PPO policy learns cluster topology and packs jobs onto interconnect-optimal GPUs.",
  greensched:
    "Carbon-aware routing shifts flexible workloads toward low-emission grid windows without breaking deadlines.",
  sentinelai:
    "Predictive failure detection watches thermal and ECC signals to drain risky nodes before jobs crash.",
  costcut:
    "Idle-GPU forecasting reclaims stranded capacity and right-sizes reservations to cut spend.",
};
