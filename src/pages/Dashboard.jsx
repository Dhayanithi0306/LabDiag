import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Monitor, CheckCircle2, AlertTriangle, XCircle,
  Upload, ArrowRight, Clock, TrendingUp,
} from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge from '../components/StatusBadge';
import { useData } from '../context/DataContext';

/* ── Tooltip for charts ─────────────────────────────────────────── */
const chartTooltipStyle = {
  contentStyle: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: '0.78rem',
    padding: '8px 12px',
    boxShadow: 'var(--shadow-lg)',
  },
  labelStyle: { color: 'var(--text-secondary)', marginBottom: 4 },
  itemStyle: { padding: '2px 0' },
};

/* ── Stat Card ─────────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color, bg, onClick }) {
  return (
    <button className="stat-card card-hover" onClick={onClick}>
      <div>
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-value">{value}</div>
        {sub && <div className="stat-card-sub">{sub}</div>}
      </div>
      <div className="stat-card-icon" style={{ background: bg }}>
        <Icon size={18} color={color} strokeWidth={2} />
      </div>
    </button>
  );
}

/* ── Activity Item ──────────────────────────────────────────────── */
function ActivityItem({ item }) {
  const dotClass =
    item.type === 'critical' ? 'status-dot-danger' :
    item.type === 'warning'  ? 'status-dot-warning' :
    'status-dot-success';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ paddingTop: 6 }}>
        <span className={`status-dot ${dotClass}`} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{item.id}</span>
          {' — '}
          <span>{item.event}</span>
        </div>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>
        {item.time}
      </div>
    </div>
  );
}

/* ── Dashboard ───────────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const { summary, devices, hasRealData } = useData();

  if (!hasRealData || !summary || !devices?.length) {
    return (
      <Layout title="Dashboard" subtitle="Lab device health and diagnostics">
        <div className="card empty-state dashboard-empty-state">
          <Upload size={30} className="empty-state-icon" />
          <div className="empty-state-title">No dataset loaded</div>
          <div className="empty-state-sub">Upload a diagnostic dataset to see device health, trends, and detected faults.</div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/upload')}>
            <Upload size={13} /> Upload dataset
          </button>
        </div>
      </Layout>
    );
  }

  const summaryData = summary;
  const allDevices = devices;

  const {
    totalDevices, healthy, warning, critical,
    lastAnalysis, datasetName, faultDistribution, recentActivity,
  } = summaryData;

  // Use the most critical device for the trend chart
  const trendDevice = allDevices.find(c => c.status === 'critical') ||
                      allDevices.find(c => c.status === 'warning')  ||
                      allDevices[0];
  const criticalTrend = trendDevice?.metrics?.slice(-12)
    .map(m => ({ time: m.label, cpu: m.cpu, ram: m.ram })) ?? [];

  const lastTs   = new Date(lastAnalysis).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const lastDate = new Date(lastAnalysis).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Layout
      title="Dashboard"
      subtitle={`Last analysis: ${lastDate} at ${lastTs} · ${datasetName}`}
    >
      {/* ── Stat Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        marginBottom: 20,
      }}>
        <StatCard
          label="Total Devices" value={totalDevices}
          sub="Registered in dataset"
          icon={Monitor} color="var(--info)" bg="var(--info-soft)"
          onClick={() => navigate('/results')}
        />
        <StatCard
          label="Healthy" value={healthy}
          sub="All metrics nominal"
          icon={CheckCircle2} color="var(--success)" bg="var(--success-soft)"
          onClick={() => navigate('/results')}
        />
        <StatCard
          label="Needs Attention" value={warning}
          sub="Approaching thresholds"
          icon={AlertTriangle} color="var(--warning)" bg="var(--warning-soft)"
          onClick={() => navigate('/results')}
        />
        <StatCard
          label="Critical" value={critical}
          sub="Immediate action required"
          icon={XCircle} color="var(--danger)" bg="var(--danger-soft)"
          onClick={() => navigate('/results')}
        />
      </div>

      {/* ── Charts Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 280px',
        gap: 14,
        marginBottom: 14,
      }}>
        {/* CPU + RAM Trend */}
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="card-header-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <TrendingUp size={14} color="var(--accent)" />
                CPU &amp; RAM Trend — LAB-PC-001
              </div>
              <div className="card-header-sub">Most critical device · last 12 hours</div>
            </div>
            <span className="badge badge-danger">Critical</span>
          </div>
          <div style={{ padding: '16px 16px 8px' }}>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={criticalTrend} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="var(--chart-primary)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="var(--chart-secondary)" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="var(--chart-secondary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltipStyle} />
                <Area type="monotone" dataKey="cpu" stroke="var(--chart-primary)" fill="url(#gCpu)" strokeWidth={1.8} name="CPU %" dot={false} />
                <Area type="monotone" dataKey="ram" stroke="var(--chart-secondary)" fill="url(#gRam)" strokeWidth={1.8} name="RAM %" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, paddingTop: 4, paddingLeft: 4 }}>
              {[{ color: 'var(--chart-primary)', label: 'CPU %' }, { color: 'var(--chart-secondary)', label: 'RAM %' }].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <div style={{ width: 20, height: 2, background: l.color, borderRadius: 1 }} />
                  {l.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fault Distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-header-title">Fault Distribution</div>
              <div className="card-header-sub">By type across all devices</div>
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie
                  data={faultDistribution}
                  dataKey="count"
                  nameKey="name"
                  cx="50%" cy="50%"
                  outerRadius={56} innerRadius={32}
                  strokeWidth={0}
                >
                  {faultDistribution.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip {...chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
              {faultDistribution.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: d.fill, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{d.name}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Recent Activity */}
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <div className="card-header-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Clock size={14} color="var(--text-muted)" />
              Recent Activity
            </div>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => navigate('/results')}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View all <ArrowRight size={11} />
            </button>
          </div>
          <div style={{ padding: '4px 20px 12px' }}>
            {recentActivity.map((item, i) => (
              <ActivityItem key={i} item={item} />
            ))}
          </div>
        </div>

        {/* Device Health Overview */}
        <div className="card">
          <div className="card-header" style={{ justifyContent: 'space-between' }}>
            <div className="card-header-title">Device Health Overview</div>
            <button
              className="btn btn-primary btn-xs"
              onClick={() => navigate('/upload')}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Upload size={11} /> Upload
            </button>
          </div>
          <div style={{ padding: '8px 12px 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {allDevices.map(pc => {
                const statusColor =
                  pc.status === 'critical' ? 'var(--danger)' :
                  pc.status === 'warning'  ? 'var(--warning)' :
                  'var(--success)';
                return (
                  <button
                    key={pc.id}
                    onClick={() => navigate(`/device/${pc.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--bg-card-hover)';
                      e.currentTarget.style.borderColor = 'var(--accent-border)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'var(--bg-elevated)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                    }}
                  >
                    <span className={`status-dot ${
                      pc.status === 'critical' ? 'status-dot-danger' :
                      pc.status === 'warning'  ? 'status-dot-warning' :
                      'status-dot-success'
                    }`} />
                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)', minWidth: 90 }}>
                      {pc.id}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flex: 1 }}>
                      {pc.hostname}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', color: statusColor, fontWeight: 700 }}>
                        CPU {pc.cpu}%
                      </span>
                      <StatusBadge status={pc.status} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
