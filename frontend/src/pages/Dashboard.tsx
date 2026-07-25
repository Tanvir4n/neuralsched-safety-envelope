import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Cpu, Zap, ShieldAlert, PlusCircle } from "lucide-react";
import { Card, Metric, SectionTitle, SimBadge, Pill } from "../components/ui";
import { ClusterTopology3D } from "../components/ClusterTopology3D";
import { useTelemetry } from "../lib/useTelemetry";
import { api } from "../lib/api";
import { tokens } from "../theme/tokens";

interface Comparison {
  smartpack: { placed: number; avg_score: number; avg_util: number };
  fifo: { placed: number; avg_score: number; avg_util: number };
}

// The backend runs a 32-node cluster (SmartPack's PPO policy is trained for a
// fixed 32-node graph), but rendering 32 GPU servers in 3D is cluttered. Show a
// representative subset in the topology for a cleaner, more readable view; the
// full cluster is still visible in the load heatmap.
const TOPOLOGY_VIEW_NODES = 8;

// Lightweight staggered fade-in used for the metric row and main panels.
const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardIn = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function Dashboard() {
  const { snapshot, live } = useTelemetry();
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      api.get("/cluster/status").then((r) => setComparison(r.data.comparison)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const nodes = snapshot?.nodes ?? [];
  const avgUtil = nodes.length ? nodes.reduce((a, n) => a + n.gpu_util, 0) / nodes.length : 0;
  const faulting = nodes.filter((n) => n.faulting).length;
  const activeJobs = nodes.reduce((a, n) => a + n.active_jobs, 0);

  return (
    <div>
      <SectionTitle
        title="Operator Dashboard"
        sub="Live cluster topology, load heatmap, and scheduler performance"
        right={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Pill text={live ? "● WS LIVE" : "● SIM FALLBACK"} color={live ? tokens.color.green : tokens.color.textDim} />
            <Link to="/submit" style={submitBtn}>
              <PlusCircle size={16} /> Submit job
            </Link>
          </div>
        }
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}
      >
        <motion.div variants={cardIn}><Card><Metric label="GPU Nodes" value={nodes.length} color={tokens.color.primary} /></Card></motion.div>
        <motion.div variants={cardIn}><Card><Metric label="Avg Utilization" value={(avgUtil * 100).toFixed(1)} unit="%" color={tokens.color.green} /></Card></motion.div>
        <motion.div variants={cardIn}><Card><Metric label="Active Jobs" value={activeJobs} color={tokens.color.textStrong} /></Card></motion.div>
        <motion.div variants={cardIn}>
          <Card>
            <Metric label="At-Risk Nodes" value={faulting} color={faulting ? tokens.color.red : tokens.color.textStrong} />
          </Card>
        </motion.div>
      </motion.div>

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}
      >
        <motion.div variants={cardIn}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>Cluster Topology</h3>
            <SimBadge />
          </div>
          <ClusterTopology3D nodes={nodes.slice(0, TOPOLOGY_VIEW_NODES)} onSelect={setSelected} />
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.5 }}>
            This graph doubles as SmartPack's own GNN representation. Nodes are GPU
            servers, edges are NVLink and PCIe links, and color plus pulse encodes live
            load and SentinelAI failure risk (teal idle, emerald healthy, amber hot, red fault).
            Showing a representative {TOPOLOGY_VIEW_NODES} of {nodes.length} nodes for clarity;
            the full cluster is in the heatmap.
          </p>
        </Card>
        </motion.div>

        <motion.div variants={cardIn} style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>GPU Load Heatmap</h3>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {nodes.length} NODES · % UTIL
              </span>
            </div>
            <HeatLegend />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 10 }}>
              {nodes.map((n) => {
                const c = heatColor(n.gpu_util, n.faulting);
                const pct = Math.round(n.gpu_util * 100);
                return (
                  <div
                    key={n.node_id}
                    onClick={() => setSelected(n.node_id)}
                    title={`${n.node_id} · ${pct}% load${n.faulting ? " · FAULT" : ""}`}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 10,
                      cursor: "pointer",
                      // Fixed, readable fill (55–90% opacity) so low-util tiles
                      // still read clearly instead of fading into the background.
                      background: `color-mix(in srgb, ${c} ${55 + n.gpu_util * 35}%, var(--surface))`,
                      border: `1px solid ${c}`,
                      boxShadow: selected === n.node_id ? `0 0 0 2px ${c}` : "none",
                      display: "grid",
                      placeItems: "center",
                      gap: 0,
                    }}
                    className={n.faulting ? "alert-pulse" : ""}
                  >
                    <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: "#0a0b14" }}>
                      {pct}
                      <span style={{ fontSize: 9, fontWeight: 600 }}>%</span>
                    </span>
                    <span style={{ fontSize: 8, color: "rgba(10,11,20,0.75)", fontFamily: "var(--font-mono)" }}>
                      {n.node_id.replace("gpu-node-", "n")}
                    </span>
                  </div>
                );
              })}
            </div>
            {selected && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--text)" }}>
                Selected <span className="mono" style={{ color: tokens.color.primary }}>{selected}</span>{" "}
                <Link to="/health" style={{ color: tokens.color.amber }}>→ view health</Link>
              </div>
            )}
          </Card>

          <SmartPackVsFifo comparison={comparison} />
        </motion.div>
      </motion.div>
    </div>
  );
}

function SmartPackVsFifo({ comparison }: { comparison: Comparison | null }) {
  const s = comparison?.smartpack;
  const f = comparison?.fifo;
  const hasData = s && s.placed > 0;
  const gain = hasData && f ? (((s!.avg_score - f.avg_score) / Math.abs(f.avg_score || 1)) * 100) : 0;

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Cpu size={16} color={tokens.color.primary} />
        <h3 style={{ color: "var(--text-strong)", fontSize: 16 }}>SmartPack vs FIFO</h3>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
        Placement-reward comparison, updated as jobs are dispatched.
      </p>
      {!hasData ? (
        <p style={{ fontSize: 13, color: "var(--text)" }}>
          No placements yet. <Link to="/submit" style={{ color: tokens.color.primary }}>Submit a job</Link> to compare.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <BarRow label="SmartPack" value={s!.avg_score} max={1} color={tokens.color.primary} />
          <BarRow label="FIFO baseline" value={f!.avg_score} max={1} color={tokens.color.textDim} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
            <span>Reward advantage</span>
            <span className="mono" style={{ color: gain >= 0 ? tokens.color.green : tokens.color.red, fontWeight: 700 }}>
              {gain >= 0 ? "+" : ""}{gain.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
        <span>{label}</span>
        <span className="mono" style={{ color }}>{value.toFixed(3)}</span>
      </div>
      <div style={{ height: 8, background: "var(--surface-alt)", borderRadius: 6 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6 }} />
      </div>
    </div>
  );
}

const submitBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 7,
  background: "linear-gradient(90deg,#7C83FF,#34D399)", color: "#0a0b14",
  fontWeight: 700, fontSize: 13, padding: "9px 15px", borderRadius: 10,
};

function heatColor(util: number, faulting: boolean): string {
  if (faulting) return tokens.color.red;
  if (util > 0.8) return tokens.color.amber;
  if (util > 0.5) return tokens.color.green;
  return tokens.color.primary;
}

function HeatLegend() {
  const items = [
    { c: tokens.color.primary, t: "Idle <50%" },
    { c: tokens.color.green, t: "Healthy" },
    { c: tokens.color.amber, t: "Hot >80%" },
    { c: tokens.color.red, t: "Fault" },
  ];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {items.map((i) => (
        <span key={i.t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-dim)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: i.c, display: "inline-block" }} />
          {i.t}
        </span>
      ))}
    </div>
  );
}
