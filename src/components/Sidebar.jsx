import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Upload, ClipboardList,
  Settings, FlaskConical, Activity,
} from 'lucide-react';
import { useData } from '../context/DataContext';

const NAV_ITEMS = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload',  icon: Upload,          label: 'Upload Dataset' },
  { to: '/results', icon: ClipboardList,   label: 'Diagnostics' },
];

export default function Sidebar() {
  const { devices } = useData();
  const hasDevices = Boolean(devices?.length);
  const counts = {
    critical: devices?.filter(device => device.status === 'critical').length ?? 0,
    warning: devices?.filter(device => device.status === 'warning').length ?? 0,
    healthy: devices?.filter(device => device.status === 'healthy').length ?? 0,
  };

  return (
    <aside className="app-sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <FlaskConical size={16} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div className="sidebar-logo-text">LabDiag</div>
          <div className="sidebar-logo-sub">Fault Diagnosis</div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>

        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Icon size={15} strokeWidth={2} />
            <span style={{ flex: 1 }}>{label}</span>
          </NavLink>
        ))}

        {/* System health summary */}
        {hasDevices && <>
        <div style={{ margin: '12px 0 4px' }} className="sidebar-section-label">System Status</div>
        <div style={{
          padding: '10px 10px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {[
            { label: 'Critical', count: counts.critical, color: 'var(--danger)', dot: 'status-dot-danger' },
            { label: 'Warning',  count: counts.warning,  color: 'var(--warning)', dot: 'status-dot-warning' },
            { label: 'Healthy',  count: counts.healthy,  color: 'var(--success)', dot: 'status-dot-success' },
          ].map(({ label, count, color, dot }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span className={`status-dot ${dot}`} />
              <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color }}>{count}</span>
            </div>
          ))}
        </div>
        </>}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
        >
          <Settings size={15} strokeWidth={2} />
          <span>Settings</span>
        </NavLink>

        <div className="sidebar-phase-badge">
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <Activity size={10} color="var(--accent)" />
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{hasDevices ? 'Dataset ready' : 'Get started'}</span>
          </div>
          {hasDevices ? `${devices.length} device${devices.length === 1 ? '' : 's'} analysed.` : 'Upload a dataset to diagnose devices.'}
        </div>
      </div>
    </aside>
  );
}
