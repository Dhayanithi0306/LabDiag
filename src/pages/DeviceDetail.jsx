import { useParams, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  ArrowLeft, Monitor, AlertTriangle, CheckCircle2,
  Wrench, ChevronRight, Server, MapPin, Globe,
} from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge, { SeverityBadge } from '../components/StatusBadge';
import MetricBar from '../components/MetricBar';
import { useData } from '../context/DataContext';

const chartTooltip = {
  contentStyle: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 8, fontSize: '0.78rem', padding: '8px 12px',
    boxShadow: 'var(--shadow-lg)',
  },
  labelStyle: { color: 'var(--text-secondary)', marginBottom: 4 },
};

/* ── Key-Value pair ─────────────────────────────────────────────── */
function KV({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      {Icon && <Icon size={13} color="var(--text-muted)" strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />}
      <div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        <div style={{ fontSize: '0.845rem', color: 'var(--text-primary)', fontWeight: 500, marginTop: 2 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

/* ── Log Event Row ──────────────────────────────────────────────── */
function LogEvent({ log }) {
  const levelClass =
    log.level === 'CRITICAL' || log.level === 'ERROR' ? 'log-event-critical' :
    log.level === 'WARNING' ? 'log-event-warning' : 'log-event-info';

  const badgeCls =
    log.level === 'CRITICAL' || log.level === 'ERROR' ? 'badge-danger' :
    log.level === 'WARNING' ? 'badge-warning' : 'badge-info';

  return (
    <div className={`log-event ${levelClass}`}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 5, flexWrap: 'wrap' }}>
        <span className={`badge ${badgeCls}`}>{log.level}</span>
        <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {new Date(log.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 500 }}>{log.source}</span>
      </div>
      <p className="mono" style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
        {log.message}
      </p>
    </div>
  );
}

/* ── Fault Card ─────────────────────────────────────────────────── */
function FaultCard({ fault, onRepair }) {
  return (
    <div className="fault-card">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <SeverityBadge severity={fault.severity} />
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
              {fault.type}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {fault.description}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
            {fault.confidence}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>%</span>
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>confidence</div>
        </div>
      </div>

      {/* Evidence */}
      <div style={{ marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 7 }}>Supporting Evidence</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {fault.evidence.map((e, i) => (
            <div key={i} className="fault-evidence-item">
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>›</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Root Cause */}
      <div style={{
        padding: '10px 12px', marginBottom: 12,
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid var(--warning-border)',
        borderRadius: 'var(--r-md)',
      }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Likely Root Cause
        </div>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {fault.rootCause}
        </p>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Method: {fault.method}
        </span>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => onRepair(fault.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Wrench size={12} /> View Repair Guide
          <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

/* ── Device Detail ──────────────────────────────────────────────── */
export default function DeviceDetail() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const { devices } = useData();
  const allDevices = devices ?? [];
  const pc = allDevices.find(c => c.id === id) ||
             // URL-decode fallback (device IDs may contain slashes encoded as %2F)
             allDevices.find(c => c.id === decodeURIComponent(id));

  if (!pc) {
    return (
      <Layout title="Device Not Found">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <Monitor size={40} className="empty-state-icon" />
          <div className="empty-state-title">Device "{id}" not found</div>
          <div className="empty-state-sub">This device ID does not exist in the current dataset.</div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/results')}>
            <ArrowLeft size={13} /> Back to Results
          </button>
        </div>
      </Layout>
    );
  }

  const statusColor =
    pc.status === 'critical' ? 'var(--danger)' :
    pc.status === 'warning'  ? 'var(--warning)' :
    'var(--success)';

  return (
    <Layout
      title={pc.id}
      subtitle={`${pc.hostname} · ${pc.os} · ${pc.location}`}
    >
      {/* Back breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: '0.8rem' }}>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => navigate('/results')}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowLeft size={12} /> Diagnostic Results
        </button>
        <ChevronRight size={13} color="var(--text-muted)" />
        <span style={{ color: 'var(--text-muted)' }}>{pc.id}</span>
      </div>

      {/* ── Device header card ── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Icon */}
            <div style={{
              width: 52, height: 52, borderRadius: 'var(--r-lg)',
              background: pc.status === 'critical' ? 'var(--danger-soft)' :
                          pc.status === 'warning'  ? 'var(--warning-soft)' : 'var(--success-soft)',
              border: `1px solid ${statusColor}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Monitor size={24} color={statusColor} strokeWidth={1.5} />
            </div>

            {/* Identity */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  {pc.id}
                </h2>
                <StatusBadge status={pc.status} />
                <StatusBadge status={pc.network} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '10px 24px', width: 'fit-content' }}>
                <KV icon={Server}  label="Hostname" value={pc.hostname} />
                <KV icon={Globe}   label="OS"       value={pc.os}       />
                <KV icon={Server}  label="IP"       value={pc.ip}       />
                <KV icon={MapPin}  label="Location" value={pc.location} />
              </div>
            </div>

            {/* Metrics */}
            <div style={{ width: 180, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MetricBar label="CPU"  value={pc.cpu}  size="md" />
              <MetricBar label="RAM"  value={pc.ram}  size="md" />
              {pc.diskHealth
                ? <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Disk Health: <strong style={{
                      color: pc.diskHealth === 'Good' ? 'var(--success)' :
                             pc.diskHealth === 'Warning' ? 'var(--warning)' : 'var(--danger)'
                    }}>{pc.diskHealth}</strong>
                  </div>
                : <MetricBar label="Disk" value={pc.disk} size="md" />}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14 }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Metric Chart */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-header-title">Resource Utilisation</div>
                <div className="card-header-sub">Historical metrics from uploaded dataset</div>
              </div>
            </div>
            <div style={{ padding: '12px 16px 8px' }}>
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={pc.metrics} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`gc${pc.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gr${pc.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-secondary)" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="var(--chart-secondary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gd${pc.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-tertiary)" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="var(--chart-tertiary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval={3} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip {...chartTooltip} />
                  <Legend
                    wrapperStyle={{ fontSize: '0.72rem', paddingTop: 8 }}
                    formatter={(val) => <span style={{ color: 'var(--text-muted)' }}>{val}</span>}
                  />
                  <Area type="monotone" dataKey="cpu"  stroke="var(--chart-primary)" fill={`url(#gc${pc.id})`} strokeWidth={1.8} name="CPU %"  dot={false} />
                  <Area type="monotone" dataKey="ram"  stroke="var(--chart-secondary)" fill={`url(#gr${pc.id})`} strokeWidth={1.8} name="RAM %"  dot={false} />
                  <Area type="monotone" dataKey="disk" stroke="var(--chart-tertiary)" fill={`url(#gd${pc.id})`} strokeWidth={1.8} name="Disk %" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Faults */}
          <div>
            <div className="section-title">
              <AlertTriangle size={13} color="var(--warning)" />
              Detected Faults ({pc.faults.length})
            </div>

            {pc.faults.length === 0 ? (
              <div style={{
                padding: '28px',
                background: 'var(--success-soft)',
                border: '1px solid var(--success-border)',
                borderRadius: 'var(--r-lg)',
                textAlign: 'center',
              }}>
                <CheckCircle2 size={28} color="var(--success)" style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 4 }}>No faults detected</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  All resource metrics are within normal thresholds.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pc.faults.map(fault => (
                  <FaultCard
                    key={fault.id}
                    fault={fault}
                    onRepair={() => navigate(`/repair/${pc.id}/${fault.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Log events */}
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-header-title">Log Events</div>
                <div className="card-header-sub">{pc.logs.length} entries from dataset</div>
              </div>
            </div>
            <div style={{ padding: '8px 14px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              {pc.logs.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                  No log entries in dataset
                </div>
              ) : (
                pc.logs.map((log, i) => <LogEvent key={i} log={log} />)
              )}
            </div>
          </div>

          {/* Analysis info */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-title">Analysis Summary</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <KV label="Analysed At"   value={new Date(pc.analysedAt).toLocaleString('en-GB')} />
              <KV label="Last Seen"     value={new Date(pc.lastSeen).toLocaleString('en-GB')} />
              <KV label="Fault Count"   value={`${pc.faults.length} detected`} />
              <KV label="Method"        value="Rule-based threshold + fault_type analysis" />
              <KV label="IP Address"    value={pc.ip} />
              {pc.faultType  && pc.faultType  !== 'None' && <KV label="Fault Type"    value={pc.faultType} />}
              {pc.fixApplied && pc.fixApplied !== 'None' && <KV label="Fix Applied"   value={pc.fixApplied} />}
              {pc.component  && pc.component  !== 'None' && <KV label="Component"     value={pc.component} />}
              {pc.dataOrigin && <KV label="Data Origin"  value={pc.dataOrigin} />}
            </div>

            {pc.faults.length > 0 && (
              <div style={{ padding: '0 16px 16px' }}>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navigate(`/repair/${pc.id}/${pc.faults[0].id}`)}
                >
                  <Wrench size={13} /> View Repair Guide
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
