import { useMemo } from 'react';

function buildScene(plan, stepIndex) {
  const createdLater = new Set(plan.steps.flatMap((step) => step.actions).filter((action) => action.action === 'create').map((action) => action.target));
  const states = new Map(plan.objects.map((object) => [object.id, {
    ...object,
    properties: { ...object.properties },
    visible: !createdLater.has(object.id),
    highlighted: false,
    connectedTo: new Set(),
  }]));
  const currentActions = plan.steps[stepIndex]?.actions || [];
  const arrayRanges = [];
  const selectedIndices = new Set();

  plan.steps.slice(0, stepIndex + 1).forEach((step, index) => {
    // Highlights belong to the current frame; positions and values persist.
    states.forEach((state) => { state.highlighted = false; });
    step.actions.forEach((action) => {
      const object = states.get(action.target);
      const p = action.parameters || {};
      if (object && ['create', 'show'].includes(action.action)) object.visible = true;
      if (object && ['remove', 'hide'].includes(action.action)) object.visible = false;
      if (object && action.action === 'update_value') {
        if (p.index !== undefined && object.properties.values) {
          const values = [...object.properties.values]; values[p.index] = p.value; object.properties.values = values;
        } else object.properties.value = p.value;
      }
      if (object && action.action === 'move') {
        if (p.index !== undefined) object.properties.index = p.index;
        if (p.position) object.properties.position = p.position;
      }
      if (object && action.action === 'focus' && p.index !== undefined) {
        object.properties.index = p.index;
      }
      if (action.action === 'connect' && object && p.target_id) object.connectedTo.add(p.target_id);
      if (action.action === 'disconnect' && object && p.target_id) object.connectedTo.delete(p.target_id);
      if (index === stepIndex) {
        if (object && ['highlight', 'focus', 'compare', 'connect'].includes(action.action)) object.highlighted = true;
        if (p.index !== undefined) selectedIndices.add(p.index);
        if (p.range_start !== undefined && p.range_end !== undefined) arrayRanges.push([p.range_start, p.range_end]);
      }
    });
  });
  return { objects: [...states.values()].filter((object) => object.visible), currentActions, arrayRanges, selectedIndices };
}

function arrayView(objects, ranges, selectedIndices, stepIndex) {
  const array = objects.find((object) => object.type === 'array');
  const cells = objects.filter((object) => object.type === 'array_cell');
  const values = array?.properties.values || cells.map((object) => object.properties.value ?? object.label);
  if (!values.length) return null;
  const pointers = objects.filter((object) => object.type === 'pointer');
  const leftPointer = pointers.find((pointer) => /left|low|start|begin/.test(pointer.label.toLowerCase()));
  const rightPointer = pointers.find((pointer) => /right|high|end/.test(pointer.label.toLowerCase()));
  const pointerWindow = leftPointer && rightPointer
    ? [leftPointer.properties.index ?? 0, rightPointer.properties.index ?? 0]
    : null;
  // Pointer positions are live state; range parameters can be stale in an LLM plan.
  const activeWindow = pointerWindow || ranges[ranges.length - 1];
  return <div className="array-board"><div className="array-heading"><span>{array?.label || 'Index'}{activeWindow && <em className="active-range-label">ACTIVE RANGE · {activeWindow[0]}–{activeWindow[1]}</em>}</span><span>Value</span></div><div className="array-cells" style={{ '--count': values.length }}>{values.map((value, index) => {
    const start = activeWindow ? Math.min(activeWindow[0], activeWindow[1]) : null;
    const end = activeWindow ? Math.max(activeWindow[0], activeWindow[1]) : null;
    const outside = activeWindow && (index < start || index > end);
    const withinPointerWindow = !pointerWindow || (index >= start && index <= end);
    const target = withinPointerWindow && (selectedIndices.has(index) || cells[index]?.highlighted);
    return <div key={`${index}-${value}-${target ? stepIndex : 'idle'}`} className={`array-cell ${outside ? 'dimmed' : ''} ${target ? 'highlighted' : ''}`}><span>{value}</span><small>{index}</small></div>;
  })}</div><div className="pointer-track">{pointers.map((pointer) => {
    const label = pointer.label.toLowerCase();
    const tone = /left|low|start/.test(label) ? 'green' : /right|high|end/.test(label) ? 'orange' : 'blue';
    const ix = Math.max(0, Math.min(values.length - 1, pointer.properties.index ?? 0));
    return <div key={pointer.id} className={`scene-pointer ${tone}`} style={{ left: `${((ix + .5) * 100) / values.length}%` }}><span>{pointer.label}</span><b>▲</b></div>;
  })}</div><div className="scene-caption">{array?.label || 'Array'} <span>·</span> {values.length} values</div></div>;
}

function gradientDescentView(plan, objects, stepIndex) {
  const initial = plan.objects.find((object) => object.id === 'estimate')?.properties.position;
  const current = objects.find((object) => object.id === 'estimate')?.properties.position;
  const minimum = plan.objects.find((object) => object.id === 'minimum')?.properties.position;
  if (!initial || !current || !minimum) return null;
  const loss = (x) => (x - minimum.x) ** 2;
  const xMin = Math.min(initial.x, minimum.x) - 1;
  const xMax = Math.max(initial.x, minimum.x) + 1;
  const yMax = Math.max(loss(xMin), loss(xMax), 1);
  const point = (x) => ({ x: 12 + ((x - xMin) / (xMax - xMin)) * 76, y: 77 - (loss(x) / yMax) * 60 });
  const curve = Array.from({ length: 61 }, (_, index) => point(xMin + (xMax - xMin) * index / 60));
  const history = [initial];
  plan.steps.slice(0, stepIndex + 1).forEach((step) => step.actions.forEach((action) => {
    if (action.action === 'move' && action.target === 'estimate' && action.parameters.position) history.push(action.parameters.position);
  }));
  const trail = history.map(({ x }) => point(x));
  const next = plan.steps.slice(stepIndex + 1).flatMap((step) => step.actions).find((action) => action.action === 'move' && action.target === 'estimate')?.parameters.position;
  const currentPoint = point(current.x), minimumPoint = point(minimum.x), nextPoint = next ? point(next.x) : null;
  const equation = plan.objects.find((object) => object.id === 'loss_curve')?.properties.content || 'Loss curve';
  return <div className="gradient-descent-view">
    <div className="gradient-view-heading"><div><span>OPTIMIZATION PATH</span><strong>{equation}</strong></div><div className="gradient-rate">STEP {String(stepIndex).padStart(2, '0')}</div></div>
    <svg viewBox="0 0 100 100" role="img" aria-label="Gradient descent estimate moving downhill toward the minimum">
      <defs><marker id="gradient-arrow" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" /></marker></defs>
      {[22, 40, 58, 76].map((y) => <line key={`grid-${y}`} className="descent-gridline" x1="12" y1={y} x2="89" y2={y} />)}
      <line className="descent-axis" x1="12" y1="78" x2="90" y2="78" /><line className="descent-axis" x1="12" y1="14" x2="12" y2="78" />
      <path className="descent-curve" d={curve.map((p, index) => `${index ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} />
      <line className="descent-minimum-line" x1={minimumPoint.x} y1={minimumPoint.y} x2={minimumPoint.x} y2="78" />
      {trail.length > 1 && <polyline className="descent-trail" points={trail.map((p) => `${p.x},${p.y}`).join(' ')} />}
      {trail.map((p, index) => <circle key={`trail-${index}`} className="descent-history-point" cx={p.x} cy={p.y} r="1.15" />)}
      {nextPoint && <line className="descent-update-arrow" x1={currentPoint.x} y1={currentPoint.y} x2={nextPoint.x} y2={nextPoint.y} markerEnd="url(#gradient-arrow)" />}
      <circle className="descent-minimum" cx={minimumPoint.x} cy={minimumPoint.y} r="2.3" />
      <circle className="descent-current" cx={currentPoint.x} cy={currentPoint.y} r="2.8" />
      <text className="descent-label" x="13" y="89">x · parameter</text><text className="descent-label" x={Math.min(82, minimumPoint.x + 2)} y="74">MINIMUM</text>
      <text className="descent-point-label" x={Math.min(80, currentPoint.x + 3)} y={Math.max(13, currentPoint.y - 4)}>x = {current.x.toFixed(2)}</text>
    </svg>
    <div className="gradient-view-footer"><span>● Estimate</span><span>○ Minimum</span><span>Arrow shows the next update</span></div>
  </div>;
}

function physicsChartView(values, selectedIndices, stepIndex) {
  const numbers = values.map(Number);
  if (numbers.length < 2 || numbers.some((value) => !Number.isFinite(value))) return null;
  const min = Math.min(0, ...numbers), max = Math.max(...numbers), span = max - min || 1;
  const points = numbers.map((value, index) => ({ x: 12 + index * 76 / (numbers.length - 1), y: 76 - ((value - min) / span) * 58 }));
  const active = [...selectedIndices].find((index) => index >= 0 && index < points.length);
  return <div className="physics-chart-view"><svg key={stepIndex} viewBox="0 0 100 100" role="img" aria-label="Physics values plotted as a changing curve">
    {[18, 37, 56, 76].map((y) => <line key={y} className="descent-gridline" x1="11" y1={y} x2="90" y2={y} />)}
    <line className="descent-axis" x1="11" y1="77" x2="91" y2="77" /><line className="descent-axis" x1="11" y1="14" x2="11" y2="77" />
    <polyline className="physics-curve" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
    {points.map((point, index) => <circle key={index} className={`physics-plot-point ${index === active ? 'active' : ''}`} cx={point.x} cy={point.y} r={index === active ? '2.4' : '1.5'}><title>{values[index]}</title></circle>)}
    <text className="descent-label" x="13" y="90">TIME / POSITION / VALUE</text>
  </svg></div>;
}

function projectileMotionView(plan, objects, stepIndex) {
  const metadata = plan.objects.find((object) => object.id === 'flight_path')?.properties.content?.split('|').map(Number);
  const current = objects.find((object) => object.id === 'projectile')?.properties.position;
  if (!metadata || metadata.length < 6 || metadata.some((value) => !Number.isFinite(value)) || !current) return null;
  const [speed, angle, gravity, flightTime, horizontalRange, apexHeight] = metadata;
  const position = (time) => ({ x: speed * Math.cos(angle * Math.PI / 180) * time, y: speed * Math.sin(angle * Math.PI / 180) * time - .5 * gravity * time * time });
  const mapPoint = ({ x, y }) => ({ x: 10 + x / horizontalRange * 80, y: 78 - y / apexHeight * 55 });
  const trajectory = Array.from({ length: 61 }, (_, index) => mapPoint(position(flightTime * index / 60)));
  const history = [plan.objects.find((object) => object.id === 'projectile').properties.position];
  plan.steps.slice(0, stepIndex + 1).forEach((step) => step.actions.forEach((action) => {
    if (action.action === 'move' && action.target === 'projectile' && action.parameters.position) history.push(action.parameters.position);
  }));
  const trail = history.map(mapPoint);
  const now = mapPoint(current);
  const next = plan.steps.slice(stepIndex + 1).flatMap((step) => step.actions).find((action) => action.action === 'move' && action.target === 'projectile')?.parameters.position;
  const nextPoint = next ? mapPoint(next) : null;
  const apex = mapPoint({ x: horizontalRange / 2, y: apexHeight });
  return <div className="physics-motion-view">
    <div className="physics-motion-heading"><div><span>PROJECTILE MOTION</span><strong>{speed.toFixed(1)} m/s · {angle.toFixed(1)}° launch</strong></div><span>g = {gravity.toFixed(1)} m/s²</span></div>
    <svg viewBox="0 0 100 100" role="img" aria-label="Projectile moving along a parabolic trajectory under gravity">
      <defs><marker id="projectile-arrow" markerWidth="4" markerHeight="4" refX="3.5" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" /></marker></defs>
      {[22, 40, 58, 78].map((y) => <line key={y} className="descent-gridline" x1="10" y1={y} x2="91" y2={y} />)}
      <line className="descent-axis" x1="9" y1="79" x2="92" y2="79" /><line className="descent-axis" x1="10" y1="14" x2="10" y2="80" />
      <path className="projectile-trajectory" d={trajectory.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')} />
      {trail.length > 1 && <polyline className="projectile-trail" points={trail.map((point) => `${point.x},${point.y}`).join(' ')} />}
      <line className="projectile-apex-line" x1={apex.x} y1={apex.y} x2={apex.x} y2="79" />
      <circle className="projectile-apex" cx={apex.x} cy={apex.y} r="1.8" />
      {nextPoint && <line className="projectile-direction" x1={now.x} y1={now.y} x2={nextPoint.x} y2={nextPoint.y} markerEnd="url(#projectile-arrow)" />}
      <circle className="projectile-current" cx={now.x} cy={now.y} r="2.7" />
      <text className="descent-label" x="12" y="90">HORIZONTAL DISTANCE</text><text className="physics-apex-label" x={Math.min(77, apex.x + 2)} y={Math.max(13, apex.y - 2)}>APEX</text>
      <text className="physics-coordinate-label" x={Math.min(75, now.x + 3)} y={Math.max(13, now.y - 3)}>({current.x.toFixed(1)}, {current.y.toFixed(1)}) m</text>
    </svg>
    <div className="physics-motion-footer"><span>━ Full trajectory</span><span>● Current position</span><span>Range {horizontalRange.toFixed(1)} m</span></div>
  </div>;
}

function genericView(objects, currentActions, stepIndex, plan, selectedIndices) {
  const visible = objects.filter((object) => object.type !== 'edge');
  const positioned = visible.map((object, index) => ({ object, index }));
  const nodeObjects = visible.filter((object) => ['node', 'shape'].includes(object.type));
  const edgeObjects = objects.filter((object) => object.type === 'edge');
  const hasGraph = nodeObjects.length > 1 || edgeObjects.length > 0;
  const values = objects.find((object) => object.type === 'chart')?.properties.values;
  if (values?.length) {
    const isPhysics = /physics|mechanics|kinematics|electromagnetism/i.test(plan.domain);
    if (isPhysics) {
      const lineChart = physicsChartView(values, selectedIndices, stepIndex);
      if (lineChart) return lineChart;
    }
    return <div className="chart-view" key={stepIndex}>{values.map((value, index) => {
    const number = Number(value); const height = Number.isFinite(number) ? Math.max(10, Math.min(92, Math.abs(number) * 5)) : 35 + ((index * 17) % 48);
    return <div className="chart-column" key={`${index}-${value}-${stepIndex}`} style={{ '--col-index': index }}><span className="chart-value">{value}</span><i style={{ height: `${height}%` }} /><small>{index + 1}</small></div>;
    })}</div>;
  }
  if (hasGraph) {
    const coords = new Map();
    const suppliedX = nodeObjects.map((object) => object.properties.position?.x).filter((value) => value !== undefined);
    const suppliedY = nodeObjects.map((object) => object.properties.position?.y).filter((value) => value !== undefined);
    const xMin = Math.min(...suppliedX), xMax = Math.max(...suppliedX), yMin = Math.min(...suppliedY), yMax = Math.max(...suppliedY);
    nodeObjects.forEach((object, index) => {
      const col = index % 4, row = Math.floor(index / 4);
      const left = object.properties.position?.x;
      const top = object.properties.position?.y;
      const xSpan = xMax - xMin, ySpan = yMax - yMin;
      const x = left !== undefined && xSpan > 0 ? 12 + ((left - xMin) / xSpan) * 76 : 15 + col * 23;
      const y = top !== undefined && ySpan > 0 ? 12 + ((yMax - top) / ySpan) * 52 : 19 + row * 22;
      coords.set(object.id, { x, y });
    });
    const edgeGroups = new Map();
    edgeObjects.forEach((edge) => {
      const key = [edge.properties.source_id, edge.properties.target_id].sort().join("::");
      edgeGroups.set(key, [...(edgeGroups.get(key) || []), edge]);
    });
    return <div className="graph-view"><svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="diagram-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" /></marker></defs>{edgeObjects.map((edge) => {
      const a = coords.get(edge.properties.source_id), b = coords.get(edge.properties.target_id);
      if (!a || !b) return null;
      const key = [edge.properties.source_id, edge.properties.target_id].sort().join("::");
      const peers = edgeGroups.get(key) || [edge];
      const parallelIndex = peers.findIndex((peer) => peer.id === edge.id);
      const offset = (parallelIndex - (peers.length - 1) / 2) * 10;
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2 + offset;
      const path = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
      return <g key={`${edge.id}-${edge.highlighted ? stepIndex : 'idle'}`} className={edge.highlighted ? 'active-edge' : ''}><path d={path} markerEnd="url(#diagram-arrow)" />{edge.label && <text x={midX} y={midY - 2}>{edge.label}</text>}{edge.highlighted && <circle key={stepIndex} className="packet-particle" r="1.15"><animateMotion dur="850ms" repeatCount="1" path={path} /></circle>}</g>;
    })}{[...statesFromConnections(objects)].map(([aId, bId], index) => { const a=coords.get(aId),b=coords.get(bId); return a&&b?<line key={`connection-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>:null; })}</svg>
      {nodeObjects.map((object) => { const p = coords.get(object.id); return <div key={`${object.id}-${object.highlighted ? stepIndex : 'idle'}`} className={`diagram-node ${object.highlighted ? 'highlighted' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}><strong>{object.properties.content || object.properties.value || object.label}</strong></div>; })}
      <div className="diagram-annotations">{objects.filter((object) => !['node', 'shape', 'edge', 'array', 'pointer', 'graph'].includes(object.type)).map((object) => <div key={`${object.id}-${object.highlighted ? stepIndex : 'idle'}`} className={`diagram-note ${object.highlighted ? 'highlighted' : ''}`}><b>{object.properties.content || object.properties.value || object.label}</b></div>)}</div>
    </div>;
  }
  return <div className="object-gallery">{positioned.map(({ object }) => <article key={`${object.id}-${object.highlighted ? stepIndex : 'idle'}`} className={`semantic-card type-${object.type} ${object.highlighted ? 'highlighted' : ''}`}><strong>{object.properties.content || object.properties.value || object.label}</strong>{object.properties.values?.length > 0 && <div className="mini-values">{object.properties.values.map((value, i) => <span key={`${i}-${value}`}>{value}</span>)}</div>}</article>)}</div>;
}

function stackView(objects, stepIndex) {
  const stackItems = objects.filter((object) => {
    if (!['shape', 'node', 'label'].includes(object.type)) return false;
    const label = String(object.properties.content || object.properties.value || object.label).trim();
    return label && !/(stack|top|bottom|container|push|pop|operation)/i.test(label);
  });
  return <div className="stack-view" key={stepIndex}><div className="stack-top-marker">TOP <span>↓</span></div><div className="stack-container">{stackItems.length ? stackItems.slice().reverse().map((item) => <div className={`stack-item ${item.highlighted ? 'highlighted' : ''}`} key={`${item.id}-${item.highlighted ? stepIndex : 'idle'}`}>{item.properties.content || item.properties.value || item.label}</div>) : <div className="stack-empty">EMPTY</div>}</div><div className="stack-bottom-marker">BOTTOM</div></div>;
}

function refractionView(plan, stepIndex) {
  const showIncident = stepIndex >= 2;
  const showRefracted = stepIndex >= 3;
  const surface = plan.objects.find((object) => object.id === 'surface');
  const [mediumA = 'Air', indexA = '1.00', mediumB = 'Water', indexB = '1.33'] = String(surface?.properties.content || '').split('|');
  const incidentAngle = Number(plan.objects.find((object) => object.id === 'incident')?.properties.content) || 45;
  const refractedValue = plan.objects.find((object) => object.id === 'refracted')?.properties.content || '28.0';
  const isTotalReflection = refractedValue === 'TIR';
  const refractedAngle = isTotalReflection ? incidentAngle : Number(refractedValue) || 28;
  const rayLength = 36;
  const incidentX = 50 - rayLength * Math.sin(incidentAngle * Math.PI / 180);
  const incidentY = 50 - rayLength * Math.cos(incidentAngle * Math.PI / 180);
  const outgoingX = 50 + rayLength * Math.sin(refractedAngle * Math.PI / 180);
  const outgoingY = isTotalReflection
    ? 50 - rayLength * Math.cos(refractedAngle * Math.PI / 180)
    : 50 + rayLength * Math.cos(refractedAngle * Math.PI / 180);
  return <div className="refraction-view"><svg key={stepIndex} viewBox="0 0 100 100" role="img" aria-label="Light ray bending from air into water">
    <defs><marker id="ray-arrow" markerWidth="4" markerHeight="4" refX="3.3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" /></marker></defs>
    <rect className="medium-air" x="0" y="0" width="100" height="50" /><rect className="medium-water" x="0" y="50" width="100" height="50" />
    <text className="medium-label" x="8" y="12">{mediumA.toUpperCase()} · n = {Number(indexA).toFixed(2)}</text><text className="medium-label" x="8" y="91">{mediumB.toUpperCase()} · n = {Number(indexB).toFixed(2)}</text>
    <line className="boundary-line" x1="8" y1="50" x2="92" y2="50" /><line className="normal-line" x1="50" y1="17" x2="50" y2="84" />
    <text className="normal-label" x="52" y="24">NORMAL</text><circle className="boundary-point" cx="50" cy="50" r="1.6" />
    {showIncident && <g className="ray-group"><path className="incident-ray" d={`M ${incidentX} ${incidentY} L 50 50`} pathLength="1" markerEnd="url(#ray-arrow)" /><text className="angle-label" x="35" y="42">θᵢ = {incidentAngle.toFixed(1)}°</text></g>}
    {showRefracted && <g className="ray-group"><path className="refracted-ray" d={`M 50 50 L ${outgoingX} ${outgoingY}`} pathLength="1" markerEnd="url(#ray-arrow)" /><text className="angle-label" x="54" y={isTotalReflection ? '33' : '68'}>{isTotalReflection ? 'TOTAL INTERNAL REFLECTION' : `θᵣ = ${refractedAngle.toFixed(1)}°`}</text></g>}
  </svg></div>;
}

function statesFromConnections(objects) {
  const links = [];
  objects.forEach((object) => (object.connectedTo || []).forEach((id) => links.push([object.id, id])));
  return links;
}

export default function PlanScene({ plan, stepIndex }) {
  const scene = useMemo(() => buildScene(plan, stepIndex), [plan, stepIndex]);
  const array = arrayView(scene.objects, scene.arrayRanges, scene.selectedIndices, stepIndex);
  const concept = plan.concept.toLowerCase();
  const specialView = concept.includes('projectile motion')
    ? projectileMotionView(plan, scene.objects, stepIndex)
    : concept.includes('gradient descent')
    ? gradientDescentView(plan, scene.objects, stepIndex)
    : concept.includes('refraction') || concept.includes('refract')
      ? refractionView(plan, stepIndex)
      : concept.includes('stack') ? stackView(scene.objects, stepIndex) : null;
  return <div className="scene-content"><div className="scene-callout callout-left">{scene.objects.length} PLAN OBJECT{scene.objects.length === 1 ? '' : 'S'}</div><div className="scene-callout callout-right">{plan.domain}</div><div className="generic-board">{specialView || array || genericView(scene.objects, scene.currentActions, stepIndex, plan, scene.selectedIndices)}</div></div>;
}
