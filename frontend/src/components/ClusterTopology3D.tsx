import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Float, RoundedBox, Environment, ContactShadows } from "@react-three/drei";
import { useMemo, useRef, useState, Suspense } from "react";
import * as THREE from "three";
import { NodeSnap } from "../lib/api";
import { tokens } from "../theme/tokens";

// Live animated cluster-topology graph. This IS the GNN's graph representation:
// nodes = GPU servers, edges = NVLink/PCIe links, color/pulse = live load or
// SentinelAI failure risk. Each node is rendered as a realistic PCIe graphics
// card (shroud + fans + backplate + PCB edge + status LED).

function nodePosition(i: number, n: number): [number, number, number] {
  // Small clusters (the dashboard shows a representative 8) look cleanest as a
  // single even ring; larger counts fall back to two stacked rings so many
  // nodes stay readable in 3D.
  if (n <= 12) {
    const angle = (i / n) * Math.PI * 2;
    const r = 3.4;
    return [Math.cos(angle) * r, Math.sin(i * 1.7) * 0.18, Math.sin(angle) * r];
  }
  const perRing = Math.ceil(n / 2);
  const ring = i < perRing ? 0 : 1;
  const idxInRing = i % perRing;
  const angle = (idxInRing / perRing) * Math.PI * 2;
  const r = 4.1 - ring * 0.5;
  const y = ring === 0 ? 0.7 : -0.7;
  return [Math.cos(angle) * r, y + Math.sin(idxInRing * 1.3) * 0.25, Math.sin(angle) * r];
}

function loadColor(util: number, faulting: boolean): string {
  if (faulting) return tokens.color.red;
  if (util > 0.8) return tokens.color.amber; // hot
  if (util > 0.5) return tokens.color.green; // healthy load
  return tokens.color.teal; // idle
}

// A single spinning fan (recessed hub + blades) that sits inside a fan well.
function Fan({ color, speed }: { color: string; speed: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speed;
  });
  return (
    <group ref={ref}>
      {/* fan blades */}
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} rotation={[0, 0, a]} position={[Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0]}>
            <boxGeometry args={[0.11, 0.045, 0.012]} />
            <meshStandardMaterial color="#161a24" metalness={0.5} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {/* hub */}
      <mesh>
        <cylinderGeometry args={[0.045, 0.045, 0.04, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

// Reusable realistic PCIe graphics card. Poly count kept modest for 32 instances.
export function GpuCard({
  color,
  accent,
  faulting,
  fanSpeed,
  selected,
}: {
  color: string;
  accent: string;
  faulting: boolean;
  fanSpeed: number;
  selected?: boolean;
}) {
  // Fan wells laid across the top face of the shroud.
  const wells: [number, number][] = [
    [-0.3, 0],
    [0, 0],
    [0.3, 0],
  ];
  return (
    <group>
      {/* dark metallic shroud (rounded box) */}
      <RoundedBox args={[1.05, 0.16, 0.62]} radius={0.03} smoothness={3} castShadow>
        <meshStandardMaterial
          color="#1b1f2b"
          metalness={0.85}
          roughness={0.34}
          emissive={selected ? accent : "#000000"}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </RoundedBox>

      {/* recessed fan wells + spinning fans on the top face */}
      {wells.map(([x, z], i) => (
        <group key={i} position={[x, 0.081, z]}>
          {/* well ring (double-sided so the recess is never black inside) */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.135, 0.02, 10, 24]} />
            <meshStandardMaterial color="#0d1017" metalness={0.6} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
          {/* subtle emissive fan-ring glow */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
            <torusGeometry args={[0.14, 0.006, 8, 24]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={faulting ? 1.6 : 0.7} />
          </mesh>
          <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <Fan color={accent} speed={fanSpeed} />
          </group>
        </group>
      ))}

      {/* backplate (bottom face) */}
      <mesh position={[0, -0.085, 0]}>
        <boxGeometry args={[1.02, 0.02, 0.6]} />
        <meshStandardMaterial color="#20242f" metalness={0.75} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* PCB edge strip (accent color) along the front long edge */}
      <mesh position={[0, -0.055, 0.315]}>
        <boxGeometry args={[1.04, 0.05, 0.02]} />
        <meshStandardMaterial color={accent} metalness={0.3} roughness={0.5} emissive={accent} emissiveIntensity={0.35} />
      </mesh>

      {/* PCIe gold contact fingers along the bottom back edge */}
      <mesh position={[0, -0.1, -0.28]}>
        <boxGeometry args={[0.55, 0.02, 0.06]} />
        <meshStandardMaterial color="#C9A227" metalness={0.95} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* status LED — color encodes health/load */}
      <mesh position={[0.46, 0.06, 0.28]}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={faulting ? 3 : 1.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

function GpuServer({
  node,
  position,
  onSelect,
  selected,
}: {
  node: NodeSnap;
  position: [number, number, number];
  onSelect?: (id: string) => void;
  selected: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const color = loadColor(node.gpu_util, node.faulting);
  const fanSpeed = 2 + node.gpu_util * 8 + (node.faulting ? 10 : 0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      // Faulting racks jitter; healthy racks gently bob.
      const amp = node.faulting ? 0.06 : 0.02;
      const speed = node.faulting ? 9 : 1.6;
      group.current.position.y = position[1] + Math.sin(t * speed) * amp;
    }
  });

  return (
    <group
      ref={group}
      position={position}
      onClick={(e) => (e.stopPropagation(), onSelect?.(node.node_id))}
      onPointerOver={(e) => (e.stopPropagation(), (document.body.style.cursor = "pointer"))}
      onPointerOut={() => (document.body.style.cursor = "default")}
      scale={selected ? 1.18 : 1}
    >
      <GpuCard color={color} accent={color} faulting={node.faulting} fanSpeed={fanSpeed} selected={selected} />
      <Html center distanceFactor={11} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
        <div
          style={{
            fontFamily: tokens.font.mono,
            fontSize: 11,
            fontWeight: 600,
            color: tokens.color.textStrong,
            whiteSpace: "nowrap",
            transform: "translateY(30px)",
            padding: "3px 8px",
            borderRadius: 8,
            background: "rgba(10, 11, 20, 0.82)",
            border: `1px solid ${selected ? color : tokens.color.border}`,
            boxShadow: selected ? `0 0 10px ${color}` : "0 2px 6px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
          {node.node_id.replace("gpu-node-", "n")}
          <span style={{ color: tokens.color.text }}>·</span>
          <span style={{ color }}>{(node.gpu_util * 100).toFixed(0)}%</span>
        </div>
      </Html>
    </group>
  );
}

function Edges({ nodes, positions }: { nodes: NodeSnap[]; positions: Record<string, [number, number, number]> }) {
  const lines = useMemo(() => {
    const seen = new Set<string>();
    const segs: { points: THREE.Vector3[]; hot: boolean }[] = [];
    nodes.forEach((n) => {
      n.nvlink_peers.forEach((peer) => {
        const key = [n.node_id, peer].sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        const a = positions[n.node_id];
        const b = positions[peer];
        if (!a || !b) return;
        segs.push({ points: [new THREE.Vector3(...a), new THREE.Vector3(...b)], hot: n.faulting });
      });
    });
    return segs;
  }, [nodes, positions]);

  return (
    <>
      {lines.map((l, i) => {
        const geo = new THREE.BufferGeometry().setFromPoints(l.points);
        return (
          <line key={i}>
            <bufferGeometry attach="geometry" {...geo} />
            <lineBasicMaterial
              attach="material"
              color={l.hot ? tokens.color.red : tokens.color.primary}
              transparent
              opacity={l.hot ? 0.6 : 0.35}
            />
          </line>
        );
      })}
    </>
  );
}

export function ClusterTopology3D({ nodes, onSelect }: { nodes: NodeSnap[]; onSelect?: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const positions = useMemo(() => {
    const map: Record<string, [number, number, number]> = {};
    nodes.forEach((n, i) => (map[n.node_id] = nodePosition(i, nodes.length)));
    return map;
  }, [nodes]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onSelect?.(id);
  };

  return (
    <div style={{ height: 380, borderRadius: 14, overflow: "hidden", background: "radial-gradient(circle at 50% 40%, #12162a, #0a0b14)" }}>
      <Canvas camera={{ position: [0, 2.5, 10], fov: 55 }} dpr={[1, 1.8]}>
        {/* Lighting from multiple directions so no face renders black. */}
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 8, 6]} intensity={1.1} />
        <directionalLight position={[-6, 4, -6]} intensity={0.7} color={tokens.color.primary} />
        <pointLight position={[0, -6, 4]} intensity={0.5} color={tokens.color.teal} />
        {/* HDRI reflections are a progressive enhancement; if the asset fails
            to load (offline) the scene still lights correctly via the lights
            above, so guard it in Suspense to avoid blocking the render. */}
        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>

        <Edges nodes={nodes} positions={positions} />
        {nodes.map((n) => (
          <Float key={n.node_id} speed={n.faulting ? 0 : 1} rotationIntensity={0.15} floatIntensity={0.2}>
            <GpuServer
              node={n}
              position={positions[n.node_id]}
              onSelect={handleSelect}
              selected={selectedId === n.node_id}
            />
          </Float>
        ))}

        <ContactShadows position={[0, -2.6, 0]} opacity={0.35} scale={16} blur={2.2} far={5} />
        <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.4} minDistance={6} maxDistance={18} />
      </Canvas>
    </div>
  );
}
