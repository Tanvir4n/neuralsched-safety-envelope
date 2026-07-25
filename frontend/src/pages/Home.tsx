import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Cpu,
  Leaf,
  ShieldAlert,
  PiggyBank,
  Zap,
  Globe2,
  LucideIcon,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { AnimatedBackground } from "../components/AnimatedBackground";
import { HeroScene } from "../components/HeroScene";
import { moduleMeta, ModuleKey, tokens } from "../theme/tokens";
import { useAuth } from "../lib/store";

const moduleIcon: Record<ModuleKey, LucideIcon> = {
  smartpack: Cpu,
  greensched: Leaf,
  sentinelai: ShieldAlert,
  costcut: PiggyBank,
};

// Give each module its own vivid accent so the card grid spans the full
// multi-hue palette (indigo, emerald, violet, cyan).
const moduleAccent: Record<ModuleKey, string> = {
  smartpack: tokens.color.primary,
  greensched: tokens.color.green,
  sentinelai: tokens.color.violet,
  costcut: tokens.color.teal,
};

const flow = [
  { label: "Submit job", color: tokens.color.text },
  { label: "GreenSched routes by carbon", color: tokens.color.green },
  { label: "SmartPack places by topology", color: tokens.color.primary },
  { label: "SentinelAI watches telemetry", color: tokens.color.amber },
  { label: "CostCut recovers idle GPUs", color: tokens.color.teal },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export default function Home() {
  const token = useAuth((s) => s.token);
  const mods = Object.keys(moduleMeta) as ModuleKey[];
  const launchTo = token ? "/dashboard" : "/signup";
  const reduce = useReducedMotion();

  // Gentle continuous float used on the accent orbs; disabled when the user
  // prefers reduced motion.
  const floatAnim = reduce
    ? {}
    : { y: [0, -10, 0], transition: { duration: 6, repeat: Infinity, ease: "easeInOut" } };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ---------------- HERO ---------------- */}
      <section style={{ position: "relative", overflow: "hidden", paddingBottom: 40 }}>
        <AnimatedBackground />

        <header
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 26px",
          }}
        >
          <Logo size={28} />
          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/login" style={ghostBtn}>Sign in</Link>
            <Link to={launchTo} style={cta}>{token ? "Open dashboard" : "Get started"}</Link>
          </div>
        </header>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1180,
            margin: "0 auto",
            padding: "40px 24px 20px",
            display: "grid",
            gridTemplateColumns: "minmax(0,1.05fr) minmax(0,0.95fr)",
            gap: 30,
            alignItems: "center",
          }}
          className="home-hero-grid"
        >
          <div>
            <motion.span
              variants={fadeUp}
              className="mono"
              style={{ fontSize: 13, color: "var(--primary)", letterSpacing: "0.08em" }}
            >
              GPU-CLUSTER-INTELLIGENCE MIDDLEWARE
            </motion.span>
            <motion.h1
              variants={fadeUp}
              style={{
                fontSize: "clamp(34px, 5vw, 56px)",
                lineHeight: 1.04,
                color: "var(--text-strong)",
                margin: "16px 0",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Schedule smarter.
              <br />
              <span className="brand-animate">Run greener. Fail less.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              style={{ maxWidth: 560, margin: "0 0 28px", fontSize: 17, lineHeight: 1.6 }}
            >
              NeuralSched is a middleware layer above Kubernetes / SLURM with four
              ML modules: topology-aware placement, carbon-aware routing,
              predictive failure detection, and idle-GPU cost recovery.
            </motion.p>
            <motion.div variants={fadeUp} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <motion.div whileHover={reduce ? undefined : { scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Link to={launchTo} style={{ ...gradientCta, fontSize: 15, padding: "13px 26px" }}>
                  {token ? "Open dashboard" : "Launch console"}
                </Link>
              </motion.div>
              <motion.div whileHover={reduce ? undefined : { scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Link to="/about" style={{ ...ghostBtn, fontSize: 15, padding: "13px 22px" }}>
                  Learn more
                </Link>
              </motion.div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.6 }}
            style={{ height: 380, minHeight: 320 }}
          >
            <HeroScene />
          </motion.div>
        </motion.div>
      </section>

      {/* ---------------- MODULES ---------------- */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "30px 24px", width: "100%" }}>
        <h2 style={sectionTitle}>Four intelligent modules</h2>
        <p style={sectionSub}>Each module is a trained model with a documented predict() contract.</p>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
            gap: 16,
            marginTop: 22,
          }}
        >
          {mods.map((k) => {
            const m = moduleMeta[k];
            const accent = moduleAccent[k];
            const Icon = moduleIcon[k];
            return (
              <motion.div
                key={k}
                variants={fadeUp}
                whileHover={
                  reduce
                    ? undefined
                    : { y: -6, boxShadow: `0 18px 40px -18px ${accent}` }
                }
                className="glass glow-border"
                style={{ padding: 22, borderRadius: 16, position: "relative", overflow: "hidden" }}
              >
                <motion.div
                  animate={floatAnim}
                  style={{
                    position: "absolute",
                    top: -30,
                    right: -30,
                    width: 90,
                    height: 90,
                    borderRadius: "50%",
                    background: accent,
                    filter: "blur(46px)",
                    opacity: 0.4,
                  }}
                />
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    display: "grid",
                    placeItems: "center",
                    background: `color-mix(in srgb, ${accent} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
                  }}
                >
                  <Icon size={22} color={accent} />
                </div>
                <h3 style={{ color: "var(--text-strong)", margin: "14px 0 6px", fontSize: 18 }}>{m.label}</h3>
                <p style={{ fontSize: 13.5 }}>{m.blurb}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 24px", width: "100%" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="glass"
          style={{ padding: 24, borderRadius: 16 }}
        >
          <h2 style={{ ...sectionTitle, fontSize: 20 }}>How it works</h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginTop: 16,
            }}
          >
            {flow.map((s, i) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="mono"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 12,
                      color: "#0a0b14",
                      background: s.color,
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13.5, color: "var(--text-strong)" }}>{s.label}</span>
                </div>
                {i < flow.length - 1 && <ArrowRight size={16} color="var(--text-dim)" />}
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ---------------- SDG BAND ---------------- */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 24px 60px", width: "100%" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="glass glow-border"
          style={{
            padding: 28,
            borderRadius: 18,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 24,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <SdgTag icon={<Zap size={14} />} label="SDG 7 · Clean Energy" color={tokens.color.green} />
              <SdgTag icon={<Globe2 size={14} />} label="SDG 13 · Climate Action" color={tokens.color.teal} />
            </div>
            <h2 style={{ ...sectionTitle, marginBottom: 8 }}>Greener AI infrastructure</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
              By routing flexible jobs into low-carbon windows and reclaiming idle
              GPUs, NeuralSched cuts datacenter emissions without missing deadlines.
            </p>
          </div>
          <div style={{ textAlign: "center" }}>
            <motion.div
              className="mono"
              animate={reduce ? undefined : { opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ fontSize: 44, fontWeight: 700, color: "var(--green)" }}
            >
              128,940
            </motion.div>
            <div style={{ fontSize: 13, color: "var(--text)", letterSpacing: "0.05em" }}>
              kg CO₂ AVOIDED (SIMULATED)
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}

function SdgTag({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <span
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        padding: "5px 10px",
        borderRadius: 999,
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

const cta: React.CSSProperties = {
  background: tokens.gradient.brand,
  color: "#0a0b14",
  fontWeight: 700,
  padding: "10px 18px",
  borderRadius: 10,
  fontSize: 14,
};
// Vivid gradient CTA used for the primary hero action.
const gradientCta: React.CSSProperties = {
  background: tokens.gradient.brand,
  color: "#0a0b14",
  fontWeight: 700,
  padding: "10px 18px",
  borderRadius: 10,
  fontSize: 14,
  boxShadow: "0 12px 30px -12px var(--primary)",
};
const ghostBtn: React.CSSProperties = {
  border: "1px solid var(--border)",
  color: "var(--text-strong)",
  padding: "10px 18px",
  borderRadius: 10,
  fontSize: 14,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  color: "var(--text-strong)",
  margin: 0,
};
const sectionSub: React.CSSProperties = {
  fontSize: 14,
  color: "var(--text)",
  margin: "6px 0 0",
};
