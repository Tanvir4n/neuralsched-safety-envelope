// Lightweight R3F hero visual: a few floating realistic PCIe graphics cards
// (metallic shroud + recessed spinning fans + backplate + PCB edge + glowing
// LEDs), orbiting node-graph points and a subtle "clean energy" green core.
// Wrapped in an error boundary so a WebGL failure never takes down the
// marketing page — it falls back to null.
import { Suspense, Component, ReactNode, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, RoundedBox, Environment } from "@react-three/drei";
import * as THREE from "three";
import { tokens } from "../theme/tokens";

const INDIGO = tokens.color.primary; // #7C83FF
const EMERALD = tokens.color.green; // #34D399
const TEAL = tokens.color.teal; // #22D3EE

// A single spinning fan (recessed hub + blades) that sits inside a fan well.
function Fan({ color }: { color: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 3;
  });
  return (
    <group ref={ref}>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh key={i} rotation={[0, 0, a]} position={[Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0]}>
            <boxGeometry args={[0.16, 0.06, 0.016]} />
            <meshStandardMaterial color="#161a24" metalness={0.5} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      <mesh>
        <cylinderGeometry args={[0.06, 0.06, 0.05, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

// Realistic PCIe graphics card shared with the topology view's visual language.
function GpuChassis({
  position,
  accent,
}: {
  position: [number, number, number];
  accent: string;
}) {
  const wells: number[] = [-0.42, 0.42];
  return (
    <group position={position}>
      {/* dark metallic shroud (rounded box) */}
      <RoundedBox args={[1.5, 0.24, 0.9]} radius={0.05} smoothness={3} castShadow>
        <meshStandardMaterial color="#1b1f2b" metalness={0.85} roughness={0.34} />
      </RoundedBox>

      {/* recessed fan wells + spinning fans on the top face */}
      {wells.map((x, i) => (
        <group key={i} position={[x, 0.121, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.03, 10, 24]} />
            <meshStandardMaterial color="#0d1017" metalness={0.6} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
          {/* emissive fan-ring glow */}
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.003, 0]}>
            <torusGeometry args={[0.21, 0.009, 8, 24]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.9} />
          </mesh>
          <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
            <Fan color={accent} />
          </group>
        </group>
      ))}

      {/* backplate (bottom face) */}
      <mesh position={[0, -0.13, 0]}>
        <boxGeometry args={[1.46, 0.03, 0.86]} />
        <meshStandardMaterial color="#20242f" metalness={0.75} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* PCB edge strip (accent) along the front long edge */}
      <mesh position={[0, -0.08, 0.46]}>
        <boxGeometry args={[1.48, 0.08, 0.03]} />
        <meshStandardMaterial color={accent} metalness={0.3} roughness={0.5} emissive={accent} emissiveIntensity={0.4} />
      </mesh>

      {/* PCIe gold contact fingers along the bottom back edge */}
      <mesh position={[0, -0.15, -0.4]}>
        <boxGeometry args={[0.8, 0.03, 0.09]} />
        <meshStandardMaterial color="#C9A227" metalness={0.95} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>

      {/* status LED */}
      <mesh position={[0.66, 0.09, 0.4]}>
        <sphereGeometry args={[0.05, 12, 12]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  );
}

function NodeGraph() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25;
  });
  const nodes: [number, number, number][] = [
    [1.9, 1.1, -0.5],
    [-1.9, 1.3, 0.4],
    [1.6, -1.2, 0.6],
    [-1.7, -1.0, -0.4],
    [0, 1.9, 0.2],
  ];
  return (
    <group ref={ref}>
      {nodes.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial
            color={i % 2 ? TEAL : INDIGO}
            emissive={i % 2 ? TEAL : INDIGO}
            emissiveIntensity={0.8}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function GreenCore() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.4;
  });
  // A subtle emerald "clean energy" icosahedron core at the center.
  return (
    <mesh ref={ref} position={[0, -0.1, -0.2]} scale={0.55}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial
        color={EMERALD}
        emissive={EMERALD}
        emissiveIntensity={0.5}
        wireframe
      />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      {/* Lighting from multiple directions so no card face renders black. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 6, 5]} intensity={1.1} />
      <directionalLight position={[-5, 3, -4]} intensity={0.7} color={INDIGO} />
      <pointLight position={[0, -5, 3]} intensity={0.6} color={TEAL} />
      <Environment preset="city" />
      <Float speed={2} rotationIntensity={0.5} floatIntensity={1.2}>
        <GpuChassis position={[-1.1, 0.5, 0]} accent={INDIGO} />
      </Float>
      <Float speed={1.6} rotationIntensity={0.4} floatIntensity={1}>
        <GpuChassis position={[1.2, -0.4, -0.3]} accent={EMERALD} />
      </Float>
      <Float speed={2.4} rotationIntensity={0.6} floatIntensity={1.4}>
        <GpuChassis position={[0.1, 1.3, 0.4]} accent={TEAL} />
      </Float>
      <GreenCore />
      <NodeGraph />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate
        autoRotateSpeed={0.6}
      />
    </>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function HeroScene() {
  return (
    <SceneBoundary>
      <Canvas
        dpr={[1, 1.8]}
        camera={{ position: [0, 0, 6], fov: 45 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
