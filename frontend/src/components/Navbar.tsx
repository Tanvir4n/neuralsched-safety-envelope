import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Moon, Sun, LogOut, Activity, User, Info, Mail, Home, ShieldCheck } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth, useTheme } from "../lib/store";
import { moduleMeta, ModuleKey, tokens } from "../theme/tokens";

const modLinks: { key: ModuleKey; to: string }[] = [
  { key: "smartpack", to: "/dashboard" },
  { key: "greensched", to: "/carbon" },
  { key: "sentinelai", to: "/health" },
  { key: "costcut", to: "/cost" },
];

export function Navbar({ clusterHealthy }: { clusterHealthy: boolean }) {
  const { theme, toggle } = useTheme();
  const { role, email, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const avatarLetter = (email ?? "?").charAt(0).toUpperCase();

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 22px",
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--surface) 70%, transparent)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <NavLink to="/dashboard">
        <Logo size={26} />
      </NavLink>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <NavLink to="/" end style={topLink}>
          <Home size={14} /> Home
        </NavLink>
        <NavLink to="/about" style={topLink}>
          <Info size={14} /> About Us
        </NavLink>
        <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
        {modLinks.map(({ key, to }) => {
          const m = moduleMeta[key];
          return (
            <NavLink
              key={key}
              to={to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 12px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? "var(--text-strong)" : "var(--text)",
                background: isActive ? "color-mix(in srgb, var(--surface-alt) 90%, transparent)" : "transparent",
                border: isActive ? `1px solid color-mix(in srgb, ${m.color} 40%, transparent)` : "1px solid transparent",
              })}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color }} />
              {m.label}
            </NavLink>
          );
        })}
        <NavLink
          to="/safety"
          style={({ isActive }) => ({
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 12px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            color: isActive ? "var(--text-strong)" : "var(--text)",
            background: isActive ? "color-mix(in srgb, var(--surface-alt) 90%, transparent)" : "transparent",
            border: isActive
              ? `1px solid color-mix(in srgb, ${tokens.color.primary} 40%, transparent)`
              : "1px solid transparent",
          })}
        >
          <ShieldCheck size={14} color={tokens.color.primary} />
          Safety
        </NavLink>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          title={clusterHealthy ? "Cluster healthy" : "SentinelAI alert active"}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
        >
          <Activity size={15} color={clusterHealthy ? "var(--green)" : "var(--red)"} />
          <span
            className={clusterHealthy ? "" : "alert-pulse"}
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              background: clusterHealthy ? "var(--green)" : "var(--red)",
            }}
          />
        </div>

        <button onClick={toggle} style={iconBtn} title="Toggle theme">
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            title="Account"
            style={{
              display: "grid",
              placeItems: "center",
              width: 36,
              height: 36,
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: tokens.gradient.brand,
              color: "#0a0b14",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            {avatarLetter}
          </button>

          {open && (
            <div
              className="glass"
              style={{
                position: "absolute",
                top: "calc(100% + 10px)",
                right: 0,
                width: 236,
                padding: 12,
                borderRadius: 14,
                zIndex: 60,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ padding: "4px 8px 10px" }}>
                <div style={{ fontSize: 13, color: "var(--text)", wordBreak: "break-all" }}>{email}</div>
                <span
                  className="mono"
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    fontSize: 10,
                    color: "var(--primary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    border: "1px solid color-mix(in srgb, var(--primary) 40%, transparent)",
                    borderRadius: 6,
                    padding: "2px 7px",
                  }}
                >
                  {role}
                </span>
              </div>

              <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

              <Link to="/profile" style={menuItem}>
                <User size={15} /> Profile
              </Link>
              <Link to="/about" style={menuItem}>
                <Info size={15} /> About
              </Link>
              <Link to="/contact" style={menuItem}>
                <Mail size={15} /> Contact
              </Link>

              <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />

              <button
                onClick={() => {
                  logout();
                  nav("/login");
                }}
                style={{ ...menuItem, background: "transparent", width: "100%", textAlign: "left", color: "var(--red)" }}
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

const iconBtn: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 34,
  height: 34,
  borderRadius: 10,
  background: "var(--surface-alt)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

const topLink = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  color: isActive ? "var(--text-strong)" : "var(--text)",
  background: isActive ? "color-mix(in srgb, var(--surface-alt) 90%, transparent)" : "transparent",
  border: isActive ? "1px solid color-mix(in srgb, var(--primary) 40%, transparent)" : "1px solid transparent",
});

const menuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 8px",
  borderRadius: 9,
  fontSize: 13,
  color: "var(--text-strong)",
  background: "transparent",
  border: "none",
};
