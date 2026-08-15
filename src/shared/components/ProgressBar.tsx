export function ProgressBar({ value, color = '#8f7dcc' }: { value: number; color?: string }) {
  const state = value > 100 ? 'over' : value >= 80 ? 'near' : 'normal';
  return <div className="progress-track" aria-label={`${Math.round(value)}%`}><span className={`progress-fill progress-fill--${state}`} style={{ width: `${Math.min(value, 100)}%`, background: color }} /></div>;
}
