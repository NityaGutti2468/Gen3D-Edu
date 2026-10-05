import { Check } from 'lucide-react';

export default function StepList({ steps, current, onSelect }) {
  return <nav className="steps">{steps.map((step, index) => <button key={`${step.step}-${step.title}`} className={`step-item ${current === index ? 'active' : ''} ${current > index ? 'done' : ''}`} onClick={() => onSelect(index)}>
    <span className="step-index">{current > index ? <Check size={13} /> : String(index + 1).padStart(2, '0')}</span><span className="step-name">{step.title}</span>
  </button>)}</nav>;
}
