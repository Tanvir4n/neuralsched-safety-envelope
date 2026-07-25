import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "./lib/store";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { useTelemetry } from "./lib/useTelemetry";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import JobSubmission from "./pages/JobSubmission";
import Health from "./pages/Health";
import Carbon from "./pages/Carbon";
import Cost from "./pages/Cost";
import Safety from "./pages/Safety";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Profile from "./pages/Profile";

function Protected({ children }: { children: JSX.Element }) {
  const token = useAuth((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }: { children: JSX.Element }) {
  const { snapshot } = useTelemetry();
  const healthy = !(snapshot?.nodes ?? []).some((n) => n.faulting);
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <Navbar clusterHealthy={healthy} />
      <main style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto", padding: "26px 22px 60px" }}>{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/dashboard"
          element={<Protected><Shell><Dashboard /></Shell></Protected>}
        />
        <Route
          path="/submit"
          element={<Protected><Shell><JobSubmission /></Shell></Protected>}
        />
        <Route
          path="/health"
          element={<Protected><Shell><Health /></Shell></Protected>}
        />
        <Route
          path="/carbon"
          element={<Protected><Shell><Carbon /></Shell></Protected>}
        />
        <Route
          path="/cost"
          element={<Protected><Shell><Cost /></Shell></Protected>}
        />
        <Route
          path="/safety"
          element={<Protected><Shell><Safety /></Shell></Protected>}
        />
        <Route
          path="/about"
          element={<Protected><Shell><About /></Shell></Protected>}
        />
        <Route
          path="/contact"
          element={<Protected><Shell><Contact /></Shell></Protected>}
        />
        <Route
          path="/profile"
          element={<Protected><Shell><Profile /></Shell></Protected>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
