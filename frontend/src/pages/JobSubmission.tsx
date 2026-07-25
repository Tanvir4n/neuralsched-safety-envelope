import { useEffect, useState } from "react";
import { Zap, Leaf, Clock } from "lucide-react";
import { Card, SectionTitle, Pill } from "../components/ui";
import { api } from "../lib/api";
import { tokens } from "../theme/tokens";

const TAGS = [
  { key: "urgent", label: "Urgent", icon: Zap, color: tokens.color.primary, desc: "Direct SmartPack placement, ignores carbon window." },
  { key: "flexible", label: "Flexible", icon: Clock, color: tokens.color.green, desc: "GreenSched evaluates; dispatch now or queue for lower carbon." },
  { key: "best_effort_green", label: "Best-Effort-Green", icon: Leaf, color: tokens.color.green, desc: "Maximizes carbon savings within the deadline." },
];

interface JobRow {
  id: number; name: string; tag: string; status: string;
  assigned_node: string | null; placement_score: number | null; carbon_cost: number | null;
}

export default function JobSubmission() {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("urgent");
  const [gpus, setGpus] = useState(1);
  const [deadline, setDeadline] = useState(1440);
  const [result, setResult] = useState<any>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [busy, setBusy] = useState(false);

  const loadJobs = () => api.get("/jobs").then((r) => setJobs(r.data.jobs)).catch(() => {});
  useEffect(() => { loadJobs(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/jobs/submit", {
        name: name || "unnamed-job",
        tag,
        gpu_requirement: gpus,
        deadline_minutes: tag === "urgent" ? null : deadline,
      });
      setResult(data);
      loadJobs();
    } finally {
      setBusy(false);
    }
  };

  const defer = async (id: number) => {
    await api.post("/jobs/defer", { job_id: id, defer_minutes: 60 });
    loadJobs();
  };

  return (
    <div>
      <SectionTitle title="Job Submission Portal" sub="Tag-based priority routing across GreenSched and SmartPack" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card>
          <form onSubmit={submit}>
            <label style={lbl}>Job name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. llama-finetune" style={inp} />

            <label style={lbl}>Priority tag</label>
            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {TAGS.map((t) => {
                const Icon = t.icon;
                const active = tag === t.key;
                return (
                  <button
                    type="button"
                    key={t.key}
                    onClick={() => setTag(t.key)}
                    style={{
                      display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left",
                      padding: 12, borderRadius: 12, background: "var(--surface-alt)",
                      border: active ? `1px solid ${t.color}` : "1px solid var(--border)",
                    }}
                  >
                    <Icon size={18} color={t.color} style={{ marginTop: 2 }} />
                    <div>
                      <div style={{ color: "var(--text-strong)", fontSize: 14, fontWeight: 600 }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: "var(--text)" }}>{t.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={lbl}>GPUs required</label>
                <input type="number" min={1} max={8} value={gpus} onChange={(e) => setGpus(+e.target.value)} style={inp} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>Deadline (min)</label>
                <input
                  type="number" min={10} value={deadline}
                  disabled={tag === "urgent"}
                  onChange={(e) => setDeadline(+e.target.value)}
                  style={{ ...inp, opacity: tag === "urgent" ? 0.4 : 1 }}
                />
              </div>
            </div>

            <button type="submit" disabled={busy} style={btn}>
              {busy ? "Routing…" : "Submit & route"}
            </button>
          </form>
        </Card>

        <Card>
          <h3 style={{ color: "var(--text-strong)", fontSize: 16, marginBottom: 12 }}>Routing decision</h3>
          {!result ? (
            <p style={{ fontSize: 13 }}>Submit a job to see its resolved path through the scheduler.</p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill text={`path: ${result.path}`} color={tokens.color.primary} />
                <Pill text={`status: ${result.job.status}`} color={tokens.color.green} />
              </div>
              <p style={{ fontSize: 14, color: "var(--text-strong)" }}>{result.message}</p>
              {result.smartpack && (
                <div style={box}>
                  <div style={boxTitle}>SmartPack placement</div>
                  <Row k="Assigned node" v={result.smartpack.assigned_node} />
                  <Row k="Reward score" v={result.smartpack.placement_score} />
                  <Row k="Method" v={result.smartpack.method} />
                </div>
              )}
              {result.green && (
                <div style={box}>
                  <div style={boxTitle}>GreenSched evaluation</div>
                  <Row k="Decision" v={result.green.decision} />
                  <Row k="Carbon now" v={`${result.green.carbon_now} g/kWh`} />
                  <Row k="Best window" v={`${result.green.carbon_at_best} g/kWh (+${result.green.best_start_offset_min}m)`} />
                  <Row k="CO₂ avoided" v={`${result.green.co2_avoided_kg} kg`} />
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card style={{ marginTop: 16 }}>
        <h3 style={{ color: "var(--text-strong)", fontSize: 16, marginBottom: 12 }}>Recent jobs</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--text-dim)", textAlign: "left" }}>
                {["ID", "Name", "Tag", "Status", "Node", "Score", "Actions"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={td} className="mono">{j.id}</td>
                  <td style={td}>{j.name}</td>
                  <td style={td}>{j.tag}</td>
                  <td style={td}>{j.status}</td>
                  <td style={td} className="mono">{j.assigned_node ?? "N/A"}</td>
                  <td style={td} className="mono">{j.placement_score?.toFixed(3) ?? "N/A"}</td>
                  <td style={td}>
                    {j.status === "running" && (
                      <button onClick={() => defer(j.id)} style={deferBtn}>Defer</button>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, color: "var(--text-dim)" }}>No jobs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
      <span style={{ color: "var(--text-dim)" }}>{k}</span>
      <span className="mono" style={{ color: "var(--text-strong)" }}>{String(v)}</span>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, marginTop: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--surface-alt)", border: "1px solid var(--border)", color: "var(--text-strong)", fontSize: 14, marginBottom: 14 };
const btn: React.CSSProperties = { width: "100%", padding: 12, borderRadius: 10, border: "none", background: "linear-gradient(90deg,#7C83FF,#34D399)", color: "#0a0b14", fontWeight: 700, fontSize: 14, marginTop: 6 };
const box: React.CSSProperties = { background: "var(--surface-alt)", borderRadius: 12, padding: 14, border: "1px solid var(--border)" };
const boxTitle: React.CSSProperties = { fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 };
const td: React.CSSProperties = { padding: "9px 10px", borderBottom: "1px solid var(--border)", color: "var(--text-strong)" };
const deferBtn: React.CSSProperties = { padding: "5px 12px", borderRadius: 8, background: "transparent", border: `1px solid ${tokens.color.amber}`, color: tokens.color.amber, fontSize: 12 };
