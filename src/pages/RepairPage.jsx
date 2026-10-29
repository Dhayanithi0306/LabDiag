import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Wrench, CheckCircle2, AlertTriangle,
  ChevronRight, Info, Shield, Eye, Circle,
} from 'lucide-react';
import Layout from '../components/Layout';
import { SeverityBadge } from '../components/StatusBadge';
import { useData } from '../context/DataContext';

/* ── Repair Step ────────────────────────────────────────────────── */
function RepairStep({ step, done, onToggle }) {
  return (
    <div className={`repair-step${done ? ' done' : ''}`}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Step number */}
        <div className="repair-step-num">
          {done ? <CheckCircle2 size={14} /> : step.step}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: '0.68rem', color: 'var(--text-muted)',
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              Step {step.step}
            </span>
            <h3 style={{
              margin: 0,
              fontSize: '0.9rem', fontWeight: 700,
              color: done ? 'var(--success)' : 'var(--text-primary)',
            }}>
              {step.title}
            </h3>
          </div>

          <p style={{ margin: '0 0 11px', fontSize: '0.845rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {step.detail}
          </p>

          {/* Verification */}
          <div style={{
            padding: '8px 12px',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-border)',
            borderRadius: 'var(--r-md)',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <Eye size={12} color="var(--accent)" style={{ marginTop: 3, flexShrink: 0 }} strokeWidth={2} />
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                Verification
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{step.verify}</div>
            </div>
          </div>
        </div>

        {/* Done toggle */}
        <button
          className={done ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
          style={{
            flexShrink: 0,
            borderColor: done ? 'var(--success-border)' : undefined,
            color: done ? 'var(--success)' : undefined,
          }}
          onClick={onToggle}
          aria-label={done ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {done
            ? <><CheckCircle2 size={12} /> Done</>
            : <><Circle size={12} /> Mark done</>
          }
        </button>
      </div>
    </div>
  );
}

/* ── Repair Page ────────────────────────────────────────────────── */
export default function RepairPage() {
  const { deviceId, faultId } = useParams();
  const navigate = useNavigate();

  const { devices } = useData();
  const allDevices = devices ?? [];
  const pc    = allDevices.find(c => c.id === deviceId) ||
                allDevices.find(c => c.id === decodeURIComponent(deviceId));
  const fault = pc?.faults.find(f => f.id === faultId);

  const [completedSteps, setCompletedSteps] = useState(new Set());

  const toggleStep = (n) =>
    setCompletedSteps(prev => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });

  if (!pc || !fault) {
    return (
      <Layout title="Repair Guide Not Found">
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <Wrench size={40} className="empty-state-icon" />
          <div className="empty-state-title">No repair guide for "{deviceId}"</div>
          <div className="empty-state-sub">This fault ID does not exist in the current dataset.</div>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/results')}>
            <ArrowLeft size={13} /> Back to Results
          </button>
        </div>
      </Layout>
    );
  }

  const done    = fault.repairs.every(r => completedSteps.has(r.step));
  const progress = fault.repairs.length
    ? Math.round((completedSteps.size / fault.repairs.length) * 100)
    : 0;

  return (
    <Layout
      title="Repair Guide"
      subtitle={`${pc.id} · ${pc.hostname} · ${fault.type}`}
    >
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, fontSize: '0.8rem' }}>
        <button className="btn btn-ghost btn-xs" onClick={() => navigate(`/device/${pc.id}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <ArrowLeft size={12} /> {pc.id}
        </button>
        <ChevronRight size={13} color="var(--text-muted)" />
        <span style={{ color: 'var(--text-muted)' }}>{fault.type}</span>
      </div>

      {/* Notice */}
      <div className="notice notice-info" style={{ marginBottom: 16 }}>
        <Info size={13} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          <strong style={{ color: 'var(--accent)' }}>Repair guidance</strong>
          {' '}— follow each step in order. Check the verification note before marking a step complete.
          Automated execution requires explicit human authorization.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
        {/* ── Left: Fault + Steps ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Fault summary */}
          <div className="card">
            <div style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 'var(--r-lg)', flexShrink: 0,
                  background: fault.severity === 'critical' ? 'var(--danger-soft)' : 'var(--warning-soft)',
                  border: `1px solid ${fault.severity === 'critical' ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AlertTriangle size={20}
                    color={fault.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}
                    strokeWidth={2}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <SeverityBadge severity={fault.severity} />
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      {fault.type}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: '0.845rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {fault.description}
                  </p>
                  {/* Evidence chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {fault.evidence.map((e, i) => (
                      <span key={i} style={{
                        padding: '3px 9px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--r-sm)',
                        fontSize: '0.72rem', fontFamily: 'monospace',
                        color: 'var(--text-secondary)',
                      }}>
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Root cause */}
              <div style={{
                marginTop: 14, padding: '10px 14px',
                background: 'var(--warning-soft)',
                border: '1px solid var(--warning-border)',
                borderRadius: 'var(--r-md)',
              }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--warning)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Likely Root Cause
                </div>
                <p style={{ margin: 0, fontSize: '0.845rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {fault.rootCause}
                </p>
              </div>
            </div>
          </div>

          {/* Safety disclaimer */}
          <div className="notice notice-danger">
            <Shield size={13} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} strokeWidth={2} />
            <span>
              <strong style={{ color: 'var(--danger)' }}>Caution:</strong>
              {' '}These are recommendations, not automated actions. Review each step carefully.
              Never perform destructive actions without supervisor approval or on the wrong device.
            </span>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fault.repairs.map(step => (
              <RepairStep
                key={step.step}
                step={step}
                done={completedSteps.has(step.step)}
                onToggle={() => toggleStep(step.step)}
              />
            ))}
          </div>

          {/* Completion */}
          {done && (
            <div className="animate-fade-in" style={{
              padding: '22px 24px',
              background: 'var(--success-soft)',
              border: '1px solid var(--success-border)',
              borderRadius: 'var(--r-lg)',
              textAlign: 'center',
            }}>
              <CheckCircle2 size={32} color="var(--success)" style={{ marginBottom: 10 }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--success)', marginBottom: 6 }}>
                All steps completed
              </div>
              <p style={{ margin: 0, fontSize: '0.845rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Monitor the device for the next 15–30 minutes to confirm the fault is resolved.
                Re-run diagnostics to verify a healthy status.
              </p>
            </div>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Progress card */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-title">Repair Progress</div>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {progress}%
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {completedSteps.size} / {fault.repairs.length} steps
                </span>
              </div>
              <div className="progress-track" style={{ height: 7 }}>
                <div className="progress-fill" style={{
                  width: `${progress}%`,
                  background: done ? 'var(--success)' : 'var(--accent)',
                  height: '100%',
                }} />
              </div>
              {done && (
                <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={12} /> All steps done
                </div>
              )}
            </div>
          </div>

          {/* Device context */}
          <div className="card">
            <div className="card-header">
              <div className="card-header-title">Device Context</div>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['Device ID',    pc.id],
                  ['Hostname',     pc.hostname],
                  ['OS',           pc.os],
                  ['Location',     pc.location],
                  ['IP',           pc.ip],
                  ['Confidence',   `${fault.confidence}%`],
                  ['Method',       fault.method],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginTop: 2, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Other faults on this device */}
          {pc.faults.filter(f => f.id !== faultId).length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-header-title">Other Faults</div>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pc.faults.filter(f => f.id !== faultId).map(f => (
                  <button
                    key={f.id}
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', justifyContent: 'space-between' }}
                    onClick={() => navigate(`/repair/${pc.id}/${f.id}`)}
                  >
                    <span style={{ fontWeight: 500, fontSize: '0.8rem' }}>{f.type}</span>
                    <ChevronRight size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Back nav */}
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate(`/device/${pc.id}`)}
          >
            <ArrowLeft size={13} /> Back to Device
          </button>
        </div>
      </div>
    </Layout>
  );
}
