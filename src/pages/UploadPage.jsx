import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Upload, FileText, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Info, ArrowRight, Loader,
  BarChart3, Shield, Zap, Database, FileCheck, Cpu,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import { diagnose } from '../engine/diagnose';

/* ═══════════════════════════════════════════════════════════════════
   Constants
═══════════════════════════════════════════════════════════════════ */
const SUPPORTED = ['.csv', '.json', '.xlsx', '.xls'];
const MAX_MB    = 50;
const MAX_ROWS  = 500_000;

const EXT_ICONS = {
  '.csv':  { Icon: FileText,        color: 'var(--success)', bg: 'var(--success-soft)', border: 'var(--success-border)' },
  '.json': { Icon: FileText,        color: 'var(--info)',    bg: 'var(--info-soft)',    border: 'var(--info-border)'    },
  '.xlsx': { Icon: FileSpreadsheet, color: 'var(--accent)',  bg: 'var(--accent-soft)',  border: 'var(--accent-border)'  },
  '.xls':  { Icon: FileSpreadsheet, color: 'var(--accent)',  bg: 'var(--accent-soft)',  border: 'var(--accent-border)'  },
};

const FORMAT_BADGE = {
  '.csv':  'badge-success',
  '.json': 'badge-info',
  '.xlsx': 'badge-accent',
  '.xls':  'badge-accent',
};

/* ═══════════════════════════════════════════════════════════════════
   Helpers
═══════════════════════════════════════════════════════════════════ */
function fmtSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024)     return `${bytes} B`;
  if (bytes < 1048576)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getExt(name) {
  return '.' + name.split('.').pop().toLowerCase();
}

/* ── Detect which diagnostic columns are present ──────────────────
   Returns a capabilities array (same shape as mock) */
const FIELD_HINTS = {
  'CPU Detection':     ['cpu', 'cpu_usage', 'cpu_pct', 'processor', 'cpu_percent', 'cpu_usage_pct'],
  'RAM Detection':     ['ram', 'memory', 'ram_usage', 'mem_pct', 'memory_pct', 'ram_pct', 'ram_usage_pct'],
  'Disk Detection':    ['disk', 'disk_usage', 'storage', 'disk_pct', 'disk_usage_pct', 'disk_health'],
  'Network Detection': ['network', 'net', 'network_status', 'interface', 'ping', 'latency'],
  'Fault Type':        ['fault_type', 'fault', 'error_type', 'issue_type'],
  'Fix / Resolution':  ['fix_applied', 'fix', 'resolution', 'remedy', 'action_taken'],
  'Log Analysis':      ['log', 'logs', 'event', 'event_log', 'syslog', 'message', 'error_message', 'log_level'],
  'Device Identity':   ['hostname', 'device', 'device_id', 'system_id', 'computer', 'machine', 'ip', 'row_id'],
  'Location / Lab':    ['lab_id', 'location', 'room', 'lab', 'site', 'building'],
  'Component':         ['component', 'subsystem', 'module'],
  'Timestamp':         ['timestamp', 'time', 'datetime', 'date', 'collected_at'],
};

function detectCapabilities(columns) {
  const lc = columns.map(c => c.toLowerCase().trim());
  return Object.entries(FIELD_HINTS).map(([name, hints]) => {
    const available = hints.some(h => lc.some(col => col.includes(h)));
    return {
      name,
      available,
      note: available ? 'Matching column detected' : 'No matching column found',
    };
  });
}

/* ── Validate rows (basic) ────────────────────────────────────────
   Returns { valid, invalid, errors, warnings } */
function validateRows(rows, columns) {
  const errors   = [];
  const warnings = [];
  let invalid = 0;

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based, account for header
    const vals   = Object.values(row);

    // Completely empty row
    if (vals.every(v => v === '' || v === null || v === undefined)) {
      errors.push({ row: rowNum, issue: 'Row is completely empty' });
      invalid++;
      return;
    }

    // Check numeric metric columns
    ['cpu', 'ram', 'disk'].forEach(key => {
      const col = columns.find(c => c.toLowerCase().includes(key));
      if (!col) return;
      const val = parseFloat(row[col]);
      if (isNaN(val)) {
        warnings.push({ row: rowNum, column: col, issue: `Non-numeric value "${row[col]}"` });
      } else if (val < 0 || val > 100) {
        warnings.push({ row: rowNum, column: col, issue: `Value ${val} is out of range [0–100]` });
      }
    });
  });

  return {
    valid:    rows.length - invalid,
    invalid,
    errors:   errors.slice(0, 5),    // show at most 5
    warnings: warnings.slice(0, 8),  // show at most 8
  };
}

/* ── Parse file → { columns, rows, sheetName? } ──────────────────*/
async function parseFile(file, ext) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    if (ext === '.json') {
      reader.onload = (e) => {
        try {
          let data = JSON.parse(e.target.result);
          if (!Array.isArray(data)) {
            // Unwrap common wrappers { data: [...] } or { rows: [...] }
            data = data.data || data.rows || data.records || Object.values(data)[0];
          }
          if (!Array.isArray(data) || data.length === 0) {
            return reject(new Error('JSON must contain a non-empty array of objects.'));
          }
          const columns = Object.keys(data[0]);
          resolve({ columns, rows: data.slice(0, MAX_ROWS) });
        } catch {
          reject(new Error('Invalid JSON — file could not be parsed.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    } else if (ext === '.csv') {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'string' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (data.length === 0) return reject(new Error('CSV file is empty or has no data rows.'));
          resolve({ columns: Object.keys(data[0]), rows: data.slice(0, MAX_ROWS) });
        } catch {
          reject(new Error('Invalid CSV — file could not be parsed.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    } else {
      // .xlsx / .xls — read as ArrayBuffer
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (data.length === 0) return reject(new Error('Spreadsheet appears to be empty.'));
          resolve({ columns: Object.keys(data[0]), rows: data.slice(0, MAX_ROWS), sheetName });
        } catch {
          reject(new Error('Invalid Excel file — could not be read. Ensure the file is not password-protected.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   Sub-components
═══════════════════════════════════════════════════════════════════ */

/* ── Step Indicator ─────────────────────────────────────────────── */
const STEPS = ['Select File', 'Parse & Validate', 'Review', 'Analyse'];
function StepIndicator({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.72rem', fontWeight: 700,
                background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-elevated)',
                color:      done ? '#fff'           : active ? '#fff'          : 'var(--text-muted)',
                border: `2px solid ${done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'all 0.2s',
              }}>
                {done ? <CheckCircle2 size={13} /> : i + 1}
              </div>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: active ? 600 : 400,
                color: done || active ? 'var(--text-primary)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 1, margin: '-16px 6px 0',
                background: done ? 'var(--success)' : 'var(--border)',
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Capability Item ────────────────────────────────────────────── */
function CapItem({ cap }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 12px',
      background: cap.available ? 'rgba(16,185,129,0.06)' : 'var(--bg-elevated)',
      border: `1px solid ${cap.available ? 'var(--success-border)' : 'var(--border)'}`,
      borderRadius: 'var(--r-md)',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        background: cap.available ? 'var(--success-soft)' : 'var(--bg-card)',
        border: `1px solid ${cap.available ? 'var(--success-border)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        {cap.available
          ? <CheckCircle2 size={11} color="var(--success)" strokeWidth={2.5} />
          : <XCircle     size={11} color="var(--text-muted)" strokeWidth={2.5} />}
      </div>
      <div>
        <div style={{
          fontSize: '0.8rem', fontWeight: 600,
          color: cap.available ? 'var(--text-primary)' : 'var(--text-muted)',
        }}>
          {cap.name}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {cap.note}
        </div>
      </div>
    </div>
  );
}

/* ── Issue Row ──────────────────────────────────────────────────── */
function IssueRow({ issue, type }) {
  const isErr = type === 'error';
  return (
    <div style={{
      display: 'flex', gap: 9, padding: '7px 11px',
      background: isErr ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
      border: `1px solid ${isErr ? 'var(--danger-border)' : 'var(--warning-border)'}`,
      borderRadius: 'var(--r-sm)', fontSize: '0.78rem',
    }}>
      {isErr
        ? <XCircle size={12} color="var(--danger)" style={{ marginTop: 1, flexShrink: 0 }} />
        : <AlertTriangle size={12} color="var(--warning)" style={{ marginTop: 1, flexShrink: 0 }} />}
      <span style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
        {issue.row    && <strong style={{ color: isErr ? 'var(--danger)' : 'var(--warning)' }}>Row {issue.row} </strong>}
        {issue.column && <><em style={{ color: 'var(--text-muted)' }}>{issue.column}</em> — </>}
        {issue.issue}
      </span>
    </div>
  );
}

/* ── Sample Table ───────────────────────────────────────────────── */
function SampleTable({ rows, columns }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows.slice(0, 20) : rows.slice(0, 4);
  const cols  = columns.slice(0, 8);

  return (
    <div>
      <div style={{ overflowX: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
        <table className="table-base" style={{ fontSize: '0.73rem', minWidth: 500 }}>
          <thead>
            <tr>{cols.map(c => <th key={c} title={c}>{c.length > 16 ? c.slice(0, 16) + '…' : c}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                {cols.map(c => (
                  <td key={c} className="mono" style={{ color: 'var(--text-primary)' }}>
                    {String(row[c] ?? '—').slice(0, 30)}
                    {String(row[c] ?? '').length > 30 ? '…' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 4 && (
        <button
          className="btn btn-ghost btn-xs"
          style={{ marginTop: 8 }}
          onClick={() => setExpanded(e => !e)}
        >
          {expanded
            ? <><ChevronUp size={11} /> Show fewer rows</>
            : <><ChevronDown size={11} /> Show more rows (up to 20 of {rows.length.toLocaleString()})</>}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Upload Page
═══════════════════════════════════════════════════════════════════ */
export default function UploadPage() {
  const navigate  = useNavigate();
  const inputRef  = useRef(null);
  const { setDevices, setSummary, setFileInfo: setCtxFileInfo } = useData();
  const [diagStats, setDiagStats] = useState(null); // { deviceCount, critical, warning, healthy, faultCount }

  const [dragOver,   setDragOver]   = useState(false);
  const [stage,      setStage]      = useState('idle');
  // idle | selected | parsing | parsed | error
  const [fileInfo,   setFileInfo]   = useState(null);   // { name, size, ext }
  const [progress,   setProgress]   = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('');
  const [parseError, setParseError] = useState('');

  // Real parsed data
  const [parsedColumns, setParsedColumns] = useState([]);
  const [parsedRows,    setParsedRows]    = useState([]);
  const [sheetName,     setSheetName]     = useState(null);
  const [validation,    setValidation]    = useState(null);
  const [capabilities,  setCapabilities]  = useState([]);

  /* ── File validation ────────────────────────────────────────────── */
  const handleFile = useCallback((f) => {
    if (!f) return;
    const ext = getExt(f.name);
    if (!SUPPORTED.includes(ext)) {
      setFileInfo({ name: f.name, size: f.size, ext });
      setParseError(`Unsupported format "${ext}". Please upload a CSV, JSON, XLSX, or XLS file.`);
      setStage('error');
      return;
    }
    if (f.size > MAX_MB * 1048576) {
      setFileInfo({ name: f.name, size: f.size, ext });
      setParseError(`File too large (${fmtSize(f.size)}). Maximum allowed size is ${MAX_MB} MB.`);
      setStage('error');
      return;
    }
    setFileInfo({ name: f.name, size: f.size, ext, raw: f });
    setParseError('');
    setStage('selected');
  }, []);

  const handleDrop      = useCallback((e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }, [handleFile]);
  const handleDragOver  = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  /* ── Parse + validate + diagnose ────────────────────────────────── */
  const startParsing = async () => {
    setStage('parsing');
    setProgress(0);
    const phases = [
      [15,  'Reading file…'],
      [35,  'Parsing structure…'],
      [55,  'Validating records…'],
      [70,  'Detecting capabilities…'],
      [88,  'Running fault diagnosis…'],
      [100, 'Analysis complete'],
    ];
    let pi = 0;
    const tick = () => {
      if (pi >= phases.length) return;
      setProgress(phases[pi][0]);
      setPhaseLabel(phases[pi][1]);
      pi++;
    };
    tick();
    const iv = setInterval(tick, 350);
    try {
      const { columns, rows, sheetName: sn } = await parseFile(fileInfo.raw, fileInfo.ext);
      setParsedColumns(columns);
      setParsedRows(rows);
      if (sn) setSheetName(sn);
      const val = validateRows(rows, columns);
      setValidation({ ...val, warningList: val.warnings, warnings: val.warnings.length });
      setCapabilities(detectCapabilities(columns));
      // ── Run the diagnosis engine ──
      const info = { name: fileInfo.name, ext: fileInfo.ext, size: fileInfo.size };
      const { devices, summary } = diagnose(rows, columns, info);
      setDevices(devices);
      setSummary(summary);
      setCtxFileInfo({ ...info, rowCount: rows.length, columns, sheetName: sn });
      setDiagStats({
        deviceCount: devices.length,
        critical:    summary.critical,
        warning:     summary.warning,
        healthy:     summary.healthy,
        faultCount:  devices.reduce((a, d) => a + d.faults.length, 0),
      });
      clearInterval(iv);
      setProgress(100);
      setPhaseLabel('Analysis complete');
      setTimeout(() => setStage('parsed'), 200);
    } catch (err) {
      clearInterval(iv);
      setParseError(String(err.message || err));
      setStage('error');
    }
  };

  const reset = () => {
    setStage('idle'); setFileInfo(null); setProgress(0);
    setParseError(''); setParsedColumns([]); setParsedRows([]);
    setSheetName(null); setValidation(null); setCapabilities([]);
    setDiagStats(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  /* ── Step index ─────────────────────────────────────────────────── */
  const stepIdx = stage === 'parsed' ? 2 : stage === 'parsing' ? 1 : 0;

  /* ── Icon for current file ──────────────────────────────────────── */
  const fileExt  = fileInfo?.ext ?? '.csv';
  const iconCfg  = EXT_ICONS[fileExt] ?? EXT_ICONS['.csv'];
  const FileIcon = iconCfg.Icon;

  return (
    <Layout
      title="Upload Dataset"
      subtitle="Upload a diagnostic dataset — CSV, JSON, or Excel. Data is parsed in your browser."
    >
      <StepIndicator current={stepIdx} />

      {/* ═══ DROP ZONE ═══════════════════════════════════════════════ */}
      <div
        className={`dropzone${dragOver ? ' drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{ marginBottom: 20, cursor: stage === 'idle' ? 'pointer' : 'default' }}
        onClick={() => stage === 'idle' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id="dataset-file-input"
          type="file"
          accept=".csv,.json,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0])}
        />

        {/* ── Idle ── */}
        {stage === 'idle' && (
          <div style={{ padding: '44px 32px', textAlign: 'center' }}>
            <div style={{
              width: 60, height: 60,
              background: 'var(--accent-soft)',
              border: '1.5px solid var(--accent-border)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 18px',
            }}>
              <Upload size={24} color="var(--accent)" strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Drop your dataset here
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 18 }}>
              or click to browse — supports CSV, JSON and Excel spreadsheets
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span className="badge badge-success">.CSV</span>
              <span className="badge badge-info">.JSON</span>
              <span className="badge badge-accent">.XLSX</span>
              <span className="badge badge-accent">.XLS</span>
              <span className="badge badge-muted">Max {MAX_MB} MB</span>
              <span className="badge badge-muted">Up to {(MAX_ROWS / 1000).toFixed(0)}k rows</span>
            </div>
          </div>
        )}

        {/* ── Selected / Error ── */}
        {(stage === 'selected' || stage === 'error') && fileInfo && (
          <div style={{ padding: '28px 32px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{
              width: 52, height: 52, flexShrink: 0,
              background: stage === 'error' ? 'var(--danger-soft)' : iconCfg.bg,
              border: `1.5px solid ${stage === 'error' ? 'var(--danger-border)' : iconCfg.border}`,
              borderRadius: 'var(--r-lg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileIcon size={22} color={stage === 'error' ? 'var(--danger)' : iconCfg.color} strokeWidth={1.5} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {fileInfo.name}
                </span>
                <span className={`badge ${FORMAT_BADGE[fileInfo.ext] ?? 'badge-muted'}`}>
                  {fileInfo.ext.toUpperCase().slice(1)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{fmtSize(fileInfo.size)}</div>
              {stage === 'error' && parseError && (
                <div style={{
                  marginTop: 8, padding: '6px 10px',
                  background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
                  borderRadius: 'var(--r-sm)', fontSize: '0.78rem', color: 'var(--danger)',
                  display: 'flex', gap: 6, alignItems: 'flex-start',
                }}>
                  <XCircle size={12} strokeWidth={2.5} style={{ marginTop: 1, flexShrink: 0 }} />
                  {parseError}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); reset(); }}>
                Change file
              </button>
              {stage === 'selected' && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => { e.stopPropagation(); startParsing(); }}
                >
                  <Zap size={12} /> Parse &amp; Validate
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Parsing ── */}
        {stage === 'parsing' && (
          <div style={{ padding: '36px 32px', textAlign: 'center' }}>
            <div style={{
              width: 52, height: 52,
              background: 'var(--accent-soft)',
              border: '1.5px solid var(--accent-border)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Loader size={22} color="var(--accent)" strokeWidth={1.5} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 12 }}>
              {phaseLabel || 'Processing…'}
            </div>
            <div style={{ maxWidth: 280, margin: '0 auto 8px' }}>
              <div className="progress-track" style={{ height: 5 }}>
                <div className="progress-fill" style={{ width: `${progress}%`, background: 'var(--accent)' }} />
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{progress}%</div>
          </div>
        )}
      </div>

      {/* ═══ PARSED RESULTS ═══════════════════════════════════════════ */}
      {stage === 'parsed' && validation && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Info banner */}
          <div className="notice notice-info">
            <Info size={13} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              <strong style={{ color: 'var(--accent)' }}>File parsed successfully in-browser</strong>
              {' '}— columns and rows shown below come directly from your file.
              Faults are detected using threshold analysis and explicit <code style={{ fontSize: '0.78rem', padding: '1px 4px', background: 'var(--bg-elevated)', borderRadius: 4 }}>fault_type</code> column values from your dataset.
            </span>
          </div>

          {/* File summary */}
          <div className="card">
            <div className="card-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36,
                  background: iconCfg.bg,
                  border: `1px solid ${iconCfg.border}`,
                  borderRadius: 'var(--r-md)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileCheck size={16} color={iconCfg.color} strokeWidth={2} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span className="card-header-title">{fileInfo.name}</span>
                    <span className={`badge ${FORMAT_BADGE[fileInfo.ext] ?? 'badge-muted'}`}>
                      {fileInfo.ext.toUpperCase().slice(1)}
                    </span>
                  </div>
                  <div className="card-header-sub">
                    {fmtSize(fileInfo.size)}
                    {' · '}
                    {parsedRows.length.toLocaleString()} rows
                    {' · '}
                    {parsedColumns.length} columns
                    {sheetName && <> · Sheet: <strong style={{ color: 'var(--text-secondary)' }}>{sheetName}</strong></>}
                  </div>
                </div>
              </div>
              <span className="badge badge-success">
                <CheckCircle2 size={9} strokeWidth={2.5} /> Accepted
              </span>
            </div>
            <div className="card-body">
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>
                DETECTED COLUMNS ({parsedColumns.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                {parsedColumns.map(col => {
                  const lc = col.toLowerCase();
                  const mapped = Object.values(FIELD_HINTS).flat().some(h => lc.includes(h));
                  return (
                    <span key={col} style={{
                      padding: '3px 9px', borderRadius: 'var(--r-sm)',
                      fontSize: '0.73rem', fontFamily: 'monospace',
                      background: mapped ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      border: `1px solid ${mapped ? 'var(--accent-border)' : 'var(--border)'}`,
                      color: mapped ? 'var(--accent)' : 'var(--text-secondary)',
                    }}>
                      {col}
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent)' }}>●</span> Recognised diagnostic field
                &nbsp;&nbsp;
                <span style={{ color: 'var(--border)' }}>●</span> Not mapped (will be ignored)
              </div>
            </div>
          </div>

          {/* Validation results */}
          <div className="card">
            <div className="card-header">
              <Shield size={14} color="var(--accent)" />
              <span className="card-header-title">Validation Results</span>
              <span className="card-header-sub" style={{ marginLeft: 4 }}>
                — real data from your file
              </span>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Valid Rows',   value: validation.valid,    color: 'var(--success)', bg: 'var(--success-soft)', border: 'var(--success-border)' },
                  { label: 'Invalid Rows', value: validation.invalid,  color: 'var(--danger)',  bg: 'var(--danger-soft)',  border: 'var(--danger-border)'  },
                  { label: 'Warnings',     value: validation.warnings, color: 'var(--warning)', bg: 'var(--warning-soft)', border: 'var(--warning-border)' },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '12px 14px', borderRadius: 'var(--r-md)',
                    background: s.bg, border: `1px solid ${s.border}`, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {validation.errors.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {validation.errors.length} Error{validation.errors.length !== 1 ? 's' : ''} — rows skipped
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {validation.errors.map((e, i) => <IssueRow key={i} issue={e} type="error" />)}
                  </div>
                </div>
              )}
              {validation.warningList?.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--warning)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {validation.warningList.length} Warning{validation.warningList.length !== 1 ? 's' : ''} — values flagged
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {validation.warningList.map((w, i) => <IssueRow key={i} issue={w} type="warning" />)}
                  </div>
                </div>
              )}
              {validation.errors.length === 0 && validation.warnings === 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                  background: 'var(--success-soft)', border: '1px solid var(--success-border)',
                  borderRadius: 'var(--r-md)', fontSize: '0.82rem', color: 'var(--success)',
                }}>
                  <CheckCircle2 size={14} strokeWidth={2.5} />
                  All rows passed validation — no issues detected.
                </div>
              )}
            </div>
          </div>

          {/* Diagnostic Capabilities */}
          <div className="card">
            <div className="card-header">
              <BarChart3 size={14} color="var(--accent)" />
              <span className="card-header-title">Diagnostic Capabilities</span>
              <span className="card-header-sub" style={{ marginLeft: 4 }}>
                based on your file's column names
              </span>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
                {capabilities.map((cap, i) => <CapItem key={i} cap={cap} />)}
              </div>
            </div>
          </div>

          {/* Data Preview */}
          <div className="card">
            <div className="card-header">
              <Database size={14} color="var(--accent)" />
              <span className="card-header-title">Dataset Preview</span>
              <span className="card-header-sub" style={{ marginLeft: 4 }}>
                actual data from your file
              </span>
            </div>
            <div className="card-body">
              <SampleTable rows={parsedRows} columns={parsedColumns} />
            </div>
          </div>

          {/* Diagnosis summary + actions */}
          {diagStats && (
            <div style={{
              padding: '14px 18px',
              background: diagStats.critical > 0 ? 'var(--danger-soft)' : diagStats.warning > 0 ? 'var(--warning-soft)' : 'var(--success-soft)',
              border: `1px solid ${diagStats.critical > 0 ? 'var(--danger-border)' : diagStats.warning > 0 ? 'var(--warning-border)' : 'var(--success-border)'}`,
              borderRadius: 'var(--r-lg)',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              <Cpu size={20} color={diagStats.critical > 0 ? 'var(--danger)' : diagStats.warning > 0 ? 'var(--warning)' : 'var(--success)'} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: 3 }}>
                  Diagnosis complete — {diagStats.deviceCount} device{diagStats.deviceCount !== 1 ? 's' : ''} analysed
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{diagStats.critical} critical</span>
                  <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{diagStats.warning} warning</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>{diagStats.healthy} healthy</span>
                  <span style={{ color: 'var(--text-muted)' }}>{diagStats.faultCount} fault{diagStats.faultCount !== 1 ? 's' : ''} detected</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-ghost" onClick={reset}>Upload New File</button>
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/results')}>
                  View Results <ArrowRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
