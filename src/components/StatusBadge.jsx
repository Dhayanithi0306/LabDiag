import { CheckCircle, AlertTriangle, XCircle, WifiOff, Wifi, Minus } from 'lucide-react';

const STATUS_MAP = {
  healthy:  { label: 'Healthy',  cls: 'badge-success', Icon: CheckCircle },
  warning:  { label: 'Warning',  cls: 'badge-warning', Icon: AlertTriangle },
  critical: { label: 'Critical', cls: 'badge-danger',  Icon: XCircle },
  online:   { label: 'Online',   cls: 'badge-success', Icon: Wifi },
  offline:  { label: 'Offline',  cls: 'badge-danger',  Icon: WifiOff },
  degraded: { label: 'Degraded', cls: 'badge-warning', Icon: AlertTriangle },
  unknown:  { label: 'Unknown',  cls: 'badge-muted',   Icon: Minus },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.unknown;
  return (
    <span className={`badge ${cfg.cls}`}>
      <cfg.Icon size={9} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  return <StatusBadge status={severity} />;
}
