export default function MetricBar({ label, value, unit = '%', size = 'md' }) {
  const color = 'var(--accent)';

  const height = size === 'sm' ? 3 : size === 'lg' ? 7 : 5;

  return (
    <div className="metric-row">
      <div className="metric-row-header">
        <span className="metric-label">{label}</span>
        <span className="metric-value" style={{ color }}>{value}{unit}</span>
      </div>
      <div className="progress-track" style={{ height }}>
        <div
          className="progress-fill"
          style={{ width: `${Math.min(value, 100)}%`, background: color, height: '100%' }}
        />
      </div>
    </div>
  );
}
