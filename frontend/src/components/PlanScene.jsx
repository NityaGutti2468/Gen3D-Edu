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
  const activeWindow = ranges[ranges.length - 1] || pointerWindow;
  return <div className="array-board"><div className="array-heading"><span>{array?.label || 'Index'}{activeWindow && <em className="active-range-label">ACTIVE RANGE · {activeWindow[0]}–{activeWindow[1]}</em>}</span><span>Value</span></div><div className="array-cells" style={{ '--count': values.length }}>{values.map((value, index) => {
    const bounded = activeWindow;
    const outside = bounded && (index < bounded[0] || index > bounded[1]);
    const target = selectedIndices.has(index) || cells[index]?.highlighted;
    return <div key={`${index}-${value}-${target ? stepIndex : 'idle'}`} className={`array-cell ${outside ? 'dimmed' : ''} ${target ? 'highlighted' : ''}`}><span>{value}</span><small>{index}</small></div>;
  })}</div><div className="pointer-track">{pointers.map((pointer) => {
    const label = pointer.label.toLowerCase();
    const tone = /left|low|start/.test(label) ? 'green' : /right|high|end/.test(label) ? 'orange' : 'blue';
    const ix = Math.max(0, Math.min(values.length - 1, pointer.properties.index ?? 0));
    return <div key={pointer.id} className={`scene-pointer ${tone}`} style={{ left: `${((ix + .5) * 100) / values.length}%` }}><span>{pointer.label}</span><b>▲</b></div>;
  })}</div><div className="scene-caption">{array?.label || 'Array'} <span>·</span> {values.length} values</div></div>;
}

function genericView(objects, currentActions, stepIndex) {
  const visible = objects.filter((object) => object.type !== 'edge');
  const positioned = visible.map((object, index) => ({ object, index }));
  const nodeObjects = visible.filter((object) => ['node', 'shape'].includes(object.type));
  const edgeObjects = objects.filter((object) => object.type === 'edge');
  const hasGraph = nodeObjects.length > 1 || edgeObjects.length > 0;
  const values = objects.find((object) => object.type === 'chart')?.properties.values;
  if (values?.length) return <div className="chart-view" key={stepIndex}>{values.map((value, index) => {
    const number = Number(value); const height = Number.isFinite(number) ? Math.max(10, Math.min(92, Math.abs(number) * 5)) : 35 + ((index * 17) % 48);
    return <div className="chart-column" key={`${index}-${value}-${stepIndex}`} style={{ '--col-index': index }}><span className="chart-value">{value}</span><i style={{ height: `${height}%` }} /><small>{index + 1}</small></div>;
  })}</div>;
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
    return <div className="graph-view"><svg className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="diagram-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" /></marker></defs>{edgeObjects.map((edge) => {
      const a = coords.get(edge.properties.source_id), b = coords.get(edge.properties.target_id);
      return a && b ? <g key={`${edge.id}-${edge.highlighted ? stepIndex : 'idle'}`} className={edge.highlighted ? 'active-edge' : ''}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#diagram-arrow)" />{edge.label && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 2}>{edge.label}</text>}{edge.highlighted && <circle key={stepIndex} className="packet-particle" r="1.15"><animateMotion dur="850ms" repeatCount="1" path={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} /></circle>}</g> : null;
    })}{[...statesFromConnections(objects)].map(([aId, bId], index) => { const a=coords.get(aId),b=coords.get(bId); return a&&b?<line key={`connection-${index}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>:null; })}</svg>
      {nodeObjects.map((object) => { const p = coords.get(object.id); return <div key={`${object.id}-${object.highlighted ? stepIndex : 'idle'}`} className={`diagram-node ${object.highlighted ? 'highlighted' : ''}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}><strong>{object.properties.content || object.properties.value || object.label}</strong></div>; })}
      <div className="diagram-annotations">{objects.filter((object) => !['node', 'shape', 'edge', 'array', 'pointer', 'graph'].includes(object.type)).map((object) => <div key={`${object.id}-${object.highlighted ? stepIndex : 'idle'}`} className={`diagram-note ${object.highlighted ? 'highlighted' : ''}`}><b>{object.properties.content || object.properties.value || object.label}</b></div>)}</div>
    </div>;
  }
  return <div className="object-gallery">{positioned.map(({ object }) => <article key={`${object.id}-${object.highlighted ? stepIndex : 'idle'}`} className={`semantic-card type-${object.type} ${object.highlighted ? 'highlighted' : ''}`}><strong>{object.properties.content || object.properties.value || object.label}</strong>{object.properties.values?.length > 0 && <div className="mini-values">{object.properties.values.map((value, i) => <span key={`${i}-${value}`}>{value}</span>)}</div>}</article>)}</div>;
}

function statesFromConnections(objects) {
  const links = [];
  objects.forEach((object) => (object.connectedTo || []).forEach((id) => links.push([object.id, id])));
  return links;
}

export default function PlanScene({ plan, stepIndex }) {
  const scene = useMemo(() => buildScene(plan, stepIndex), [plan, stepIndex]);
  const array = arrayView(scene.objects, scene.arrayRanges, scene.selectedIndices, stepIndex);
  return <div className="scene-content"><div className="scene-callout callout-left">{scene.objects.length} PLAN OBJECT{scene.objects.length === 1 ? '' : 'S'}</div><div className="scene-callout callout-right">{plan.domain}</div><div className="generic-board">{array || genericView(scene.objects, scene.currentActions, stepIndex)}</div></div>;
}
