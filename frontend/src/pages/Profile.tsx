import { motion } from "framer-motion";
import { Mail, Shield } from "lucide-react";
import { useAuth } from "../lib/store";

export default function Profile() {
  const { email, role } = useAuth();
  const avatarLetter = (email ?? "?").charAt(0).toUpperCase();

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="badge-sim">Account</span>
        <h1
          className="brand-animate"
          style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em", margin: "16px 0 22px", lineHeight: 1.1 }}
        >
          Your profile
        </h1>

        <div className="glass" style={{ padding: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "grid",
                placeItems: "center",
                width: 64,
                height: 64,
                borderRadius: 999,
                background: "linear-gradient(135deg,#7C83FF,#34D399)",
                color: "#0a0b14",
                fontWeight: 800,
                fontSize: 26,
              }}
            >
              {avatarLetter}
            </div>
            <div>
              <div style={{ fontSize: 18, color: "var(--text-strong)", wordBreak: "break-all" }}>{email}</div>
              <span
                className="mono"
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  fontSize: 11,
                  color: "var(--primary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  border: "1px solid color-mix(in srgb, var(--primary) 40%, transparent)",
                  borderRadius: 6,
                  padding: "3px 9px",
                }}
              >
                {role}
              </span>
            </div>
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "24px 0" }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Row icon={<Mail size={17} color="var(--primary)" />} label="Email" value={email ?? "N/A"} />
            <Row icon={<Shield size={17} color="var(--green)" />} label="Role" value={role ?? "N/A"} />
          </div>

          <p style={{ marginTop: 24, fontSize: 13, lineHeight: 1.6, color: "var(--text)" }}>
            Profile management is a demo view. Account details are read from your current session and cannot be
            edited in this build.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          display: "grid",
          placeItems: "center",
          width: 38,
          height: 38,
          borderRadius: 10,
          background: "var(--surface-alt)",
          border: "1px solid var(--border)",
        }}
      >
        {icon}
      </div>
      <div>
        <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)" }}>
          {label}
        </div>
        <div style={{ fontSize: 14, color: "var(--text-strong)", wordBreak: "break-all" }}>{value}</div>
      </div>
    </div>
  );
}
