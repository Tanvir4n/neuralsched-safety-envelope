import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field, primaryBtn } from "./Login";
import { login, signup } from "../lib/api";
import { useAuth } from "../lib/store";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("operator");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const setAuth = useAuth((s) => s.setAuth);
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await signup(email, password, role);
      const { access_token, role: r } = await login(email, password);
      setAuth(access_token, r, email);
      nav("/dashboard");
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Could not create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit}>
        <h1 style={{ color: "var(--text-strong)", fontSize: 24, marginBottom: 6 }}>Create account</h1>
        <p style={{ marginBottom: 22, fontSize: 14 }}>Provision access to NeuralSched.</p>
        {err && (
          <div
            style={{
              background: "color-mix(in srgb, #EF4444 15%, transparent)",
              border: "1px solid color-mix(in srgb, #EF4444 40%, transparent)",
              color: "#FCA5A5",
              padding: "9px 12px",
              borderRadius: 10,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {err}
          </div>
        )}
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Password" value={password} onChange={setPassword} type="password" />
        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Role
          </span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              width: "100%",
              marginTop: 6,
              padding: "11px 13px",
              borderRadius: 10,
              background: "var(--surface-alt)",
              border: "1px solid var(--border)",
              color: "var(--text-strong)",
              fontSize: 14,
            }}
          >
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={loading} style={primaryBtn}>
          {loading ? "Creating…" : "Create account"}
        </button>
        <p style={{ marginTop: 18, fontSize: 13, textAlign: "center" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--primary)" }}>
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
