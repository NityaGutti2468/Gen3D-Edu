import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const BALL_RADIUS = 0.42;
const GLB_NODES = { ground: 'Ground', launch_platform: 'LaunchPlatform', launch_post: 'LaunchPost', apex_marker: 'ApexMarker' };

function ProjectileCanvasScene({ plan, objects, stepIndex, isPlaying, speed, points, current, radius, range, cameraTarget, path }) {
  // R3F hooks require the Canvas context, so this component must remain a Canvas child.
  const gltf = useGLTF('/scenes/projectile-motion.glb');
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((node) => { if (node.isMesh) node.material = node.material.clone(); });
    return copy;
  }, [gltf.scene]);
  const projectile = scene.getObjectByName('Projectile');
  const animation = useRef({ active: false, manual: false, elapsed: 0, duration: 0, from: new THREE.Vector3(), to: new THREE.Vector3() });
  const playingRef = useRef(isPlaying);
  const speedRef = useRef(speed);
  playingRef.current = isPlaying;
  speedRef.current = speed;

  useEffect(() => {
    if (!projectile || !Number.isFinite(current.x) || !Number.isFinite(current.y)) return;
    const from = projectile.position.clone();
    const to = new THREE.Vector3(current.x, current.y + radius, current.z || 0);
    const state = animation.current;
    state.from.copy(from);
    state.to.copy(to);
    state.elapsed = 0;
    state.duration = (isPlaying ? speedRef.current * 0.78 : 460) / 1000;
    state.manual = !isPlaying;
    state.active = from.distanceToSquared(to) > 0.0001;
    if (!state.active) projectile.position.copy(to);
  }, [projectile, current.x, current.y, current.z, radius, stepIndex]);

  useEffect(() => {
    objects.forEach((object) => {
      const node = object.id === 'projectile' ? projectile : GLB_NODES[object.id] ? scene.getObjectByName(GLB_NODES[object.id]) : null;
      if (!node) return;
      const properties = object.properties || {};
      if (object.id !== 'projectile' && properties.position) node.position.set(properties.position.x, properties.position.y, properties.position.z);
      if (properties.rotation) node.rotation.set(THREE.MathUtils.degToRad(properties.rotation.x), THREE.MathUtils.degToRad(properties.rotation.y), THREE.MathUtils.degToRad(properties.rotation.z));
      if (properties.scale) node.scale.set(properties.scale.x, properties.scale.y, properties.scale.z);
      const material = properties.material || {};
      node.traverse((mesh) => {
        if (!mesh.isMesh) return;
        if (material.color) mesh.material.color.set(material.color);
        if (material.roughness !== undefined) mesh.material.roughness = material.roughness;
        if (material.metalness !== undefined) mesh.material.metalness = material.metalness;
        if (material.opacity !== undefined) {
          mesh.material.opacity = material.opacity;
          mesh.material.transparent = material.opacity < 1;
        }
      });
    });
  }, [objects, projectile, scene]);

  useEffect(() => {
    if (isPlaying && animation.current.active) animation.current.manual = false;
  }, [isPlaying]);

  useFrame((_, delta) => {
    const state = animation.current;
    if (!state.active || (!playingRef.current && !state.manual) || !projectile) return;
    state.elapsed += delta;
    const t = Math.min(1, state.elapsed / Math.max(state.duration, 0.05));
    const eased = t * t * (3 - 2 * t);
    projectile.position.lerpVectors(state.from, state.to, eased);
    if (t >= 1) state.active = false;
  });

  if (!projectile) return null;
  const progressTime = THREE.MathUtils.clamp(current.x / Math.max(range, 0.0001) * (points.length > 1 ? 1 : 0), 0, 1);
  const trailPoints = points.slice(0, Math.max(2, Math.floor(progressTime * (points.length - 1)) + 1));
  const camera = plan.scene || {};
  const background = camera.background_color || '#0B1220';

  return <>
    <color attach="background" args={[background]} />
    <ambientLight intensity={1.15} />
    <directionalLight position={[10, 18, 12]} intensity={2.1} castShadow />
    <primitive object={scene} />
    <Line points={points} color={path?.properties.material?.color || '#72D9F3'} lineWidth={2} transparent opacity={path?.properties.material?.opacity ?? 0.72} />
    <Line points={trailPoints} color="#FFC66D" lineWidth={3} />
    <gridHelper args={[Math.max(range + 16, 24), 24, '#45617D', '#253A54']} position={[range / 2, 0.015, 0]} />
    <OrbitControls
      target={[cameraTarget.x, cameraTarget.y, cameraTarget.z]}
      enableRotate
      enablePan
      enableZoom
      screenSpacePanning
      rotateSpeed={0.85}
      panSpeed={0.9}
      enableDamping
      dampingFactor={0.09}
      minDistance={5}
      maxDistance={Math.max(range * 4, 40)}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    />
  </>;
}

function ProjectileScene({ plan, objects, stepIndex, isPlaying, speed }) {
  const path = objects.find((object) => object.id === 'flight_path');
  const ball = objects.find((object) => object.id === 'projectile');
  const [launchSpeed, angle, gravity, flightTime, range, apex] = String(path?.properties.content || '').split('|').map(Number);
  const trajectoryValid = [launchSpeed, angle, gravity, flightTime, range, apex].every(Number.isFinite) && flightTime > 0 && range > 0;
  const current = ball?.properties.position || { x: 0, y: 0, z: 0 };
  const ballScale = ball?.properties.scale || { x: 1, y: 1, z: 1 };
  const radius = BALL_RADIUS * ballScale.y;
  const camera = plan.scene || {};
  const cameraPosition = camera.camera_position || { x: range * 0.52, y: apex * 1.45, z: range * 1.55 };
  const cameraTarget = camera.camera_target || { x: range / 2, y: apex * 0.42, z: 0 };
  const radians = THREE.MathUtils.degToRad(Number.isFinite(angle) ? angle : 45);
  const points = useMemo(() => {
    if (!trajectoryValid) return [];
    return Array.from({ length: 81 }, (_, index) => {
      const time = flightTime * index / 80;
      return [launchSpeed * Math.cos(radians) * time, Math.max(0, launchSpeed * Math.sin(radians) * time - 0.5 * gravity * time * time) + radius, 0];
    });
  }, [trajectoryValid, flightTime, launchSpeed, radians, gravity, radius]);

  if (!trajectoryValid || !ball) {
    return <div className="projectile-3d-error">This 3D projectile plan is missing valid trajectory data.</div>;
  }

  return <div className="projectile-3d-stage" role="img" aria-label={`Three-dimensional projectile motion, step ${stepIndex + 1}: position ${current.x.toFixed(1)} metres horizontally and ${current.y.toFixed(1)} metres vertically`}>
    <div className="projectile-3d-caption"><div><span>{path?.label || '3D PROJECTILE MOTION'}</span><strong>{launchSpeed.toFixed(1)} m/s · {angle.toFixed(1)}° launch</strong></div><span>LEFT-DRAG ORBIT · RIGHT-DRAG PAN · WHEEL ZOOM</span></div>
    <Canvas camera={{ position: [cameraPosition.x, cameraPosition.y, cameraPosition.z], fov: 38, near: 0.1, far: 5000 }} dpr={[1, 1.8]}>
      <ProjectileCanvasScene plan={plan} objects={objects} stepIndex={stepIndex} isPlaying={isPlaying} speed={speed} points={points} current={current} radius={radius} range={range} cameraTarget={cameraTarget} path={path} />
    </Canvas>
    <div className="projectile-3d-readout"><span>{ball.label || `STEP ${String(stepIndex + 1).padStart(2, '0')}`}</span><b>x {current.x.toFixed(1)} m</b><b>y {current.y.toFixed(1)} m</b><span>RANGE {range.toFixed(1)} m</span></div>
  </div>;
}

export default function ProjectileScene3D(props) {
  return <Suspense fallback={<div className="projectile-3d-loading">Preparing the 3D scene…</div>}><ProjectileScene {...props} /></Suspense>;
}

useGLTF.preload('/scenes/projectile-motion.glb');
