import { useEffect, useState } from "react";
import { ShieldAlert, Bug, Zap, ArrowRightLeft } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, SectionTitle, SimBadge } from "../components/ui";
import { Loader, SENTINEL_MESSAGES } from "../components/Loader";
import { api } from "../lib/api";
import { tokens } from "../theme/tokens";

interface Prediction {
  node_id: string; failure_probability: number; alert: boolean;
  shap: Record<string, number>; method: string;
}
interface Alert { id: number; job_id: number | null; node_id: string; failure_probability: number; shap: Record<string, number>; }
interface Migration { from_node: string; to_node: string; mode: string; job_id: number | null; failure_probability: number; ts: string; }

export default function Health() {
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [shap, setShap] = useState<{ metric: string; contribution: number }[]>([]);
  const [autoMigrate, setAutoMigrate] = useState(false);
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    api.get("/health/predictions").then((r) => {
      setPreds(r.data.predictions);
      setAlerts(r.data.alerts);
      setAutoMigrate(r.data.auto_migrate);
      setMigrations(r.data.migrations ?? []);
      setLoaded(true);
      if (!selected && r.data.predictions.length) {
        const top = [...r.data.predictions].sort((a, b) => b.failure_probability - a.failure_probability)[0];
        setSelected(top.node_id);
      }
    }).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    api.get(`/shap/explain?node_id=${selected}`).then((r) => setShap(r.data.shap_ranked)).catch(() => {});
  }, [selected, preds]);

  const toggleAuto = async () => {
    const next = !autoMigrate;
    setAutoMigrate(next);
    try { await api.post("/migrate/auto", { enabled: next }); load(); }
    catch { setAutoMigrate(!next); }
  };

  const migrateNow = async (alertId: number) => {
    setBusy(alertId);
    try { await api.post(`/migrate/${alertId}`); await load(); }
    catch { /* no healthy destination */ }
    finally { setBusy(null); }
  };

  const sorted = [...preds].sort((a, b) => b.failure_probability - a.failure_probability);

  return (
    <div>
      <SectionTitle
        title="Health Monitor"
        accent={tokens.color.amber}
        sub="SentinelAI: TCN over 30-min telemetry windows, threshold P > 0.75"
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <AutoMigrateToggle on={autoMigrate} onToggle={toggleAuto} />
            <SimBadge />
          </div>
        }
      />

      {!loaded ? (
        <Card>
          <Loader messages={SENTINEL_MESSAGES} accent={tokens.color.amber} />
        </Card>
      ) : (
        <>
      {alerts.length > 0 && (
        <Card style={{ borderColor: tokens.color.red, marginBottom: 16 }} className="alert-pulse">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldAlert color={tokens.color.red} />
            <div style={{ flex: 1 }}>
              <div style={{ color: tokens.color.red, fontWeight: 700 }}>
                {alerts.length} active failure alert{alerts.length > 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: 13 }}>
                {alerts.map((a) => `${a.node_id} (P=${a.failure_probability.toFixed(2)}${a.job_id ? `, job #${a.job_id}` : ""})`).join(" · ")}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {alerts.map((a) => (
              <button
                key={a.id}
                onClick={() => migrateNow(a.id)}
                disabled={busy === a.id}
                style={migrateBtn}
              >
                <ArrowRightLeft size={14} />
                {busy === a.id ? "Migrating…" : `Checkpoint + migrate ${a.node_id}`}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>
            {autoMigrate
              ? "Auto-migrate is ON. SentinelAI moves at-risk jobs to the SmartPack-chosen healthiest node automatically."
              : "Auto-migrate is OFF. Trigger a checkpoint + migrate manually, or enable auto mode above."}
          </p>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
        <Card>
          <h3 style={{ color: "var(--text-strong)", fontSize: 16, marginBottom: 12 }}>Failure probability by node</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {sorted.map((p) => {
              const c = p.failure_probability > 0.75 ? tokens.color.red : p.failure_probability > 0.5 ? tokens.color.amber : tokens.color.green;
              return (
                <button
                  key={p.node_id}
                  onClick={() => setSelected(p.node_id)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center",
                    padding: "10px 12px", borderRadius: 10, textAlign: "left",
                    background: selected === p.node_id ? "var(--surface-alt)" : "transparent",
                    border: `1px solid ${selected === p.node_id ? c : "var(--border)"}`,
                  }}
                >
                  <div>
                    <div className="mono" style={{ fontSize: 13, color: "var(--text-strong)" }}>{p.node_id}</div>
                    <div style={{ height: 6, background: "var(--surface)", borderRadius: 4, marginTop: 6 }}>
                      <div style={{ width: `${p.failure_probability * 100}%`, height: "100%", background: c, borderRadius: 4 }} />
                    </div>
                  </div>
                  <span className="mono" style={{ color: c, fontWeight: 700 }}>{(p.failure_probability * 100).toFixed(0)}%</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Bug size={16} color={tokens.color.amber} />
            <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>
              SHAP attribution {selected && <span className="mono" style={{ color: tokens.color.primary, fontSize: 13 }}>· {selected}</span>}
            </h3>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Which telemetry metrics drove the failure-probability estimate (positive = increases risk).
          </p>
          {shap.length === 0 ? (
            <p style={{ fontSize: 13 }}>Select a node to view its explanation.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart layout="vertical" data={shap} margin={{ left: 20 }}>
                <XAxis type="number" tick={{ fill: "#64748B", fontSize: 11 }} />
                <YAxis type="category" dataKey="metric" width={110} tick={{ fill: "#94A3B8", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
                  cursor={{ fill: "rgba(148,163,184,0.06)" }}
                />
                <Bar dataKey="contribution" radius={4}>
                  {shap.map((s, i) => (
                    <Cell key={i} fill={s.contribution >= 0 ? tokens.color.red : tokens.color.green} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {migrations.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Zap size={16} color={tokens.color.primary} />
            <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>Migration log</h3>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {[...migrations].reverse().map((m, i) => (
              <div
                key={i}
                style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center",
                  padding: "8px 12px", borderRadius: 8, background: "var(--surface-alt)",
                  border: "1px solid var(--border)", fontSize: 13,
                }}
              >
                <span
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                    color: m.mode === "auto" ? tokens.color.green : tokens.color.primary,
                    background: m.mode === "auto" ? "rgba(16,185,129,.12)" : "rgba(34,211,238,.12)",
                    textTransform: "uppercase", letterSpacing: 0.4,
                  }}
                >
                  {m.mode}
                </span>
                <div className="mono" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: tokens.color.red }}>{m.from_node}</span>
                  <ArrowRightLeft size={13} color="var(--text-dim)" />
                  <span style={{ color: tokens.color.green }}>{m.to_node}</span>
                  {m.job_id != null && <span style={{ color: "var(--text-dim)" }}>· job #{m.job_id}</span>}
                </div>
                <span className="mono" style={{ color: "var(--text-dim)", fontSize: 12 }}>
                  P={m.failure_probability.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
        </>
      )}
    </div>
  );
}

function AutoMigrateToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={on ? "Auto-migrate is ON" : "Auto-migrate is OFF"}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999,
        border: `1px solid ${on ? tokens.color.green : "var(--border)"}`,
        background: on ? "rgba(16,185,129,.12)" : "var(--surface-alt)",
        cursor: "pointer", fontSize: 13, fontWeight: 600,
        color: on ? tokens.color.green : "var(--text-dim)",
      }}
    >
      <span
        style={{
          width: 34, height: 18, borderRadius: 999, padding: 2, display: "inline-flex",
          background: on ? tokens.color.green : "var(--border)",
          justifyContent: on ? "flex-end" : "flex-start", transition: "all .2s",
        }}
      >
        <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "all .2s" }} />
      </span>
      Auto-migrate {on ? "ON" : "OFF"}
    </button>
  );
}

const migrateBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
  borderRadius: 9, border: `1px solid ${tokens.color.primary}`,
  background: "rgba(34,211,238,.12)", color: tokens.color.primary,
  fontWeight: 600, fontSize: 13, cursor: "pointer",
};
