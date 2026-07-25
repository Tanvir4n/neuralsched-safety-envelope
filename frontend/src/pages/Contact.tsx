import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, MapPin, Clock, Send, CheckCircle2 } from "lucide-react";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay },
});

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Local-only: no backend. Just show a success state.
    setSent(true);
  };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      <motion.div {...fade()}>
        <span className="badge-sim">Contact</span>
        <h1
          className="brand-animate"
          style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", margin: "16px 0 12px", lineHeight: 1.1 }}
        >
          Get in touch
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.7, color: "var(--text)", maxWidth: 640 }}>
          Questions about NeuralSched, the modules, or the hackathon build? Drop us a line and we'll get back to you.
        </p>
      </motion.div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 22,
          marginTop: 32,
          alignItems: "start",
        }}
      >
        {/* Form */}
        <motion.div {...fade(0.05)} className="glass" style={{ padding: 26 }}>
          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "30px 10px", textAlign: "center" }}
            >
              <CheckCircle2 size={46} color="var(--green)" />
              <h3 style={{ fontSize: 19, color: "var(--text-strong)" }}>Thanks, we'll be in touch</h3>
              <p style={{ fontSize: 14, color: "var(--text)", maxWidth: 320, lineHeight: 1.6 }}>
                Your message has been noted. This is a demo form, so no data leaves your browser.
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setName("");
                  setEmail("");
                  setSubject("");
                  setMessage("");
                }}
                style={{ ...primaryBtn, width: "auto", padding: "10px 20px" }}
              >
                Send another
              </button>
            </motion.div>
          ) : (
            <form onSubmit={submit}>
              <ContactField label="Name" value={name} onChange={setName} />
              <ContactField label="Email" value={email} onChange={setEmail} type="email" />
              <ContactField label="Subject" value={subject} onChange={setSubject} />
              <label style={{ display: "block", marginBottom: 16 }}>
                <span style={fieldLabel}>Message</span>
                <textarea
                  value={message}
                  required
                  rows={5}
                  onChange={(e) => setMessage(e.target.value)}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </label>
              <button type="submit" style={{ ...primaryBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Send size={16} /> Send message
              </button>
            </form>
          )}
        </motion.div>

        {/* Info panel */}
        <motion.div {...fade(0.1)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {infoCards.map((c) => (
            <div key={c.title} className="glass" style={{ padding: 20, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 42,
                  height: 42,
                  borderRadius: 11,
                  flexShrink: 0,
                  color: c.color,
                  background: `color-mix(in srgb, ${c.color} 15%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${c.color} 38%, transparent)`,
                }}
              >
                {c.icon}
              </div>
              <div>
                <div className="mono" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim)", marginBottom: 5 }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 14, color: "var(--text-strong)", lineHeight: 1.5 }}>{c.value}</div>
                {c.sub && <div style={{ fontSize: 12.5, color: "var(--text)", marginTop: 3 }}>{c.sub}</div>}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

const infoCards = [
  { title: "Email", value: "hello@neuralsched.dev", sub: "General enquiries", color: "var(--primary)", icon: <Mail size={19} /> },
  { title: "Location", value: "Remote-first · Global", sub: "ShadowForge HQ", color: "var(--green)", icon: <MapPin size={19} /> },
  { title: "Response time", value: "Within 1–2 business days", sub: "Mon–Fri", color: "var(--teal)", icon: <Clock size={19} /> },
];

function ContactField({
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
      <span style={fieldLabel}>{label}</span>
      <input type={type} value={value} required onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

const fieldLabel: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

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
  fontFamily: "var(--font-ui)",
};

const primaryBtn: React.CSSProperties = {
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
