import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const COLORS = ['#8BAEFF', '#9D8BFF', '#57D6C2', '#FFC66D', '#FF8F9C', '#7FD0FF'];
const TYPE_COLORS = { array: '#5875D7', array_cell: '#5867B7', pointer: '#79DDAA', node: '#657DE0', edge: '#79CBE8', shape: '#7166C9', chart: '#4FB59C', equation: '#B06FCC', text: '#576D8D', label: '#576D8D', graph: '#50649B' };

const vec = (value, fallback = { x: 0, y: 0, z: 0 }) => ({
  x: Number.isFinite(value?.x) ? value.x : fallback.x,
  y: Number.isFinite(value?.y) ? value.y : fallback.y,
  z: Number.isFinite(value?.z) ? value.z : fallback.z,
});

function labelFor(object) {
  const properties = object.properties || {};
  return String(properties.content || properties.value || object.label || '').trim();
}

function objectPosition(object, index, count, mode = 'default') {
  const supplied = object.properties?.position;
  if (supplied && [supplied.x, supplied.y, supplied.z].every(Number.isFinite)) return vec(supplied);
  if (mode === 'stack') return { x: 0, y: index * 0.92 - (count - 1) * 0.46, z: 0 };
  if (object.type === 'node' || object.type === 'shape' && count > 1) {
    const x = (index - (count - 1) / 2) * 2.3;
    return { x, y: 0.6 + (index % 2) * 0.25, z: 0 };
  }
  const columns = Math.min(4, Math.max(1, count));
  const row = Math.floor(index / columns);
  const column = index % columns;
  return { x: (column - (columns - 1) / 2) * 2.1, y: 0.7 - row * 1.25, z: row % 2 ? -0.4 : 0.4 };
}

function PrimitiveGeometry({ geometry, color, material = {}, highlighted = false }) {
  const appearance = material || {};
  const opacity = appearance.opacity ?? 1;
  const roughness = appearance.roughness ?? 0.48;
  const metalness = appearance.metalness ?? 0.12;
  const mat = <meshStandardMaterial color={highlighted ? '#A6C4FF' : color} roughness={roughness} metalness={metalness} transparent={opacity < 1} opacity={opacity} emissive={highlighted ? '#3659C5' : '#000000'} emissiveIntensity={highlighted ? 0.55 : 0.04} />;
  if (geometry === 'sphere') return <mesh castShadow receiveShadow><sphereGeometry args={[0.48, 32, 24]} />{mat}</mesh>;
  if (geometry === 'cylinder') return <mesh castShadow receiveShadow><cylinderGeometry args={[0.42, 0.42, 0.9, 28]} />{mat}</mesh>;
  if (geometry === 'cone' || geometry === 'arrow') return <mesh castShadow><coneGeometry args={[0.48, 0.95, 28]} />{mat}</mesh>;
  if (geometry === 'torus') return <mesh castShadow><torusGeometry args={[0.34, 0.12, 14, 40]} />{mat}</mesh>;
  if (geometry === 'plane') return <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[1.15, 0.9]} />{mat}</mesh>;
  if (geometry === 'capsule') return <mesh castShadow receiveShadow><capsuleGeometry args={[0.3, 0.52, 6, 16]} />{mat}</mesh>;
  return <RoundedBox args={[1.45, 0.82, 0.5]} radius={0.1} smoothness={3} castShadow receiveShadow>{mat}</RoundedBox>;
}

function AnimatedObject({ object, position, speed, isPlaying, highlighted = object.highlighted, showLabel = true, labelPosition = [0, 0.72, 0], children }) {
  const group = useRef(null);
  const target = useMemo(() => vec(position), [position.x, position.y, position.z]);
  const properties = object.properties || {};
  const targetScale = vec(properties.scale, { x: 1, y: 1, z: 1 });
  const targetRotation = vec(properties.rotation);
  const animation = useRef({ elapsed: 0, duration: 0.45, from: new THREE.Vector3(), to: new THREE.Vector3(), fromScale: new THREE.Vector3(1, 1, 1), toScale: new THREE.Vector3(1, 1, 1), fromRotation: new THREE.Quaternion(), toRotation: new THREE.Quaternion() });

  useEffect(() => {
    if (!group.current) return;
    const state = animation.current;
    state.elapsed = 0;
    state.duration = isPlaying ? Math.max(0.25, speed * 0.7 / 1000) : 0.48;
    state.from.copy(group.current.position);
    state.to.set(target.x, target.y, target.z);
    state.fromScale.copy(group.current.scale);
    state.toScale.set(targetScale.x, targetScale.y, targetScale.z);
    state.fromRotation.copy(group.current.quaternion);
    state.toRotation.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(targetRotation.x), THREE.MathUtils.degToRad(targetRotation.y), THREE.MathUtils.degToRad(targetRotation.z)));
  }, [target, targetScale.x, targetScale.y, targetScale.z, targetRotation.x, targetRotation.y, targetRotation.z, object.id, object.properties.value, speed, isPlaying]);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    const state = animation.current;
    state.elapsed = Math.min(state.duration, state.elapsed + delta);
    const amount = THREE.MathUtils.smoothstep(state.elapsed / Math.max(state.duration, 0.01), 0, 1);
    node.position.lerpVectors(state.from, state.to, amount);
    node.scale.lerpVectors(state.fromScale, state.toScale, amount);
    node.quaternion.slerpQuaternions(state.fromRotation, state.toRotation, amount);
  });

  return <group ref={group}>
    {children}
    {showLabel && <Html position={labelPosition} center distanceFactor={9} zIndexRange={[5, 0]}>
      <div className={`scene3d-label ${object.type === 'pointer' ? 'scene3d-pointer-label' : ''} ${highlighted ? 'highlighted' : ''}`}>{labelFor(object)}</div>
    </Html>}
  </group>;
}

function SemanticObject({ object, position, speed, isPlaying, index }) {
  const type = object.type;
  if (type === 'array' || type === 'array_cell' || type === 'pointer' || type === 'edge') return null;
  const properties = object.properties || {};
  const geometry = properties.geometry || (type === 'node' ? 'sphere' : type === 'equation' ? 'plane' : 'box');
  const color = properties.material?.color || TYPE_COLORS[type] || COLORS[index % COLORS.length];
  return <AnimatedObject object={object} position={position} speed={speed} isPlaying={isPlaying}>
    <PrimitiveGeometry geometry={geometry} color={color} material={properties.material} highlighted={object.highlighted} />
  </AnimatedObject>;
}

function ArrayScene({ array, cells, pointers, ranges, selectedIndices, speed, isPlaying }) {
  const values = array?.properties?.values || cells.map((cell) => cell.properties?.value ?? cell.label);
  if (!values.length) return null;
  const base = vec(array?.properties?.position);
  const spacing = Math.max(1.0, Math.min(1.55, Number(array?.properties?.spacing) || 1.2));
  const windowFromPointers = pointers.length >= 2
    ? [pointers.find((item) => /left|low|start|begin/i.test(item.label))?.properties.index, pointers.find((item) => /right|high|end/i.test(item.label))?.properties.index]
    : null;
  const currentRange = windowFromPointers?.every(Number.isFinite) ? windowFromPointers : ranges.at(-1);
  const left = currentRange ? Math.min(currentRange[0], currentRange[1]) : null;
  const right = currentRange ? Math.max(currentRange[0], currentRange[1]) : null;
  const width = (values.length - 1) * spacing;
  const activeColor = '#769DFF';
  return <group position={[base.x, base.y, base.z]}>
    {values.map((value, index) => {
      const source = cells[index] || { id: `${array?.id || 'array'}-cell-${index}`, type: 'array_cell', label: String(value), properties: {}, highlighted: false };
      const highlighted = selectedIndices.has(index) || Boolean(source.highlighted) || left !== null && index >= left && index <= right;
      return <group key={source.id} position={[index * spacing - width / 2, 0, 0]}>
        <RoundedBox args={[0.92, 0.74, 0.72]} radius={0.1} smoothness={3} castShadow receiveShadow>
          <meshStandardMaterial color={highlighted ? activeColor : source.properties?.material?.color || '#394C91'} emissive={highlighted ? '#334FBA' : '#10162B'} emissiveIntensity={highlighted ? 0.62 : 0.18} metalness={0.22} roughness={0.36} />
        </RoundedBox>
        <Html position={[0, 0, 0.4]} center distanceFactor={8} zIndexRange={[4, 0]}><span className="scene3d-array-value">{String(value)}</span></Html>
        <Html position={[0, -0.58, 0.15]} center distanceFactor={10} zIndexRange={[3, 0]}><span className="scene3d-index">{index}</span></Html>
      </group>;
    })}
    {pointers.map((pointer, index) => {
      const pointerIndex = Math.max(0, Math.min(values.length - 1, pointer.properties?.index ?? 0));
      const pointerX = pointerIndex * spacing - width / 2;
      const tone = /left|low|start|begin/i.test(pointer.label) ? '#64E399' : /right|high|end/i.test(pointer.label) ? '#FF9B53' : '#92B8FF';
      return <AnimatedObject key={pointer.id} object={pointer} position={{ x: base.x + pointerX, y: base.y + 1.12 + (index % 2) * 0.18, z: base.z + 0.1 }} speed={speed} isPlaying={isPlaying}>
        <mesh rotation={[Math.PI, 0, 0]} position={[0, -0.16, 0]}><coneGeometry args={[0.14, 0.34, 18]} /><meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={0.45} /></mesh>
      </AnimatedObject>;
    })}
    <Html position={[0, -0.98, 0]} center distanceFactor={9} zIndexRange={[2, 0]}><div className="scene3d-label scene3d-array-caption">{array?.label || 'Array'} · {values.length} values{currentRange ? ` · range ${left}–${right}` : ''}</div></Html>
  </group>;
}

function EdgeVisual({ edge, from, to, stepIndex, isPlaying }) {
  const bead = useRef(null);
  const progress = useRef(0);
  useEffect(() => { progress.current = 0; }, [stepIndex, edge.highlighted]);
  useFrame((_, delta) => {
    if (!bead.current || !edge.highlighted || !isPlaying) return;
    progress.current = Math.min(1, progress.current + delta * 0.9);
    bead.current.position.lerpVectors(new THREE.Vector3(from.x, from.y, from.z), new THREE.Vector3(to.x, to.y, to.z), progress.current);
  });
  const start = new THREE.Vector3(from.x, from.y, from.z);
  const end = new THREE.Vector3(to.x, to.y, to.z);
  const direction = end.clone().sub(start).normalize();
  const arrowPosition = end.clone().addScaledVector(direction, -0.34);
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  return <group>
    <Line points={[start, end]} color={edge.highlighted ? '#FFC66D' : edge.properties?.material?.color || '#64BFE5'} lineWidth={edge.highlighted ? 3 : 1.6} transparent opacity={edge.highlighted ? 1 : 0.7} />
    <mesh position={arrowPosition} quaternion={orientation}><coneGeometry args={[0.13, 0.36, 16]} /><meshStandardMaterial color={edge.highlighted ? '#FFC66D' : '#64BFE5'} emissive={edge.highlighted ? '#A85D16' : '#163C55'} emissiveIntensity={0.4} /></mesh>
    {edge.highlighted && <mesh ref={bead}><sphereGeometry args={[0.13, 16, 12]} /><meshBasicMaterial color="#FFF0BA" /></mesh>}
    {edge.label && <Html position={[start.clone().add(end).multiplyScalar(0.5).x, start.clone().add(end).multiplyScalar(0.5).y + 0.25, start.clone().add(end).multiplyScalar(0.5).z]} center distanceFactor={9} zIndexRange={[4, 0]}><div className={`scene3d-label ${edge.highlighted ? 'highlighted' : ''}`}>{edge.label}</div></Html>}
  </group>;
}

function StackBase({ count }) {
  const height = Math.max(3, count * 0.94 + 0.9);
  return <group>
    <mesh position={[-0.77, 0, 0]}><boxGeometry args={[0.12, height, 0.64]} /><meshStandardMaterial color="#546CA8" metalness={0.25} roughness={0.5} /></mesh>
    <mesh position={[0.77, 0, 0]}><boxGeometry args={[0.12, height, 0.64]} /><meshStandardMaterial color="#546CA8" metalness={0.25} roughness={0.5} /></mesh>
    <mesh position={[0, -height / 2, 0]}><boxGeometry args={[1.66, 0.16, 0.72]} /><meshStandardMaterial color="#8EA8E8" metalness={0.3} roughness={0.4} /></mesh>
    <Html position={[0, height / 2 + 0.48, 0]} center distanceFactor={9}><div className="scene3d-label">TOP ↓</div></Html>
  </group>;
}

function QueueScene({ slots, items, speed, isPlaying }) {
  const slotCount = Math.max(3, slots.length, items.length);
  const slotPositions = (slots.length ? slots : Array.from({ length: slotCount }, (_, index) => ({ id: `queue-virtual-slot-${index}`, properties: {} }))).map((slot, index) => ({
    object: slot,
    x: Number.isFinite(slot.properties?.position?.x) ? slot.properties.position.x : (index - ((slots.length || slotCount) - 1) / 2) * 1.7,
  })).sort((a, b) => a.x - b.x);
  const itemPositions = items.map((item, index) => ({
    object: item,
    x: Number.isFinite(item.properties?.position?.x) ? item.properties.position.x : slotPositions[index]?.x ?? index * 1.7,
  })).sort((a, b) => a.x - b.x);
  const occupiedSlots = new Set(itemPositions.map(({ x }) => {
    let nearest = 0;
    slotPositions.forEach((slot, index) => {
      if (Math.abs(slot.x - x) < Math.abs(slotPositions[nearest].x - x)) nearest = index;
    });
    return nearest;
  }));
  const firstX = slotPositions[0]?.x ?? -1.7;
  const lastItemX = itemPositions.at(-1)?.x ?? firstX;
  const laneLength = Math.max(2.4, (slotPositions.at(-1)?.x ?? 1.7) - firstX + 1.25);

  return <group>
    <mesh position={[0, -0.55, 0]}><boxGeometry args={[laneLength + 0.4, 0.12, 1.42]} /><meshStandardMaterial color="#26354F" metalness={0.3} roughness={0.45} /></mesh>
    {slotPositions.map(({ object, x }, index) => <group key={`queue-slot-${object.id}`} position={[x, 0, 0]}>
      {!occupiedSlots.has(index) && <>
        <RoundedBox args={[1.08, 0.82, 0.68]} radius={0.1} smoothness={3}><meshStandardMaterial color="#3B4B63" transparent opacity={0.25} roughness={0.55} /></RoundedBox>
        <Html position={[0, 0, 0.38]} center distanceFactor={8} zIndexRange={[4, 0]}><div className="scene3d-queue-empty">EMPTY</div></Html>
      </>}
      <Html position={[0, -0.72, 0.14]} center distanceFactor={10} zIndexRange={[3, 0]}><span className="scene3d-index">{index}</span></Html>
    </group>)}
    {itemPositions.map(({ object, x }) => {
      const appearance = object.properties?.material || {};
      const value = object.properties?.value ?? object.properties?.content ?? object.label;
      return <AnimatedObject key={object.id} object={object} position={{ x, y: 0, z: 0 }} speed={speed} isPlaying={isPlaying} showLabel={false}>
        <RoundedBox args={[1.02, 0.76, 0.7]} radius={0.11} smoothness={4} castShadow receiveShadow>
          <meshStandardMaterial color={appearance.color || '#4D76D8'} roughness={appearance.roughness ?? 0.38} metalness={appearance.metalness ?? 0.18} transparent={(appearance.opacity ?? 1) < 1} opacity={appearance.opacity ?? 1} emissive={object.highlighted ? '#294C9F' : '#111A32'} emissiveIntensity={object.highlighted ? 0.45 : 0.14} />
        </RoundedBox>
        <Html position={[0, 0, 0.38]} center distanceFactor={8} zIndexRange={[5, 0]}><span className="scene3d-queue-value">{String(value)}</span></Html>
      </AnimatedObject>;
    })}
    {items.length ? <>
      <Html position={[firstX, -0.98, 0.18]} center distanceFactor={9} zIndexRange={[4, 0]}><div className="scene3d-queue-marker">FRONT</div></Html>
      <Html position={[lastItemX, -0.98, 0.18]} center distanceFactor={9} zIndexRange={[4, 0]}><div className="scene3d-queue-marker rear">REAR</div></Html>
    </> : <Html position={[firstX, -0.98, 0.18]} center distanceFactor={9} zIndexRange={[4, 0]}><div className="scene3d-queue-marker">FRONT · REAR</div></Html>}
  </group>;
}

function SemanticCanvas({ plan, objects, stepIndex, ranges, selectedIndices, speed, isPlaying }) {
  const arrays = objects.filter((object) => object.type === 'array');
  const cells = objects.filter((object) => object.type === 'array_cell');
  const pointers = objects.filter((object) => object.type === 'pointer');
  const nodes = objects.filter((object) => ['node', 'shape'].includes(object.type));
  const edges = objects.filter((object) => object.type === 'edge');
  const isStack = /stack/i.test(plan.concept);
  const queueMode = /queue/i.test(plan.concept);
  const queueSlots = queueMode ? objects.filter((object) => /empty\s+slot|queue\s+slot/i.test(labelFor(object))) : [];
  const queueItems = queueMode ? objects.filter((object) => !queueSlots.some((slot) => slot.id === object.id) && ['shape', 'node', 'array_cell'].includes(object.type) && (/^item_/i.test(object.id) || /^-?\d+(?:\.\d+)?$/.test(labelFor(object)))) : [];
  const stackItems = isStack ? nodes.filter((object) => !/(stack|top|bottom|container|operation|push|pop)/i.test(labelFor(object))) : [];
  const stackIds = new Set(stackItems.map((object) => object.id));
  const queueIds = new Set([...queueSlots, ...queueItems].map((object) => object.id));
  const drawable = objects.filter((object) => !['edge', 'array', 'array_cell', 'pointer', 'graph'].includes(object.type) && !stackIds.has(object.id) && !queueIds.has(object.id) && !(queueMode && ['text', 'label'].includes(object.type)));
  const objectPositions = new Map();
  const nodePositions = new Map();
  const stackMode = isStack && stackItems.length > 0;
  const explicitPositions = objects.map((object) => object.properties?.position).filter((position) => position && [position.x, position.y, position.z].every(Number.isFinite));
  const bounds = ['x', 'y', 'z'].map((axis) => {
    const values = explicitPositions.map((position) => position[axis]);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: 0, max: 0 };
  });
  const axisScale = [12, 7, 12].map((span, index) => Math.max(1, (bounds[index].max - bounds[index].min) / span));
  const legacyPosition = (position) => ({
    x: (position.x - (bounds[0].min + bounds[0].max) / 2) / axisScale[0],
    y: (position.y - (bounds[1].min + bounds[1].max) / 2) / axisScale[1],
    z: (position.z - (bounds[2].min + bounds[2].max) / 2) / axisScale[2],
  });
  drawable.forEach((object, index) => {
    const supplied = object.properties?.position;
    const position = supplied
      ? plan.render_mode === '3d' ? vec(supplied) : legacyPosition(vec(supplied))
      : objectPosition(object, index, drawable.length);
    objectPositions.set(object.id, position);
    if (object.type === 'node' || object.type === 'shape') nodePositions.set(object.id, position);
  });
  if (stackMode) stackItems.forEach((object, index) => nodePositions.set(object.id, {
    x: 0,
    y: index * 0.92 - (stackItems.length - 1) * 0.46,
    z: 0,
  }));
  edges.forEach((edge, index) => {
    const from = nodePositions.get(edge.properties?.source_id);
    const to = nodePositions.get(edge.properties?.target_id);
    if (!from || !to) return;
    const offset = (index - (edges.length - 1) / 2) * 0.12;
    objectPositions.set(edge.id, { from, to, offset });
  });

  const arraySource = arrays[0] || (cells.length ? {
    id: 'array-cells', type: 'array', label: 'Array',
    properties: { values: cells.map((cell) => cell.properties?.value ?? cell.label) },
  } : null);
  const arrayLength = arraySource?.properties?.values?.length || cells.length;
  const distance = Math.max(9, arrayLength * 0.9, Math.sqrt(drawable.length + stackItems.length + queueItems.length + queueSlots.length) * 3.2);
  const cameraPosition = plan.scene?.camera_position;
  const cameraTarget = plan.scene?.camera_target;
  const camera = cameraPosition ? [cameraPosition.x, cameraPosition.y, cameraPosition.z] : queueMode ? [0, 4.2, Math.max(9, distance)] : [0, 5.8, distance];
  const target = cameraTarget ? [cameraTarget.x, cameraTarget.y, cameraTarget.z] : queueMode ? [0, -0.05, 0] : [0, 0.3, 0];
  const background = plan.scene?.background_color || '#0B1220';

  return <Canvas camera={{ position: camera, fov: 42, near: 0.1, far: 300 }} dpr={[1, 1.7]} shadows>
    <color attach="background" args={[background]} />
    <ambientLight intensity={1.1} />
    <directionalLight position={[7, 12, 9]} intensity={2} castShadow />
    <pointLight position={[-7, 4, -5]} intensity={0.7} color="#6689FF" />
    <gridHelper args={[Math.max(22, distance * 2.6), 28, '#42577B', '#263650']} position={[0, -1.03, 0]} />
    {arraySource && <ArrayScene array={arraySource} cells={cells} pointers={pointers} ranges={ranges} selectedIndices={selectedIndices} speed={speed} isPlaying={isPlaying} />}
    {stackMode && <StackBase count={stackItems.length} />}
    {queueMode && <QueueScene slots={queueSlots} items={queueItems} speed={speed} isPlaying={isPlaying} />}
    {stackItems.map((object, index) => <SemanticObject key={object.id} object={object} position={nodePositions.get(object.id)} speed={speed} isPlaying={isPlaying} index={index} />)}
    {drawable.map((object, index) => <SemanticObject key={object.id} object={object} position={objectPositions.get(object.id)} speed={speed} isPlaying={isPlaying} index={index} />)}
    {edges.map((edge) => {
      const endpoints = objectPositions.get(edge.id);
      return endpoints ? <EdgeVisual key={edge.id} edge={edge} from={endpoints.from} to={endpoints.to} stepIndex={stepIndex} isPlaying={isPlaying} /> : null;
    })}
    {arrays.length === 0 && stackItems.length === 0 && objects.length === 0 && <Html center><div className="scene3d-label">No visual objects in this lesson</div></Html>}
    <OrbitControls
      target={target}
      enableRotate
      enablePan
      enableZoom
      screenSpacePanning
      rotateSpeed={0.85}
      panSpeed={0.9}
      enableDamping
      dampingFactor={0.09}
      minDistance={4}
      maxDistance={Math.max(42, distance * 4)}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
    />
  </Canvas>;
}

export default function SemanticScene3D(props) {
  return <div className="semantic-3d-stage" role="img" aria-label={`Three-dimensional visual lesson, step ${props.stepIndex + 1}`}>
    <div className="semantic-3d-caption"><span>{props.plan.concept}</span><span>LEFT-DRAG ORBIT · RIGHT-DRAG PAN · WHEEL ZOOM</span></div>
    <SemanticCanvas {...props} />
  </div>;
}
