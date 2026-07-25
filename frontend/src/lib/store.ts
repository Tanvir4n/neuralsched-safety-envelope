import { create } from "zustand";

interface AuthState {
  token: string | null;
  role: string | null;
  email: string | null;
  setAuth: (token: string, role: string, email: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem("ns_token"),
  role: localStorage.getItem("ns_role"),
  email: localStorage.getItem("ns_email"),
  setAuth: (token, role, email) => {
    localStorage.setItem("ns_token", token);
    localStorage.setItem("ns_role", role);
    localStorage.setItem("ns_email", email);
    set({ token, role, email });
  },
  logout: () => {
    localStorage.removeItem("ns_token");
    localStorage.removeItem("ns_role");
    localStorage.removeItem("ns_email");
    set({ token: null, role: null, email: null });
  },
}));

interface ThemeState {
  theme: "dark" | "light";
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: (localStorage.getItem("ns_theme") as "dark" | "light") ?? "dark",
  toggle: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("ns_theme", next);
    document.documentElement.setAttribute("data-theme", next);
    set({ theme: next });
  },
}));
