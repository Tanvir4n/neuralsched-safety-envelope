// NeuralSched design tokens. Modern "cosmic indigo" dark palette inspired by
// Linear / Vercel / Stripe dashboards (popular, professional, not generic).
// Module identity colors are kept visually distinct for charts + topology:
//   Indigo = SmartPack, Emerald = GreenSched, Amber/Rose = SentinelAI alerts,
//   Cyan = CostCut. Supporting hues (violet/sky/lime/rose) are for gradients,
//   charts and backgrounds only.

export const tokens = {
  color: {
    bg: "#0A0B14",
    surface: "#151826",
    surfaceAlt: "#10121E",
    border: "rgba(148, 163, 184, 0.12)",
    borderGlow: "rgba(129, 140, 248, 0.38)",

    primary: "#7C83FF", // indigo, SmartPack / brand / general
    green: "#34D399", // emerald, GreenSched / carbon
    amber: "#FBBF24", // SentinelAI warning
    red: "#F43F5E", // SentinelAI critical (rose-red)
    teal: "#22D3EE", // CostCut (cyan)

    // Supporting accents (charts / gradients / backgrounds only).
    indigo: "#6366F1",
    violet: "#A855F7",
    sky: "#38BDF8",
    lime: "#A3E635",
    rose: "#FB7185",

    textStrong: "#F1F5F9",
    text: "#A5B0C2",
    textDim: "#6B7688",
  },
  // Brand gradients reused across CTAs, headings, logo.
  gradient: {
    brand: "linear-gradient(90deg,#7C83FF,#A855F7)",
    coolDeep: "linear-gradient(135deg,#6366F1,#22D3EE)",
    aurora: "linear-gradient(120deg,#7C83FF,#A855F7,#22D3EE)",
  },
  font: {
    ui: "'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
  radius: { sm: "8px", md: "14px", lg: "20px" },
} as const;

export type ModuleKey = "smartpack" | "greensched" | "sentinelai" | "costcut";

export const moduleMeta: Record<ModuleKey, { label: string; color: string; blurb: string }> = {
  smartpack: { label: "SmartPack", color: tokens.color.primary, blurb: "GNN + PPO placement" },
  greensched: { label: "GreenSched", color: tokens.color.green, blurb: "Carbon-aware routing" },
  sentinelai: { label: "SentinelAI", color: tokens.color.amber, blurb: "Predictive failure" },
  costcut: { label: "CostCut", color: tokens.color.teal, blurb: "Idle-GPU forecast" },
};
