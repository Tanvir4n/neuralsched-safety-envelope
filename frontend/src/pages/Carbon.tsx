import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { Leaf } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from "recharts";
import { Card, SectionTitle, SimBadge, Metric } from "../components/ui";
import { api } from "../lib/api";
import { tokens } from "../theme/tokens";

interface CarbonData {
  curve: { hour: number; gco2_kwh: number }[];
  current_hour: number; current_intensity: number;
  min_intensity: number; max_intensity: number; source: string;
}

// Lightweight staggered fade-in for the metric row and chart panel.
const gridStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const cardIn = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

export default function Carbon() {
  const [data, setData] = useState<CarbonData | null>(null);
  const [co2Avoided, setCo2Avoided] = useState(0);

  useEffect(() => {
    api.get("/carbon/intensity").then((r) => setData(r.data)).catch(() => {});
    // Aggregate CO2 avoided from green-routed jobs.
    const load = () =>
      api.get("/jobs").then((r) => {
        // Estimate: sum savings proxy from carbon_cost gaps isn't stored per job,
        // so accumulate a running demo counter that ticks with queued green jobs.
        const green = r.data.jobs.filter((j: any) => j.tag !== "urgent" && j.carbon_cost);
        const est = green.reduce((a: number, j: any) => a + Math.max(0, (300 - j.carbon_cost) * 0.4 / 1000), 0);
        setCo2Avoided(+est.toFixed(3));
      }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <SectionTitle
        title="Carbon Tracker"
        accent={tokens.color.green}
        sub="GreenSched, carbon-aware routing with 24h LSTM look-ahead"
        right={<SimBadge />}
      />

      <motion.div
        variants={gridStagger}
        initial="hidden"
        animate="show"
        style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 18 }}
      >
        <motion.div variants={cardIn}><Card><Metric label="Current Intensity" value={data?.current_intensity ?? "N/A"} unit="g/kWh" color={tokens.color.green} /></Card></motion.div>
        <motion.div variants={cardIn}><Card><Metric label="Cleanest Today" value={data?.min_intensity ?? "N/A"} unit="g/kWh" color={tokens.color.primary} /></Card></motion.div>
        <motion.div variants={cardIn}><Card><Metric label="Dirtiest Today" value={data?.max_intensity ?? "N/A"} unit="g/kWh" color={tokens.color.amber} /></Card></motion.div>
        <motion.div variants={cardIn}>
        <Card style={{ borderColor: "color-mix(in srgb, var(--green) 40%, transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Leaf size={16} color={tokens.color.green} />
            <CountUp label="CO₂ Avoided" value={co2Avoided} unit="kg" />
          </div>
        </Card>
        </motion.div>
      </motion.div>

      <motion.div
        variants={cardIn}
        initial="hidden"
        animate="show"
      >
      <Card>
        <h3 style={{ color: "var(--text-strong)", fontSize: 16, marginBottom: 4 }}>24h Carbon Intensity Forecast</h3>
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
          Green jobs are scheduled into the low-carbon valleys. Source: {data?.source ?? "synthetic_fallback"}.
        </p>
        {data && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data.curve}>
              <defs>
                <linearGradient id="carbonG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={tokens.color.green} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={tokens.color.green} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fill: "#6B7688", fontSize: 11 }} tickFormatter={(h) => `${h}:00`} />
              <YAxis tick={{ fill: "#6B7688", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#151826", border: "1px solid #242838", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v} g/kWh`, "intensity"]}
                labelFormatter={(h) => `${h}:00`}
              />
              <ReferenceLine x={data.current_hour} stroke={tokens.color.primary} strokeDasharray="4 4" label={{ value: "now", fill: tokens.color.primary, fontSize: 11 }} />
              <Area type="monotone" dataKey="gco2_kwh" stroke={tokens.color.green} strokeWidth={2} fill="url(#carbonG)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
      </motion.div>
    </div>
  );
}

function CountUp({ label, value, unit }: { label: string; value: number; unit: string }) {
  const spring = useSpring(0, { stiffness: 60, damping: 18 });
  const [display, setDisplay] = useState("0.000");
  const ref = useRef(0);
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  useEffect(() => spring.on("change", (v) => setDisplay(v.toFixed(3))), [spring]);
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: tokens.color.green, marginTop: 4 }}>
        {display}<span style={{ fontSize: 14, color: "var(--text-dim)", marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}
