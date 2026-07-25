import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { tokens } from "../theme/tokens";

/**
 * Animated loading element shown while a slow model (SentinelAI TCN+SHAP,
 * CostCut LSTM) warms up on the first request. It rotates through short,
 * on-brand status lines so the wait feels like the model is *thinking*, not
 * hanging — the workings are shown on the page, never just in the background.
 */
export function Loader({
  messages,
  accent = tokens.color.primary,
  height = 280,
}: {
  messages: string[];
  accent?: string;
  height?: number;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % messages.length), 1600);
    return () => clearInterval(t);
  }, [messages.length]);

  return (
    <div
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        textAlign: "center",
      }}
    >
      <OrbitSpinner accent={accent} />
      <div style={{ height: 20, position: "relative", width: "100%" }}>
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4 }}
          className="mono"
          style={{ fontSize: 13, color: "var(--text)", position: "absolute", width: "100%" }}
        >
          {messages[i]}
        </motion.div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {messages.map((_, k) => (
          <span
            key={k}
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: k === i ? accent : "var(--border)",
              transition: "background .3s",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Two counter-rotating rings with orbiting dots — a "model is thinking" motif. */
function OrbitSpinner({ accent }: { accent: string }) {
  return (
    <div style={{ position: "relative", width: 64, height: 64 }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `2px solid transparent`,
          borderTopColor: accent,
          borderRightColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
        }}
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          inset: 12,
          borderRadius: "50%",
          border: `2px solid transparent`,
          borderBottomColor: tokens.color.teal,
          borderLeftColor: `color-mix(in srgb, ${tokens.color.teal} 45%, transparent)`,
        }}
      />
      <motion.div
        animate={{ scale: [1, 1.35, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 26,
          borderRadius: "50%",
          background: accent,
          boxShadow: `0 0 16px ${accent}`,
        }}
      />
    </div>
  );
}

// Ready-made message sets for the two slow models, so the copy stays on-brand.
export const SENTINEL_MESSAGES = [
  "Waking up SentinelAI…",
  "Feeding 30-min telemetry windows to the TCN…",
  "Convolving over temperature, power & ECC drift…",
  "Asking SHAP which metric is the culprit…",
  "Ranking nodes by failure probability…",
];

export const COSTCUT_MESSAGES = [
  "Spinning up CostCut…",
  "Loading the LSTM utilization forecaster…",
  "Replaying each node's recent GPU-hours…",
  "Projecting idle time 10 minutes ahead…",
  "Totting up the dollars we can reclaim…",
];
