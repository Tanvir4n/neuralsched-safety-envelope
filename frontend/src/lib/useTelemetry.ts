import { useEffect, useRef, useState } from "react";
import { ClusterSnapshot, NodeSnap, telemetryWsUrl } from "./api";

// Local synthetic fallback so the dashboard is NEVER blank/broken even if the
// WebSocket is unreachable. Marked "simulated" in the UI.
function fallbackSnapshot(prev?: ClusterSnapshot): ClusterSnapshot {
  const n = 8;
  const nodes: NodeSnap[] = Array.from({ length: n }).map((_, i) => {
    const prevNode = prev?.nodes[i];
    const base = prevNode?.gpu_util ?? 0.3 + Math.random() * 0.4;
    const util = Math.max(0.02, Math.min(0.98, base + (Math.random() - 0.5) * 0.08));
    const peers = [`gpu-node-${(i + 1) % n}`, `gpu-node-${(i + n - 1) % n}`, `gpu-node-${(i + 4) % n}`];
    return {
      node_id: `gpu-node-${i}`,
      gpu_util: +util.toFixed(3),
      active_jobs: prevNode?.active_jobs ?? Math.floor(Math.random() * 3),
      nvlink_peers: peers.filter((p) => p !== `gpu-node-${i}`),
      faulting: prevNode?.faulting ?? false,
      latest: {
        temp: +(58 + util * 18 + Math.random() * 2).toFixed(1),
        power: +(180 + util * 120).toFixed(1),
        mem_util: +(0.35 + util * 0.5).toFixed(3),
        fan_rpm: +(2600 + util * 900).toFixed(0),
        sm_clock: +(1450 - util * 40).toFixed(1),
        pcie_throughput: +(14 - util * 3).toFixed(2),
        ecc_errors: 0,
      },
    };
  });
  return { nodes, ts: Date.now() / 1000, simulated: true };
}

export function useTelemetry() {
  const [snapshot, setSnapshot] = useState<ClusterSnapshot | null>(null);
  const [live, setLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const snapRef = useRef<ClusterSnapshot | null>(null);

  useEffect(() => {
    let closed = false;

    const startFallback = () => {
      if (fallbackTimer.current) return;
      fallbackTimer.current = window.setInterval(() => {
        const next = fallbackSnapshot(snapRef.current ?? undefined);
        snapRef.current = next;
        setSnapshot(next);
      }, 2000);
      // immediate first frame
      const first = fallbackSnapshot(snapRef.current ?? undefined);
      snapRef.current = first;
      setSnapshot(first);
    };

    const stopFallback = () => {
      if (fallbackTimer.current) {
        clearInterval(fallbackTimer.current);
        fallbackTimer.current = null;
      }
    };

    try {
      const ws = new WebSocket(telemetryWsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        if (closed) return;
        setLive(true);
        stopFallback();
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as ClusterSnapshot;
          snapRef.current = data;
          setSnapshot(data);
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        setLive(false);
        startFallback();
      };
      ws.onclose = () => {
        setLive(false);
        if (!closed) startFallback();
      };
    } catch {
      startFallback();
    }

    // If the socket hasn't connected quickly, show fallback data meanwhile.
    const guard = window.setTimeout(() => {
      if (!snapRef.current) startFallback();
    }, 1500);

    return () => {
      closed = true;
      clearTimeout(guard);
      stopFallback();
      wsRef.current?.close();
    };
  }, []);

  return { snapshot, live };
}
