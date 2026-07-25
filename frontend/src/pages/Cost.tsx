import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { Card, SectionTitle, SimBadge, Metric, Pill } from "../components/ui";
import { Loader, COSTCUT_MESSAGES } from "../components/Loader";
import { api } from "../lib/api";
import { tokens } from "../theme/tokens";

interface NodeCost {
  node_id: string; forecast_util: number; recent_util: number[];
  action: string; estimated_waste_usd_per_hr: number; method: string;
}
interface CostData {
  nodes: NodeCost[]; total_waste_usd_per_hr: number;
  total_waste_usd_per_month: number; actionable_nodes: number;
}

const actionColor: Record<string, string> = {
  keep: tokens.color.green,
  defer: tokens.color.primary,
  reassign: tokens.color.amber,
  hibernate: tokens.color.red,
};

// Lightweight staggered fade-in for the metric row and panels.
const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardIn = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function Cost() {
  const [data, setData] = useState<CostData | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api.get("/cost/analytics").then((r) => {
      setData(r.data);
      if (!sel && r.data.nodes.length) setSel(r.data.nodes[0].node_id);
    }).catch(() => {});
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [sel]);

  const selected = data?.nodes.find((n) => n.node_id === sel);
  // Plot the recent observed utilization, then the single-step LSTM forecast
  // as the final point so the trend into the forecast is visible.
  const chartData = selected
    ? [
        ...selected.recent_util.map((u, i) => ({
          min: (i - selected.recent_util.length) * 10,
          util: +(u * 100).toFixed(1),
          kind: "observed" as const,
        })),
        { min: 10, util: +(selected.forecast_util * 100).toFixed(1), kind: "forecast" as const },
      ]
    : [];

  return (
    <div>
      <SectionTitle
        title="Cost Analytics"
        accent={tokens.color.teal}
        sub="CostCut: LSTM utilization forecast plus rule-augmented reclaim policy"
        right={<SimBadge />}
      />

      {!data ? (
        <Card>
          <Loader messages={COSTCUT_MESSAGES} accent={tokens.color.teal} />
        </Card>
      ) : (
        <>
      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 18 }}
      >
        <motion.div variants={cardIn}><Card><Metric label="Waste / hour" value={`$${data?.total_waste_usd_per_hr ?? "N/A"}`} color={tokens.color.amber} /></Card></motion.div>
        <motion.div variants={cardIn}><Card><Metric label="Projected / month" value={`$${data?.total_waste_usd_per_month?.toLocaleString() ?? "N/A"}`} color={tokens.color.red} /></Card></motion.div>
        <motion.div variants={cardIn}><Card><Metric label="Actionable Nodes" value={data?.actionable_nodes ?? "N/A"} color={tokens.color.primary} /></Card></motion.div>
      </motion.div>

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}
      >
        <motion.div variants={cardIn}>
        <Card>
          <h3 style={{ color: "var(--text-strong)", fontSize: 16, marginBottom: 12 }}>Reclaim recommendations</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {data?.nodes.map((n) => (
              <button
                key={n.node_id}
                onClick={() => setSel(n.node_id)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center",
                  padding: "10px 12px", borderRadius: 10, textAlign: "left",
                  background: sel === n.node_id ? "var(--surface-alt)" : "transparent",
                  border: `1px solid ${sel === n.node_id ? actionColor[n.action] : "var(--border)"}`,
                }}
              >
                <span className="mono" style={{ fontSize: 13, color: "var(--text-strong)" }}>{n.node_id}</span>
                <Pill text={n.action} color={actionColor[n.action]} />
                <span className="mono" style={{ fontSize: 12, color: tokens.color.amber }}>${n.estimated_waste_usd_per_hr}/h</span>
              </button>
            ))}
          </div>
        </Card>
        </motion.div>

        <motion.div variants={cardIn}>
        <Card>
          <h3 style={{ color: "var(--text-strong)", fontSize: 16, marginBottom: 4 }}>
            Utilization forecast {sel && <span className="mono" style={{ color: tokens.color.primary, fontSize: 13 }}>· {sel}</span>}
          </h3>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
            {selected && `Next-step forecast ${(selected.forecast_util * 100).toFixed(0)}%, recommended: ${selected.action}`}
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <XAxis dataKey="min" tick={{ fill: "#6B7688", fontSize: 11 }} tickFormatter={(m) => (m === 10 ? "now+10m" : `${m}m`)} />
              <YAxis domain={[0, 100]} tick={{ fill: "#6B7688", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#151826", border: "1px solid #242838", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v}%`, "util"]}
                labelFormatter={(m) => (m === 10 ? "forecast (+10 min)" : `${m} min`)}
              />
              <Line type="monotone" dataKey="util" stroke={tokens.color.teal} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        </motion.div>
      </motion.div>
        </>
      )}
    </div>
  );
}
