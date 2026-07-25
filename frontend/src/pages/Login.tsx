import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Logo } from "../components/Logo";
import { login } from "../lib/api";
import { useAuth } from "../lib/store";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { access_token, role } = await login(email, password);
      setAuth(access_token, role, email);
      nav("/dashboard");
    } catch {
      setErr("Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1 style={{ color: "var(--text-strong)", fontSize: 24, marginBottom: 6 }}>Welcome back</h1>
        <p style={{ marginBottom: 22, fontSize: 14 }}>Sign in to the cluster control plane.</p>
        {err && <div style={errBox}>{err}</div>}
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        <button type="submit" disabled={loading} style={primaryBtn}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p style={{ marginTop: 18, fontSize: 13, textAlign: "center" }}>
          No account?{" "}
          <Link to="/signup" style={{ color: "var(--primary)" }}>
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass"
        style={{ width: 400, maxWidth: "100%", padding: 32 }}
      >
        <div style={{ marginBottom: 26 }}>
          <Logo size={30} />
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        required
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "11px 13px",
  borderRadius: 10,
  background: "var(--surface-alt)",
  border: "1px solid var(--border)",
  color: "var(--text-strong)",
  fontSize: 14,
  outline: "none",
};

export const primaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: 10,
  border: "none",
  background: "linear-gradient(90deg,#7C83FF,#34D399)",
  color: "#0a0b14",
  fontWeight: 700,
  fontSize: 14,
  marginTop: 6,
};

const errBox: React.CSSProperties = {
  background: "color-mix(in srgb, #EF4444 15%, transparent)",
  border: "1px solid color-mix(in srgb, #EF4444 40%, transparent)",
  color: "#FCA5A5",
  padding: "9px 12px",
  borderRadius: 10,
  fontSize: 13,
  marginBottom: 16,
};
