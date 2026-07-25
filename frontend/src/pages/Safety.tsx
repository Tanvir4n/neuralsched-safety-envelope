import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, ShieldAlert, Ban, Thermometer, Clock, Zap,
  Bot, ListOrdered, Activity,
} from "lucide-react";
import { Card, SectionTitle, SimBadge, Metric } from "../components/ui";
import { Loader } from "../components/Loader";
import {
  getSafetyStatus, setSafetyLimits, forceBlockNext,
  SafetyStatus, SafetyLimits,
} from "../lib/api";
import { tokens } from "../theme/tokens";

const SAFETY_MESSAGES = [
  "Arming the Safety Envelope…",
  "Running SmartPack beside FIFO in shadow mode…",
  "Scoring hypothetical placements against the hard limits…",
  "Tallying blocked actions, completions and failures…",
];

export default function Safety() {
  const [status, setStatus] = useState<SafetyStatus | null>(null);
  // Local slider state so dragging feels instant; committed to backend on release.
  const [draft, setDraft] = useState<SafetyLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = () =>
    getSafetyStatus()
      .then((s) => {
        setStatus(s);
        // Only seed the sliders once, so live cluster refresh doesn't fight the user.
        setDraft((d) => d ?? s.limits);
      })
      .catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const commitLimits = async (next: SafetyLimits) => {
    setBusy(true);
    try {
      const applied = await setSafetyLimits(next);
      setDraft(applied);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const triggerBlock = async () => {
    setBusy(true);
    try {
      const r = await forceBlockNext();
      setFlash(r.message);
      setTimeout(() => setFlash(null), 4000);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionTitle
        title="Safety Envelope & Shadow Test"
        accent={tokens.color.primary}
        sub="SmartPack runs in shadow mode — it must prove itself before it controls real jobs. FIFO places every real job; the agent is only observed."
        right={<SimBadge />}
      />

      {!status || !draft ? (
        <Card>
          <Loader messages={SAFETY_MESSAGES} accent={tokens.color.primary} />
        </Card>
      ) : (
        <>
          {/* How it works — always visible so the mechanism is on the page. */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Activity size={16} color={tokens.color.primary} />
              <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>How this round works</h3>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              <Step n={1} title="Shadow decision"
                text="On every job — real or simulated — SmartPack proposes a placement. It is never applied." />
              <Step n={2} title="Envelope check"
                text="The proposal is tested against the hard limits below. Any breach is rejected and logged." />
              <Step n={3} title="FIFO executes"
                text="The simple FIFO scheduler is the only thing that actually places the real job." />
            </div>
          </Card>

          {/* Hard limits — live adjustable. */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldCheck size={16} color={tokens.color.green} />
                <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>Safety envelope — hard limits</h3>
              </div>
              <button onClick={triggerBlock} disabled={busy} style={forceBtn}>
                <Zap size={14} /> Force a block (demo)
              </button>
            </div>

            {flash && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginBottom: 14, padding: "8px 12px", borderRadius: 9, fontSize: 13,
                  color: tokens.color.amber, background: "rgba(251,191,36,.12)",
                  border: `1px solid ${tokens.color.amber}`,
                }}
              >
                {flash}
              </motion.div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <LimitSlider
                icon={<Thermometer size={15} color={tokens.color.red} />}
                label="Max node temperature"
                unit="°C" min={50} max={100} step={1}
                value={draft.max_node_temp_c}
                onChange={(v) => setDraft({ ...draft, max_node_temp_c: v })}
                onCommit={(v) => commitLimits({ ...draft, max_node_temp_c: v })}
                hint="Lower this below a hot node to watch placements get blocked live."
              />
              <LimitSlider
                icon={<Clock size={15} color={tokens.color.teal} />}
                label="Max job wait"
                unit="s" min={10} max={600} step={10}
                value={draft.max_job_wait_sec}
                onChange={(v) => setDraft({ ...draft, max_job_wait_sec: v })}
                onCommit={(v) => commitLimits({ ...draft, max_job_wait_sec: v })}
                hint="Tighten this to reject placements onto busy, deep-queue nodes."
              />
            </div>
          </Card>

          {/* Shadow comparison: agent (3 numbers) vs FIFO (2 numbers). */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <ScoreCard
              title="SmartPack (shadow)" icon={<Bot size={16} color={tokens.color.primary} />}
              accent={tokens.color.primary} tag="observed only — never applied"
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <Metric label="Completions" value={status.comparison.agent.completions} color={tokens.color.green} />
                <Metric label="Blocked" value={status.comparison.agent.blocked} color={tokens.color.amber} />
                <Metric label="Failures" value={status.comparison.agent.failures} color={tokens.color.red} />
              </div>
              <div style={{ marginTop: 14 }}>
                <Metric label="Avg completion" value={status.comparison.agent.avg_completion_sec} unit="s" />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
                A blocked action is a caught risk, not a failure — the envelope stopped it before it ran.
              </p>
            </ScoreCard>

            <ScoreCard
              title="FIFO (real executor)" icon={<ListOrdered size={16} color={tokens.color.teal} />}
              accent={tokens.color.teal} tag="places every real job"
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
                <Metric label="Completions" value={status.comparison.fifo.completions} color={tokens.color.green} />
                <Metric label="Failures" value={status.comparison.fifo.failures} color={tokens.color.red} />
              </div>
              <div style={{ marginTop: 14 }}>
                <Metric label="Avg completion" value={status.comparison.fifo.avg_completion_sec} unit="s" />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
                The baseline that actually runs. The shadow test asks: would the agent have done better, safely?
              </p>
            </ScoreCard>
          </div>

          {/* Blocked log — one sentence per rejected action. */}
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Ban size={16} color={tokens.color.red} />
              <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>Blocked log</h3>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                · {status.blocked_log.length} rejected action{status.blocked_log.length === 1 ? "" : "s"}
              </span>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
              Every action the envelope rejected, newest first, with the exact limit it would have broken.
            </p>
            {status.blocked_log.length === 0 ? (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
                borderRadius: 10, background: "var(--surface-alt)", border: "1px solid var(--border)",
              }}>
                <ShieldCheck size={16} color={tokens.color.green} />
                <span style={{ fontSize: 13 }}>
                  No actions blocked yet. Tighten a limit above or hit “Force a block” to see the envelope catch one.
                </span>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {status.blocked_log.map((b, i) => (
                  <motion.div
                    key={`${b.ts}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{
                      display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
                      padding: "10px 12px", borderRadius: 9, background: "var(--surface-alt)",
                      border: `1px solid color-mix(in srgb, ${tokens.color.red} 30%, var(--border))`,
                    }}
                  >
                    <ShieldAlert size={16} color={tokens.color.red} />
                    <div>
                      <div style={{ fontSize: 13, color: "var(--text-strong)" }}>{b.reason}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 5, alignItems: "center" }}>
                        <LimitTag limit={b.violated_limit} />
                        {b.simulated && <span className="badge-sim">simulated</span>}
                      </div>
                    </div>
                    <div className="mono" style={{ textAlign: "right", fontSize: 12, color: "var(--text-dim)" }}>
                      <div>{b.temp_c}°C</div>
                      <div>{b.est_wait_sec}s wait</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10, background: "var(--surface-alt)",
      border: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span className="mono" style={{
          width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center",
          background: "color-mix(in srgb, var(--primary) 18%, transparent)",
          color: tokens.color.primary, fontSize: 12, fontWeight: 700,
        }}>{n}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{title}</span>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text)" }}>{text}</p>
    </div>
  );
}

function LimitSlider({
  icon, label, unit, min, max, step, value, onChange, onCommit, hint,
}: {
  icon: React.ReactNode; label: string; unit: string;
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; onCommit: (v: number) => void; hint: string;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-strong)" }}>
          {icon} {label}
        </span>
        <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-strong)" }}>
          {value}<span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 2 }}>{unit}</span>
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        style={{ width: "100%", accentColor: tokens.color.primary }}
      />
      <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>{hint}</p>
    </div>
  );
}

function ScoreCard({
  title, icon, accent, tag, children,
}: {
  title: string; icon: React.ReactNode; accent: string; tag: string; children: React.ReactNode;
}) {
  return (
    <Card style={{ borderColor: `color-mix(in srgb, ${accent} 35%, var(--border))` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon}
          <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>{title}</h3>
        </div>
        <span className="mono" style={{
          fontSize: 10.5, padding: "3px 9px", borderRadius: 999, color: accent,
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
        }}>{tag}</span>
      </div>
      {children}
    </Card>
  );
}

function LimitTag({ limit }: { limit: string }) {
  const map: Record<string, { label: string; color: string }> = {
    max_node_temp_c: { label: "temperature limit", color: tokens.color.red },
    max_job_wait_sec: { label: "job-wait limit", color: tokens.color.teal },
  };
  const m = map[limit] ?? { label: limit, color: tokens.color.amber };
  return (
    <span className="mono" style={{
      fontSize: 10.5, padding: "2px 8px", borderRadius: 999, color: m.color,
      background: `color-mix(in srgb, ${m.color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`,
    }}>
      {m.label}
    </span>
  );
}

const forceBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px",
  borderRadius: 9, border: `1px solid ${tokens.color.amber}`,
  background: "rgba(251,191,36,.12)", color: tokens.color.amber,
  fontWeight: 600, fontSize: 13, cursor: "pointer",
};
