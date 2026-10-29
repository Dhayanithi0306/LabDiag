import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, ChevronRight, ClipboardList, Cpu, HardDrive, Wifi, MemoryStick,
  SlidersHorizontal, ArrowUpDown, Upload,
  ChevronLeft, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import Layout from '../components/Layout';
import StatusBadge, { SeverityBadge } from '../components/StatusBadge';
import MetricBar from '../components/MetricBar';
import { useData } from '../context/DataContext';

const PAGE_SIZE = 50;
const EMPTY_DEVICES = [];


/* ── Fault type icon ─────────────────────────────────────────────── */
function FaultTypeIcon({ type }) {
  const lc = (type || '').toLowerCase();
  if (lc.includes('cpu'))                            return <Cpu size={12} color="var(--danger)" strokeWidth={2} />;
  if (lc.includes('disk'))                           return <HardDrive size={12} color="var(--warning)" strokeWidth={2} />;
  if (lc.includes('network'))                        return <Wifi size={12} color="var(--danger)" strokeWidth={2} />;
  if (lc.includes('memory') || lc.includes('ram'))  return <MemoryStick size={12} color="var(--warning)" strokeWidth={2} />;
  return null;
}

/* ── Status dot for rows ────────────────────────────────────────── */
function RowStatus({ status }) {
  const cls = status === 'critical' ? 'status-dot-danger' :
              status === 'warning'  ? 'status-dot-warning' :
              'status-dot-success';
  return <span className={`status-dot ${cls}`} />;
}

/* ── Device Table Row ────────────────────────────────────────────── */
function DeviceRow({ pc, onClick }) {
  const topFault = pc.faults[0];

  return (
    <tr onClick={onClick}>
      {/* Device */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RowStatus status={pc.status} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.845rem', lineHeight: 1.2 }}>
              {pc.id}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {pc.hostname}
            </div>
          </div>
        </div>
      </td>

      {/* Status */}
      <td><StatusBadge status={pc.status} /></td>

      {/* Primary Fault */}
      <td>
        {topFault ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <FaultTypeIcon type={topFault.type} />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                {topFault.type}
              </span>
              {pc.faults.length > 1 && (
                <span className="badge badge-muted" style={{ fontSize: '0.62rem' }}>
                  +{pc.faults.length - 1}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
              {topFault.description.length > 65
                ? topFault.description.slice(0, 65) + '…'
                : topFault.description}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No faults detected</span>
        )}
      </td>

      {/* Severity */}
      <td>
        {topFault
          ? <SeverityBadge severity={topFault.severity} />
          : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
        }
      </td>

      {/* Metrics */}
      <td style={{ minWidth: 150 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <MetricBar label="CPU"  value={pc.cpu}  size="sm" />
          <MetricBar label="RAM"  value={pc.ram}  size="sm" />
          <MetricBar label="Disk" value={pc.disk} size="sm" />
        </div>
      </td>

      {/* OS */}
      <td>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{pc.os}</span>
      </td>

      {/* Network */}
      <td><StatusBadge status={pc.network} /></td>

      {/* Location */}
      <td>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pc.location}</span>
      </td>

      {/* Action */}
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {new Date(pc.analysedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <ChevronRight size={13} color="var(--text-muted)" />
        </div>
      </td>
    </tr>
  );
}

const STATUS_FILTERS = ['all', 'critical', 'warning', 'healthy'];

/* ── Count badge for tabs ───────────────────────────────────────── */
function TabCount({ status, count }) {
  const cls = status === 'critical' ? 'badge-danger' :
              status === 'warning'  ? 'badge-warning' :
              status === 'healthy'  ? 'badge-success' :
              'badge-muted';
  return <span className={`badge ${cls}`} style={{ fontSize: '0.62rem', padding: '1px 5px' }}>{count}</span>;
}

/* ── Pagination controls ─────────────────────────────────────────── */
function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const left  = Math.max(1, page - delta);
  const right = Math.min(totalPages, page + delta);

  if (left > 1)           { pages.push(1); if (left > 2) pages.push('…'); }
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages) { if (right < totalPages - 1) pages.push('…'); pages.push(totalPages); }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      justifyContent: 'center', marginTop: 16, flexWrap: 'wrap',
    }}>
      <button className="btn btn-ghost btn-sm" onClick={() => onPage(1)} disabled={page === 1} style={{ padding: '4px 8px' }}>
        <ChevronsLeft size={14} />
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => onPage(page - 1)} disabled={page === 1} style={{ padding: '4px 8px' }}>
        <ChevronLeft size={14} />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ padding: '4px 6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>…</span>
        ) : (
          <button
            key={p}
            className={`btn btn-sm${page === p ? ' btn-primary' : ' btn-ghost'}`}
            onClick={() => onPage(p)}
            style={{ padding: '4px 10px', minWidth: 32 }}
          >
            {p}
          </button>
        )
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => onPage(page + 1)} disabled={page === totalPages} style={{ padding: '4px 8px' }}>
        <ChevronRight size={14} />
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => onPage(totalPages)} disabled={page === totalPages} style={{ padding: '4px 8px' }}>
        <ChevronsRight size={14} />
      </button>
    </div>
  );
}

/* ── Results Page ────────────────────────────────────────────────── */
export default function ResultsPage() {
  const navigate = useNavigate();
  const { devices, fileInfo } = useData();
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('all');
  const [page,    setPage]    = useState(1);

  const allDevices = devices ?? EMPTY_DEVICES;

  const counts = useMemo(() => ({
    all:      allDevices.length,
    critical: allDevices.filter(c => c.status === 'critical').length,
    warning:  allDevices.filter(c => c.status === 'warning').length,
    healthy:  allDevices.filter(c => c.status === 'healthy').length,
  }), [allDevices]);

  const filtered = useMemo(() => allDevices.filter(pc => {
    const matchStatus = status === 'all' || pc.status === status;
    const q = search.toLowerCase().trim();
    const matchSearch = !q
      || pc.id.toLowerCase().includes(q)
      || (pc.hostname || '').toLowerCase().includes(q)
      || (pc.os || '').toLowerCase().includes(q)
      || (pc.location || '').toLowerCase().includes(q)
      || pc.faults.some(f => f.type.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  }), [allDevices, status, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleStatus = (s) => { setStatus(s); setPage(1); };
  const handleSearch = (q) => { setSearch(q);  setPage(1); };

  if (!allDevices.length) {
    return (
      <Layout title="Diagnostics" subtitle="Review device health and detected faults">
        <div className="card empty-state dashboard-empty-state">
          <ClipboardList size={30} className="empty-state-icon" />
          <div className="empty-state-title">No diagnostic results yet</div>
          <div className="empty-state-sub">Upload a dataset to analyse devices and review any detected faults.</div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/upload')}>
            <Upload size={13} /> Upload dataset
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="Diagnostic Results"
      subtitle={`${allDevices.length} device${allDevices.length !== 1 ? 's' : ''} analysed${fileInfo ? ` · ${fileInfo.name}` : ''} · Click a row to view details`}
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Status tabs */}
        <div className="filter-tabs">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`filter-tab${status === s ? ' active' : ''}`}
              onClick={() => handleStatus(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              <TabCount status={s} count={counts[s]} />
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="search-bar" style={{ flex: 1, maxWidth: 300 }}>
          <Search size={13} color="var(--text-muted)" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search device, fault, OS, location…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            id="results-search"
          />
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <SlidersHorizontal size={12} />
          {filtered.length} of {allDevices.length} shown
          {totalPages > 1 && (
            <span style={{ marginLeft: 4, opacity: 0.7 }}>· page {page}/{totalPages}</span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Search size={32} className="empty-state-icon" />
            <div className="empty-state-title">No devices match your filters</div>
            <div className="empty-state-sub">Try adjusting the status filter or clearing the search.</div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setStatus('all'); }}>
              Clear filters
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 20 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Device <ArrowUpDown size={10} />
                    </span>
                  </th>
                  <th>Status</th>
                  <th>Primary Fault</th>
                  <th>Severity</th>
                  <th>Resource Usage</th>
                  <th>OS</th>
                  <th>Network</th>
                  <th>Location</th>
                  <th>Analysed</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map(pc => (
                  <DeviceRow
                    key={pc.id}
                    pc={pc}
                    onClick={() => navigate(`/device/${pc.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />

      {/* Table footer */}
      {filtered.length > 0 && (
        <div style={{
          marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} device{filtered.length !== 1 ? 's' : ''}
          </span>
          <span>Click any row to view full diagnostic details and repair guidance</span>
        </div>
      )}
    </Layout>
  );
}
