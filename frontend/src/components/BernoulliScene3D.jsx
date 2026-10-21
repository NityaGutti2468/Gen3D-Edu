import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const PIPE = '#7394C9';
const WATER = '#37BFE8';

function radiusAt(x) {
  if (x < -1.05) return 0.9;
  if (x < -0.3) return THREE.MathUtils.lerp(0.9, 0.48, (x + 1.05) / 0.75);
  if (x <= 0.3) return 0.48;
  if (x < 1.05) return THREE.MathUtils.lerp(0.48, 0.9, (x - 0.3) / 0.75);
  return 0.9;
}

function PipeSection({ x, length, rLeft, rRight }) {
  return <mesh position={[x, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
    <cylinderGeometry args={[rRight, rLeft, length, 40, 1, true]} />
    <meshStandardMaterial color={PIPE} metalness={0.42} roughness={0.28} transparent opacity={0.32} side={THREE.DoubleSide} />
  </mesh>;
}

function FlowParticle({ offset, isPlaying, speed }) {
  const ref = useRef(null);
  const progress = useRef(offset);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (isPlaying) {
      const x = progress.current * 7.4 - 3.7;
      const localRadius = radiusAt(x);
      // Continuity: the same flow moves faster through the narrower cross-section.
      progress.current = (progress.current + delta * 0.24 * (1200 / speed) / (localRadius * localRadius)) % 1;
    }
    const x = progress.current * 7.4 - 3.7;
    const angle = offset * Math.PI * 7 + progress.current * 12;
    const r = radiusAt(x) * 0.55;
    ref.current.position.set(x, Math.cos(angle) * r, Math.sin(angle) * r);
  });
  return <mesh ref={ref}>
    <sphereGeometry args={[0.075, 14, 12]} />
    <meshStandardMaterial color={WATER} emissive="#087FA8" emissiveIntensity={0.75} roughness={0.28} />
  </mesh>;
}

function FlowArrow({ x, y, length, color = '#B8EDFF' }) {
  return <group position={[x, y, 0]}>
    <mesh position={[length * 0.34, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <cylinderGeometry args={[0.035, 0.035, length * 0.68, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
    </mesh>
    <mesh position={[length * 0.76, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <coneGeometry args={[0.12, 0.26, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
    </mesh>
  </group>;
}

function PressureTap({ x, label, pressure, active }) {
  const height = 0.42 + pressure * 0.72;
  return <group position={[x, 0, 0]}>
    <mesh position={[0, 0.92, 0]}>
      <cylinderGeometry args={[0.035, 0.035, 0.34, 12]} />
      <meshStandardMaterial color={active ? '#FFD27C' : PIPE} />
    </mesh>
    <mesh position={[0, 1.14 + height / 2, 0]}>
      <cylinderGeometry args={[0.09, 0.09, height, 18]} />
      <meshStandardMaterial color={active ? '#FFC66D' : '#729DFF'} emissive={active ? '#B96D1B' : '#273D8F'} emissiveIntensity={0.35} transparent opacity={0.82} />
    </mesh>
    <Html position={[0, 1.38 + height, 0]} center distanceFactor={8} zIndexRange={[4, 0]}>
      <div className={`scene3d-label bernoulli-gauge ${active ? 'highlighted' : ''}`}><strong>{label}</strong><span>{pressure > 1 ? 'HIGH PRESSURE' : pressure < 0.6 ? 'LOW PRESSURE' : 'PRESSURE RECOVERS'}</span></div>
    </Html>
  </group>;
}

function VenturiModel({ activeRegion, isPlaying, speed }) {
  const particles = useMemo(() => Array.from({ length: 24 }, (_, i) => i / 24), []);
  const silhouette = useMemo(() => {
    const top = Array.from({ length: 61 }, (_, i) => {
      const x = -3.7 + i * 7.4 / 60;
      return [x, radiusAt(x), 0];
    });
    return { top, bottom: top.map(([x, y]) => [x, -y, 0]) };
  }, []);
  return <>
    <ambientLight intensity={1.35} />
    <directionalLight position={[1, 7, 7]} intensity={2.15} castShadow />
    <pointLight position={[-3, 2.5, 2]} intensity={0.8} color="#66CFFF" />
    <gridHelper args={[18, 28, '#304766', '#1D2C43']} position={[0, -1.22, 0]} />
    <PipeSection x={-2.375} length={2.65} rLeft={0.9} rRight={0.9} />
    <PipeSection x={-0.675} length={0.75} rLeft={0.9} rRight={0.48} />
    <PipeSection x={0} length={0.6} rLeft={0.48} rRight={0.48} />
    <PipeSection x={0.675} length={0.75} rLeft={0.48} rRight={0.9} />
    <PipeSection x={2.375} length={2.65} rLeft={0.9} rRight={0.9} />
    <Line points={silhouette.top} color="#B9D2FF" lineWidth={2} />
    <Line points={silhouette.bottom} color="#B9D2FF" lineWidth={2} />
    {[-3.7, -1.05, -0.3, 0.3, 1.05, 3.7].map((x) => <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[radiusAt(x), 0.035, 8, 36]} />
      <meshStandardMaterial color="#8CA8D8" metalness={0.36} roughness={0.35} />
    </mesh>)}
    {particles.map((offset) => <FlowParticle key={offset} offset={offset} isPlaying={isPlaying} speed={speed} />)}
    <PressureTap x={-2.25} label="WIDE INLET" pressure={1.35} active={activeRegion === 'inlet' || activeRegion === 'all'} />
    <PressureTap x={0} label="NARROW THROAT" pressure={0.38} active={activeRegion === 'throat' || activeRegion === 'all'} />
    <PressureTap x={2.25} label="WIDE OUTLET" pressure={0.98} active={activeRegion === 'outlet' || activeRegion === 'all'} />
    <FlowArrow x={-3.15} y={1.3} length={0.72} />
    <FlowArrow x={-0.5} y={1.3} length={1.65} color="#FFC66D" />
    <FlowArrow x={2.45} y={1.3} length={0.72} />
    {[[-2.65, 'SLOWER FLOW'], [-0.05, 'FASTER FLOW'], [2.85, 'SLOWER FLOW']].map(([x, label]) => <Html key={label + x} position={[x, 1.62, 0]} center distanceFactor={9} zIndexRange={[4, 0]}><div className="bernoulli-speed-label">{label}</div></Html>)}
    <Html position={[0, -1.78, 0]} center distanceFactor={10} zIndexRange={[3, 0]}><div className="bernoulli-equation">P + ½ρv² = constant <span>· horizontal flow</span></div></Html>
  </>;
}

function activeRegionFor(step) {
  const text = `${step?.title || ''} ${step?.explanation || ''}`.toLowerCase();
  if (/bernoulli|equation|conservation/.test(text)) return 'all';
  if (/throat|narrow|constrict|velocity|speed increases|pressure|drops/.test(text)) return 'throat';
  if (/outlet|exit|widens|recovery/.test(text)) return 'outlet';
  if (/inlet|entry|wide pipe|start/.test(text)) return 'inlet';
  return 'throat';
}

export default function BernoulliScene3D({ plan, stepIndex, isPlaying, speed }) {
  const step = plan.steps[stepIndex] || plan.steps[0];
  const activeRegion = activeRegionFor(step);
  return <div className="semantic-3d-stage bernoulli-3d-stage" role="img" aria-label={`3D Venturi tube animation, step ${stepIndex + 1}`}>
    <div className="semantic-3d-caption"><span>BERNOULLI · VENTURI TUBE</span><span>LEFT-DRAG ORBIT · RIGHT-DRAG PAN · WHEEL ZOOM</span></div>
    <Canvas camera={{ position: [0.25, 4.6, 10.5], fov: 40, near: 0.1, far: 120 }} dpr={[1, 1.6]} shadows>
      <color attach="background" args={['#0B1220']} />
      <VenturiModel activeRegion={activeRegion} isPlaying={isPlaying} speed={speed} />
      <OrbitControls target={[0, 0.1, 0]} enableRotate enablePan enableZoom screenSpacePanning rotateSpeed={0.85} panSpeed={0.9} enableDamping dampingFactor={0.09} minDistance={4} maxDistance={26} mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} />
    </Canvas>
  </div>;
}
