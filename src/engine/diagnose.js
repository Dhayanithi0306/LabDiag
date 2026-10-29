/**
 * diagnose.js — Rule-based fault diagnosis engine
 *
 * Accepts the raw parsed rows + columns from any CSV / JSON / Excel file.
 * Returns { devices, summary } in the same shape used throughout the UI.
 *
 * Fully supports the lab dataset schema:
 *   lab_id, system_id, timestamp, cpu_usage_pct, ram_usage_pct,
 *   disk_health, network_status, error_message, fault_type, fix_applied,
 *   os, log_level, component, event_id, source_loghub_dataset,
 *   data_origin, row_id
 *
 * Column mapping is fuzzy — it looks for partial matches so it works across
 * different dataset schemas without manual configuration.
 */

/* ═══════════════════════════════════════════════════════════════════
   Column mapper
═══════════════════════════════════════════════════════════════════ */

function findCol(columns, ...hints) {
  const lc = columns.map(c => c.toLowerCase().trim());
  for (const hint of hints) {
    const idx = lc.findIndex(c => c === hint || c.includes(hint));
    if (idx !== -1) return columns[idx];
  }
  return null;
}

/**
 * Map the columns in a dataset to the canonical fields we need.
 */
export function mapColumns(columns) {
  return {
    // Device identity — system_id / row_id added for lab dataset
    deviceCol:    findCol(columns, 'system_id', 'hostname', 'device_id', 'device', 'computer',
                          'machine', 'pc_name', 'pc_id', 'row_id', 'name', 'id'),

    cpuCol:       findCol(columns, 'cpu_usage_pct', 'cpu_usage', 'cpu_percent', 'cpu_pct',
                          'cpu', 'processor_usage', 'processor'),

    ramCol:       findCol(columns, 'ram_usage_pct', 'ram_usage', 'memory_usage_pct',
                          'memory_usage', 'memory_pct', 'mem_pct', 'ram_pct', 'ram', 'memory'),

    // disk_health (health string) and disk_usage_pct (numeric)
    diskCol:      findCol(columns, 'disk_usage_pct', 'disk_usage', 'disk_pct', 'storage_pct',
                          'disk', 'storage'),
    diskHealthCol: findCol(columns, 'disk_health', 'disk_status', 'hdd_health', 'ssd_health'),

    networkCol:   findCol(columns, 'network_status', 'network', 'net_status', 'connectivity',
                          'network_state', 'net'),

    osCol:        findCol(columns, 'operating_system', 'os_version', 'os', 'platform'),

    ipCol:        findCol(columns, 'ip_address', 'ipv4', 'ip', 'ip_addr'),

    // lab_id maps to location
    locationCol:  findCol(columns, 'lab_id', 'location', 'room', 'lab', 'site', 'building', 'floor'),

    timestampCol: findCol(columns, 'timestamp', 'collected_at', 'recorded_at', 'datetime',
                          'date_time', 'time', 'date'),

    processCol:   findCol(columns, 'top_process', 'process_name', 'process', 'top_proc', 'component'),

    // Log / event info
    logCol:       findCol(columns, 'error_message', 'log_message', 'message', 'log',
                          'event', 'syslog', 'event_log'),
    logLevelCol:  findCol(columns, 'log_level', 'severity', 'level', 'priority'),
    componentCol: findCol(columns, 'component', 'subsystem', 'module'),
    eventIdCol:   findCol(columns, 'event_id', 'event_code', 'error_code'),

    // Explicit fault / fix info from the dataset
    faultTypeCol: findCol(columns, 'fault_type', 'fault', 'error_type', 'issue_type', 'problem_type'),
    fixCol:       findCol(columns, 'fix_applied', 'fix', 'resolution', 'remedy', 'action_taken'),

    // Supplementary metadata
    dataOriginCol: findCol(columns, 'data_origin', 'source', 'origin'),
    sourceDatasetCol: findCol(columns, 'source_loghub_dataset', 'loghub', 'dataset_source'),
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Value parsers
═══════════════════════════════════════════════════════════════════ */

function parseNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val).replace('%', '').trim());
  return isNaN(n) ? null : n;
}

function parseNetworkStatus(val) {
  if (!val) return 'unknown';
  const s = String(val).toLowerCase().trim();
  if (['online', 'up', 'connected', 'ok', '1', 'true', 'active', 'good', 'stable'].includes(s)) return 'online';
  if (['offline', 'down', 'disconnected', '0', 'false', 'inactive', 'failed', 'none', 'no_network'].includes(s)) return 'offline';
  if (['degraded', 'slow', 'partial', 'unstable', 'intermittent', 'poor', 'weak'].includes(s)) return 'degraded';
  return 'unknown';
}

/**
 * Parse disk_health string → numeric equivalent for display (0–100 range)
 * and a health label.
 */
function parseDiskHealth(val) {
  if (!val) return { score: null, label: 'unknown', status: 'unknown' };
  const s = String(val).toLowerCase().trim();
  if (['good', 'healthy', 'ok', 'normal', 'pass', 'passed', 'excellent'].includes(s)) {
    return { score: 20, label: 'Good', status: 'healthy' };
  }
  if (['warning', 'warn', 'caution', 'degraded', 'marginal'].includes(s)) {
    return { score: 75, label: 'Warning', status: 'warning' };
  }
  if (['bad', 'critical', 'failing', 'failed', 'error', 'poor', 'dead'].includes(s)) {
    return { score: 95, label: 'Critical', status: 'critical' };
  }
  // Try to parse as number
  const n = parseFloat(s);
  if (!isNaN(n)) return { score: n, label: `${n}%`, status: n >= 90 ? 'critical' : n >= 80 ? 'warning' : 'healthy' };
  return { score: null, label: String(val), status: 'unknown' };
}

/* ═══════════════════════════════════════════════════════════════════
   Thresholds
═══════════════════════════════════════════════════════════════════ */
const THRESHOLDS = {
  cpu:  { critical: 85,  warning: 70  },
  ram:  { critical: 80,  warning: 65  },
  disk: { critical: 90,  warning: 80  },
};

function metricStatus(value, field) {
  if (value === null) return 'unknown';
  const t = THRESHOLDS[field];
  if (value >= t.critical) return 'critical';
  if (value >= t.warning)  return 'warning';
  return 'healthy';
}

/* ═══════════════════════════════════════════════════════════════════
   Repair step library
═══════════════════════════════════════════════════════════════════ */
const REPAIR_LIBRARY = {
  'CPU Overload': [
    {
      step: 1, title: 'Identify high-CPU processes',
      detail: 'Open Task Manager (Ctrl+Shift+Esc) → Processes tab → sort by CPU column descending. Identify any process consuming >30% CPU.',
      verify: 'You can see the offending process name and its CPU usage clearly.',
    },
    {
      step: 2, title: 'Restart or terminate the process',
      detail: 'Right-click the process → End Task (if it is non-critical). For services, go to Services (services.msc) → locate the service → Restart.',
      verify: 'CPU usage drops below 30% within 60–90 seconds.',
    },
    {
      step: 3, title: 'Check Event Viewer for errors',
      detail: 'Open Event Viewer → Windows Logs → Application. Filter by the last 24 hours. Look for Error or Critical entries related to the offending process.',
      verify: 'No new critical events appear in the last 15 minutes.',
    },
    {
      step: 4, title: 'Update or reinstall the application',
      detail: 'Visit the vendor\'s website and check for a newer version. Known CPU leaks are often patched. If unavailable, consider uninstalling and reinstalling.',
      verify: 'Application version is up to date. Monitor CPU for 30 minutes after update.',
    },
    {
      step: 5, title: 'Schedule maintenance window',
      detail: 'If the process is a system service that cannot be terminated, schedule a full system restart during off-hours. Enable Windows Update to apply pending patches.',
      verify: 'System restarts successfully. CPU stays below 70% for 1 hour post-restart.',
    },
  ],
  'High Memory Usage': [
    {
      step: 1, title: 'Identify memory-hungry processes',
      detail: 'Open Task Manager → Processes → sort by Memory column. Note any process consuming >500 MB unexpectedly.',
      verify: 'Top memory consumers are identified.',
    },
    {
      step: 2, title: 'Close unnecessary applications',
      detail: 'Close browser tabs, unused applications, and background software. Right-click taskbar icons and close any apps not in use.',
      verify: 'Available memory (shown in Performance tab) increases by at least 1 GB.',
    },
    {
      step: 3, title: 'Adjust virtual memory settings',
      detail: 'Control Panel → System → Advanced System Settings → Performance → Advanced → Virtual Memory. Set a custom size of 1.5× to 3× physical RAM.',
      verify: 'System no longer shows "Low Memory" warnings. Performance improves.',
    },
    {
      step: 4, title: 'Scan for memory leaks',
      detail: 'Use Windows Memory Diagnostic (mdsched.exe) — schedule a memory test on next reboot. Also run the application under a memory profiler if available.',
      verify: 'No memory errors found. Application memory usage is stable over time.',
    },
    {
      step: 5, title: 'Consider RAM upgrade',
      detail: 'If all optimisations are applied and memory still stays >80%, consider upgrading physical RAM. Check the motherboard specification for supported capacity.',
      verify: 'RAM upgrade complete or deemed unnecessary. Usage stays below 70% at peak load.',
    },
  ],
  'Disk Space Critical': [
    {
      step: 1, title: 'Identify large files and folders',
      detail: 'Open "This PC" → right-click C: drive → Properties → Disk Cleanup. Also open File Explorer and sort by size. Use WinDirStat or TreeSize Free for a visual map.',
      verify: 'You can see which directories or file types are consuming the most space.',
    },
    {
      step: 2, title: 'Delete temporary and log files',
      detail: 'Run Disk Cleanup (cleanmgr) and check all available options. Also delete: C:\\Windows\\Temp, C:\\Users\\[User]\\AppData\\Local\\Temp, old log files in C:\\ProgramData.',
      verify: 'At least 5 GB freed. Disk usage drops below 85%.',
    },
    {
      step: 3, title: 'Uninstall unused applications',
      detail: 'Settings → Apps → sort by Size. Remove applications not used in the last 3 months. Also remove old printer drivers and unused Windows features.',
      verify: 'Unnecessary applications removed. Additional space recovered.',
    },
    {
      step: 4, title: 'Move or archive large data files',
      detail: 'Identify large datasets, videos, or archives. Move them to a network share, external drive, or cloud storage (OneDrive/SharePoint). Delete originals after confirming backup.',
      verify: 'Files are accessible in new location. Local disk usage is below 80%.',
    },
    {
      step: 5, title: 'Configure log rotation',
      detail: 'If log files are growing rapidly, configure log rotation in the application settings. Set a maximum log size and retention period (e.g. 7 days).',
      verify: 'Log directory size is stable and not growing beyond the configured limit.',
    },
  ],
  'Disk Hardware Failure': [
    {
      step: 1, title: 'Run S.M.A.R.T. health check',
      detail: 'Use CrystalDiskInfo or HD Tune to read S.M.A.R.T. attributes. Look for reallocated sectors, pending sectors, or uncorrectable errors greater than 0.',
      verify: 'S.M.A.R.T. report shows drive health status. Note any failing attributes.',
    },
    {
      step: 2, title: 'Run chkdsk scan',
      detail: 'Open Command Prompt as Administrator and run: chkdsk C: /f /r — this will scan for and fix bad sectors. Schedule for next reboot if prompted.',
      verify: 'chkdsk completes without critical errors. System boots normally.',
    },
    {
      step: 3, title: 'Back up critical data immediately',
      detail: 'If S.M.A.R.T. shows critical errors, immediately back up all important files to an external drive or network location. Do not delay — drive failure can be sudden.',
      verify: 'All important data is backed up and verified on the backup medium.',
    },
    {
      step: 4, title: 'Replace the disk drive',
      detail: 'If the drive is failing, order a replacement of the same or larger capacity. For SSDs, replace with an NVMe or SATA SSD of equivalent speed class.',
      verify: 'New drive installed. OS and data restored from backup. System functioning normally.',
    },
  ],
  'Network Offline': [
    {
      step: 1, title: 'Check physical connection',
      detail: 'Verify the Ethernet cable is firmly connected at both the PC and switch/router ends. Check that the link LED on the network port is lit (amber or green).',
      verify: 'Link LED is active. If wireless, check that Wi-Fi adapter shows a connected network.',
    },
    {
      step: 2, title: 'Run network diagnostics',
      detail: 'Right-click the network icon in the system tray → Troubleshoot problems. Also open Command Prompt and run: ping 127.0.0.1, ping 192.168.1.1 (gateway), ping 8.8.8.8.',
      verify: 'Ping to gateway succeeds. If it fails, the issue is in the local network segment.',
    },
    {
      step: 3, title: 'Reset network adapter',
      detail: 'Open Device Manager → Network Adapters → right-click the adapter → Disable, wait 5 seconds, then Enable. Alternatively run in elevated CMD: netsh int ip reset && netsh winsock reset.',
      verify: 'Adapter shows "Connected" status. IP address assigned (run: ipconfig).',
    },
    {
      step: 4, title: 'Renew IP address',
      detail: 'Open Command Prompt as Administrator and run: ipconfig /release then ipconfig /renew. This forces the DHCP server to assign a fresh IP address.',
      verify: 'Device receives a valid IP address. Can ping the default gateway.',
    },
    {
      step: 5, title: 'Update network drivers',
      detail: 'Visit the PC manufacturer\'s support page (e.g. Dell, HP, Lenovo) and download the latest NIC driver. Install and restart the PC.',
      verify: 'Network driver is current. Internet connectivity restored and stable.',
    },
  ],
  'Network Degraded': [
    {
      step: 1, title: 'Check cable and hardware',
      detail: 'Replace the Ethernet cable with a known-good cable. Test with a different switch port. Check for bent pins or damaged connectors.',
      verify: 'Physical layer is confirmed good. Link speed shows 100/1000 Mbps.',
    },
    {
      step: 2, title: 'Run speed and latency test',
      detail: 'Open Command Prompt and run: ping -n 50 8.8.8.8 to check for packet loss. Also run: tracert 8.8.8.8 to identify which hop is slow.',
      verify: '0% packet loss to gateway. Average latency < 5 ms on LAN.',
    },
    {
      step: 3, title: 'Check for bandwidth saturation',
      detail: 'Open Task Manager → Performance → Ethernet/Wi-Fi and observe the Send/Receive rates. Use Resource Monitor (resmon.exe) to identify which process is consuming bandwidth.',
      verify: 'No single process using >80% of available bandwidth during normal operation.',
    },
    {
      step: 4, title: 'Update network drivers',
      detail: 'Visit device manufacturer support site and install the latest NIC driver. Also check for firmware updates for the network switch or router.',
      verify: 'Driver and firmware are current. Network speed is stable.',
    },
  ],
  'High Disk I/O': [
    {
      step: 1, title: 'Identify disk-intensive processes',
      detail: 'Open Task Manager → Performance → Open Resource Monitor → Disk tab. Sort by Total (B/sec) to find the process causing high I/O.',
      verify: 'The offending process is identified.',
    },
    {
      step: 2, title: 'Defragment or optimise the drive',
      detail: 'For HDDs: Search "Defragment and Optimize Drives" → select C: → Optimize. For SSDs: Optimise will run TRIM instead — do not manually defragment SSDs.',
      verify: 'Fragmentation reduced. Disk response times improve in Resource Monitor.',
    },
    {
      step: 3, title: 'Check for disk errors',
      detail: 'Open Command Prompt as Administrator: chkdsk C: /f /r /x — this will scan for and fix disk errors. Schedule for next reboot if prompted.',
      verify: 'chkdsk reports no errors. S.M.A.R.T. health check passes.',
    },
  ],
  'System Error': [
    {
      step: 1, title: 'Review system event logs',
      detail: 'Open Event Viewer → Windows Logs → System. Filter for Critical and Error events in the last 24 hours. Note the event ID and source.',
      verify: 'Root cause event identified in Event Viewer.',
    },
    {
      step: 2, title: 'Restart the affected service',
      detail: 'Open Services (services.msc). Find the service named in the error. Right-click → Restart. If it fails to restart, check the service dependencies.',
      verify: 'Service is running. Error no longer appears in Event Viewer.',
    },
    {
      step: 3, title: 'Apply pending updates',
      detail: 'Open Windows Update → Check for updates. Install all critical and security updates. Restart the system if required.',
      verify: 'No pending critical updates. System is fully patched.',
    },
    {
      step: 4, title: 'Run System File Checker',
      detail: 'Open Command Prompt as Administrator and run: sfc /scannow — this will scan and repair corrupted system files. Allow it to complete (may take 10–20 minutes).',
      verify: 'SFC reports "Windows Resource Protection did not find any integrity violations." or repaired files successfully.',
    },
  ],
  'Application Crash': [
    {
      step: 1, title: 'Check application event logs',
      detail: 'Open Event Viewer → Windows Logs → Application. Filter for the application name that crashed. Note the fault module and exception code.',
      verify: 'Crash details identified including faulting module name.',
    },
    {
      step: 2, title: 'Update or repair the application',
      detail: 'Go to Settings → Apps → find the application → Modify → Repair. If repair fails, uninstall and reinstall the latest version from the vendor\'s website.',
      verify: 'Application launches without crashing. No new crash events in Event Viewer.',
    },
    {
      step: 3, title: 'Check for conflicting software',
      detail: 'Boot into Safe Mode (hold Shift + Restart → Troubleshoot → Startup Settings → Safe Mode with Networking). Test if application works in Safe Mode to rule out driver/software conflicts.',
      verify: 'Application works in Safe Mode. Identify conflicting software in normal mode.',
    },
  ],
  'Authentication Failure': [
    {
      step: 1, title: 'Check account lockout status',
      detail: 'Open Active Directory Users and Computers (if on domain) or Local Users and Groups. Check if the account is locked out. Unlock and reset the password.',
      verify: 'Account is active and not locked. User can log in.',
    },
    {
      step: 2, title: 'Verify credentials',
      detail: 'Ensure the user is using the correct username format (domain\\user or user@domain.com). Check Caps Lock status. Verify the account has not expired.',
      verify: 'Login succeeds with correct credentials.',
    },
    {
      step: 3, title: 'Check Kerberos/LDAP connectivity',
      detail: 'Run: nltest /sc_verify:<domain> and klist to check Kerberos ticket status. If failing, run: nltest /sc_reset:<domain> to reset the secure channel.',
      verify: 'Secure channel to domain controller is established. Authentication succeeds.',
    },
  ],
  'Service Failure': [
    {
      step: 1, title: 'Identify the failing service',
      detail: 'Open Services (services.msc). Sort by Status. Identify services that are Stopped but should be Running. Check the service description to determine its importance.',
      verify: 'Failing service identified by name and description.',
    },
    {
      step: 2, title: 'Start the service',
      detail: 'Right-click the service → Start. If it fails to start, check the Windows Event Log for the specific error code.',
      verify: 'Service status shows "Running". Dependent services also running.',
    },
    {
      step: 3, title: 'Configure automatic recovery',
      detail: 'Right-click the service → Properties → Recovery tab. Set First failure, Second failure, and Subsequent failures to "Restart the Service". Set restart delay to 60000 ms.',
      verify: 'Service recovery options are configured. Service restarts automatically if it fails again.',
    },
    {
      step: 4, title: 'Check service dependencies',
      detail: 'In Service Properties → Dependencies tab. Ensure all dependencies are running. Start them in order if needed.',
      verify: 'All service dependencies are running. Target service starts successfully.',
    },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   Fault type → repair key mapping
   Maps explicit fault_type values from the dataset to repair library keys
═══════════════════════════════════════════════════════════════════ */
function mapFaultTypeToRepairKey(faultType) {
  if (!faultType) return 'System Error';
  const lc = String(faultType).toLowerCase().trim();

  if (lc.includes('cpu') || lc.includes('processor'))          return 'CPU Overload';
  if (lc.includes('memory') || lc.includes('ram'))             return 'High Memory Usage';
  if (lc.includes('disk') && lc.includes('space'))             return 'Disk Space Critical';
  if (lc.includes('disk') || lc.includes('hdd') || lc.includes('ssd') || lc.includes('storage')) {
    return 'Disk Hardware Failure';
  }
  if (lc.includes('network') && lc.includes('offline'))        return 'Network Offline';
  if (lc.includes('network') || lc.includes('connectivity'))   return 'Network Degraded';
  if (lc.includes('crash') || lc.includes('application'))      return 'Application Crash';
  if (lc.includes('auth') || lc.includes('login') || lc.includes('password')) return 'Authentication Failure';
  if (lc.includes('service'))                                   return 'Service Failure';
  if (lc.includes('io') || lc.includes('i/o'))                 return 'High Disk I/O';
  return 'System Error';
}

/* ═══════════════════════════════════════════════════════════════════
   Fault severity from log_level or fault_type
═══════════════════════════════════════════════════════════════════ */
function parseSeverity(logLevel, faultType) {
  const ll = String(logLevel || '').toLowerCase().trim();
  const ft = String(faultType || '').toLowerCase().trim();

  if (['critical', 'crit', 'fatal', 'emergency', 'error', 'err'].includes(ll)) return 'critical';
  if (['warning', 'warn'].includes(ll))                                          return 'warning';
  if (ll === 'info' || ll === 'debug' || ll === 'notice')                        return 'healthy';

  // Infer from fault type string
  if (ft.includes('critical') || ft.includes('crash') || ft.includes('fail')) return 'critical';
  if (ft.includes('warning') || ft.includes('degraded'))                        return 'warning';

  return 'warning'; // default to warning if fault_type is present
}

/* ═══════════════════════════════════════════════════════════════════
   Evidence generator
═══════════════════════════════════════════════════════════════════ */

function buildEvidence(field, maxVal, avgVal, threshold, rowCount) {
  const evidence = [];
  if (maxVal !== null) {
    evidence.push(`${field}_usage_pct = ${maxVal.toFixed(1)}% (threshold: ${threshold.critical}%)`);
  }
  if (avgVal !== null) {
    evidence.push(`Average ${field} over ${rowCount} reading${rowCount !== 1 ? 's' : ''}: ${avgVal.toFixed(1)}%`);
  }
  if (maxVal !== null && maxVal >= threshold.critical) {
    const readings = Math.round(rowCount * 0.4);
    evidence.push(`~${readings} reading${readings !== 1 ? 's' : ''} exceeded critical threshold in dataset`);
  }
  return evidence;
}

/* ═══════════════════════════════════════════════════════════════════
   Fault generator
═══════════════════════════════════════════════════════════════════ */

let faultIdCounter = 0;

function makeFault(type, severity, description, evidence, rootCause, repairKey, confidence, fixApplied) {
  faultIdCounter++;
  return {
    id:          `rf${faultIdCounter}`,
    type,
    severity,
    confidence:  Math.round(Math.min(99, confidence)),
    description,
    evidence,
    rootCause,
    fixApplied:  fixApplied || null,
    method:      'Rule-based + Dataset fault_type analysis',
    repairs:     REPAIR_LIBRARY[repairKey] ?? REPAIR_LIBRARY['System Error'],
  };
}

/**
 * Detect faults from explicit fault_type column in the dataset row.
 * This is the primary method for datasets that include pre-labeled faults.
 */
function detectExplicitFaults(row, colMap) {
  const faultType = colMap.faultTypeCol ? row[colMap.faultTypeCol] : null;
  if (!faultType || String(faultType).trim() === '' || String(faultType).toLowerCase() === 'none') {
    return null;
  }

  const ft        = String(faultType).trim();
  const logLevel  = colMap.logLevelCol  ? row[colMap.logLevelCol]  : null;
  const errMsg    = colMap.logCol       ? row[colMap.logCol]        : null;
  const fixApplied = colMap.fixCol      ? row[colMap.fixCol]        : null;
  const component = colMap.componentCol ? row[colMap.componentCol]  : null;
  const eventId   = colMap.eventIdCol   ? row[colMap.eventIdCol]    : null;

  const severity  = parseSeverity(logLevel, ft);
  const repairKey = mapFaultTypeToRepairKey(ft);

  const evidence = [`fault_type = "${ft}"`];
  if (logLevel)   evidence.push(`log_level = ${logLevel}`);
  if (component)  evidence.push(`component = ${component}`);
  if (eventId)    evidence.push(`event_id = ${eventId}`);
  if (errMsg)     evidence.push(`error: ${String(errMsg).slice(0, 100)}`);
  if (fixApplied && String(fixApplied).toLowerCase() !== 'none') {
    evidence.push(`fix_applied = ${fixApplied}`);
  }

  const description = errMsg
    ? String(errMsg).slice(0, 160)
    : `${ft} detected${component ? ` in ${component}` : ''}`;

  const rootCause = component
    ? `Fault in ${component} subsystem. ${ft}.`
    : `${ft} — check system logs for details.`;

  const confidence = severity === 'critical' ? 90 : 75;

  return makeFault(ft, severity, description, evidence, rootCause, repairKey, confidence, fixApplied);
}

/**
 * Detect faults from threshold-based rules (metric values).
 */
function detectThresholdFaults(stats, colMap, diskHealth) {
  const faults = [];
  const { cpu, ram, disk } = stats;

  // ── CPU ──
  if (cpu.max !== null) {
    if (cpu.max >= THRESHOLDS.cpu.critical) {
      faults.push(makeFault(
        'CPU Overload', 'critical',
        `Sustained CPU utilisation reached ${cpu.max.toFixed(1)}% — above the ${THRESHOLDS.cpu.critical}% critical threshold.`,
        buildEvidence('cpu', cpu.max, cpu.avg, THRESHOLDS.cpu, stats.rowCount),
        'Likely runaway process or service with a memory leak causing excessive CPU consumption.',
        'CPU Overload',
        85 + (cpu.max - THRESHOLDS.cpu.critical) * 0.3,
        null,
      ));
    } else if (cpu.max >= THRESHOLDS.cpu.warning) {
      faults.push(makeFault(
        'CPU Overload', 'warning',
        `CPU utilisation reached ${cpu.max.toFixed(1)}% — above the ${THRESHOLDS.cpu.warning}% warning threshold.`,
        buildEvidence('cpu', cpu.max, cpu.avg, THRESHOLDS.cpu, stats.rowCount),
        'Elevated CPU load. Could be a background task, scheduled scan, or increase in workload.',
        'CPU Overload', 70, null,
      ));
    }
  }

  // ── RAM ──
  if (ram.max !== null) {
    if (ram.max >= THRESHOLDS.ram.critical) {
      faults.push(makeFault(
        'High Memory Usage', 'critical',
        `RAM utilisation reached ${ram.max.toFixed(1)}% — exceeding the ${THRESHOLDS.ram.critical}% critical threshold.`,
        buildEvidence('ram', ram.max, ram.avg, THRESHOLDS.ram, stats.rowCount),
        'Application memory leak or insufficient physical RAM for the running workload.',
        'High Memory Usage',
        80 + (ram.max - THRESHOLDS.ram.critical) * 0.25,
        null,
      ));
    } else if (ram.max >= THRESHOLDS.ram.warning) {
      faults.push(makeFault(
        'High Memory Usage', 'warning',
        `RAM utilisation reached ${ram.max.toFixed(1)}% — approaching the ${THRESHOLDS.ram.critical}% critical threshold.`,
        buildEvidence('ram', ram.max, ram.avg, THRESHOLDS.ram, stats.rowCount),
        'Memory usage is elevated but not yet critical.',
        'High Memory Usage', 68, null,
      ));
    }
  }

  // ── Disk (numeric %) ──
  if (disk.max !== null) {
    if (disk.max >= THRESHOLDS.disk.critical) {
      faults.push(makeFault(
        'Disk Space Critical', 'critical',
        `Disk usage at ${disk.max.toFixed(1)}% — exceeding the ${THRESHOLDS.disk.critical}% critical threshold.`,
        buildEvidence('disk', disk.max, disk.avg, THRESHOLDS.disk, stats.rowCount),
        'Insufficient free disk space. Could be caused by large log files or database growth.',
        'Disk Space Critical', 88, null,
      ));
    } else if (disk.max >= THRESHOLDS.disk.warning) {
      faults.push(makeFault(
        'Disk Space Critical', 'warning',
        `Disk usage at ${disk.max.toFixed(1)}% — approaching critical levels.`,
        buildEvidence('disk', disk.max, disk.avg, THRESHOLDS.disk, stats.rowCount),
        'Disk space is running low. Plan cleanup or archival of old files.',
        'Disk Space Critical', 72, null,
      ));
    }
  }

  // ── Disk Health (string-based) ──
  if (diskHealth && diskHealth.status === 'critical') {
    faults.push(makeFault(
      'Disk Hardware Failure', 'critical',
      `Disk health status reported as "${diskHealth.label}" — immediate hardware inspection required.`,
      [`disk_health = "${diskHealth.label}"`, 'Hardware failure risk detected via S.M.A.R.T. or system health monitor'],
      'Drive may be physically failing. Risk of data loss. Back up data immediately.',
      'Disk Hardware Failure', 88, null,
    ));
  } else if (diskHealth && diskHealth.status === 'warning') {
    faults.push(makeFault(
      'Disk Hardware Failure', 'warning',
      `Disk health status reported as "${diskHealth.label}" — drive is degraded.`,
      [`disk_health = "${diskHealth.label}"`, 'Drive showing early signs of degradation'],
      'Drive is exhibiting warning signs. Plan replacement and ensure backups are current.',
      'Disk Hardware Failure', 72, null,
    ));
  }

  return faults;
}

/**
 * Combined fault detection: explicit faults take priority,
 * threshold-based faults are added as supplementary.
 */
function detectFaults(row, stats, colMap, diskHealth, networkStatus) {
  const faults = [];

  // 1. Use explicit fault_type from dataset (highest priority)
  const explicitFault = detectExplicitFaults(row, colMap);
  if (explicitFault) {
    faults.push(explicitFault);
  }

  // 2. Add threshold-based faults that aren't already covered by explicit fault
  const thresholdFaults = detectThresholdFaults(stats, colMap, diskHealth);
  for (const tf of thresholdFaults) {
    // Avoid duplicating a fault if the explicit fault already covers the same category
    const alreadyCovered = explicitFault && (
      tf.type === explicitFault.type ||
      mapFaultTypeToRepairKey(explicitFault.type) === tf.repairs?.[0]?.title
    );
    if (!alreadyCovered) {
      faults.push(tf);
    }
  }

  // 3. Network faults
  if (networkStatus === 'offline') {
    faults.push(makeFault(
      'Network Offline', 'critical',
      'Network adapter reports offline status. Device is unreachable from the network.',
      ['network_status = offline', 'No IP address assigned or network link down'],
      'Network adapter failure, disconnected cable, DHCP failure, or driver crash.',
      'Network Offline', 92, null,
    ));
  } else if (networkStatus === 'degraded') {
    faults.push(makeFault(
      'Network Degraded', 'warning',
      'Network connectivity is unstable or operating below expected performance.',
      ['network_status = degraded', 'Intermittent or low-quality connection detected'],
      'Faulty cable, driver issue, interference, or congested switch port.',
      'Network Degraded', 75, null,
    ));
  }

  return faults;
}

/* ═══════════════════════════════════════════════════════════════════
   Device status (worst of all faults)
═══════════════════════════════════════════════════════════════════ */

function overallStatus(faults, networkStatus) {
  if (faults.some(f => f.severity === 'critical')) return 'critical';
  if (faults.some(f => f.severity === 'warning'))  return 'warning';
  if (networkStatus === 'offline')                  return 'critical';
  return 'healthy';
}

/* ═══════════════════════════════════════════════════════════════════
   Metrics series (for device detail chart)
═══════════════════════════════════════════════════════════════════ */

function buildMetricsSeries(rows, colMap, maxPoints = 24) {
  const step = Math.max(1, Math.floor(rows.length / maxPoints));
  const series = [];

  for (let i = 0; i < rows.length; i += step) {
    const row = rows[i];
    const ts  = colMap.timestampCol ? row[colMap.timestampCol] : null;
    let label;
    if (ts) {
      const d = new Date(ts);
      label = isNaN(d) ? `R${i+1}` : `${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
    } else {
      label = `R${i + 1}`;
    }

    // Disk value: prefer numeric diskCol, fall back to diskHealth score
    let diskVal = parseNum(colMap.diskCol ? row[colMap.diskCol] : null);
    if (diskVal === null && colMap.diskHealthCol) {
      diskVal = parseDiskHealth(row[colMap.diskHealthCol]).score;
    }

    series.push({
      label,
      cpu:  parseNum(colMap.cpuCol  ? row[colMap.cpuCol]  : null) ?? 0,
      ram:  parseNum(colMap.ramCol  ? row[colMap.ramCol]  : null) ?? 0,
      disk: diskVal ?? 0,
    });

    if (series.length >= maxPoints) break;
  }

  return series;
}

/* ═══════════════════════════════════════════════════════════════════
   Log events
═══════════════════════════════════════════════════════════════════ */

function buildLogs(rows, colMap) {
  const logs = [];
  rows.slice(0, 50).forEach((row, i) => {
    // Try error_message first, then general log column
    const msg = (colMap.logCol ? row[colMap.logCol] : null) ||
                (colMap.faultTypeCol ? row[colMap.faultTypeCol] : null);
    if (!msg) return;
    const msgStr = String(msg).trim();
    if (!msgStr || msgStr.toLowerCase() === 'none') return;

    // Level from logLevelCol or infer from message
    let level = 'INFO';
    if (colMap.logLevelCol && row[colMap.logLevelCol]) {
      const ll = String(row[colMap.logLevelCol]).toUpperCase();
      if (['CRITICAL', 'CRIT', 'FATAL', 'EMERGENCY'].includes(ll)) level = 'CRITICAL';
      else if (['ERROR', 'ERR'].includes(ll))                        level = 'ERROR';
      else if (['WARNING', 'WARN'].includes(ll))                     level = 'WARNING';
      else level = ll;
    } else {
      const upper = msgStr.toUpperCase();
      level =
        upper.includes('CRITICAL') || upper.includes('CRIT') ? 'CRITICAL' :
        upper.includes('ERROR')    || upper.includes('ERR')  ? 'ERROR' :
        upper.includes('WARN')                               ? 'WARNING' :
        'INFO';
    }

    const ts = colMap.timestampCol ? row[colMap.timestampCol] : null;
    const src = colMap.deviceCol   ? (row[colMap.deviceCol] || 'System') :
                colMap.componentCol ? (row[colMap.componentCol] || 'System') : 'System';

    logs.push({
      ts:      ts ? new Date(ts).toISOString() : new Date(Date.now() - (rows.length - i) * 60000).toISOString(),
      level,
      source:  String(src).slice(0, 30),
      message: msgStr.slice(0, 200),
    });
  });
  return logs.slice(0, 12);
}

/* ═══════════════════════════════════════════════════════════════════
   Main diagnose function — called from UploadPage after parsing
═══════════════════════════════════════════════════════════════════ */

/**
 * @param {object[]} rows     — parsed rows from file
 * @param {string[]} columns  — column names
 * @param {object}   fileInfo — { name, ext, size }
 * @returns {{ devices: object[], summary: object }}
 */
export function diagnose(rows, columns, fileInfo) {
  // Reset counter so fault IDs are stable per diagnosis run
  faultIdCounter = 0;

  const colMap = mapColumns(columns);

  /* ── Group rows by device ──────────────────────────────────────
     If a device column exists, group rows by device ID.
     Otherwise, treat each row as a separate device.
  ─────────────────────────────────────────────────────────────── */
  let deviceGroups = {}; // deviceId -> rows[]

  if (colMap.deviceCol) {
    rows.forEach(row => {
      const deviceId = String(row[colMap.deviceCol] || 'UNKNOWN').trim();
      if (!deviceGroups[deviceId]) deviceGroups[deviceId] = [];
      deviceGroups[deviceId].push(row);
    });
  } else {
    // No device column — each row is its own device
    rows.forEach((row, i) => {
      const key = `DEVICE-${String(i + 1).padStart(4, '0')}`;
      deviceGroups[key] = [row];
    });
  }

  /* ── All devices — pagination is handled in the UI ────────────── */
  const deviceIds = Object.keys(deviceGroups);

  /* ── Build device objects ──────────────────────────────────────── */
  const devices = deviceIds.map((rawId, idx) => {
    const deviceRows = deviceGroups[rawId];
    const firstRow   = deviceRows[0];
    const lastRow    = deviceRows[deviceRows.length - 1];

    // ── Numeric stats ──
    const parseAll = (col) => col
      ? deviceRows.map(r => parseNum(r[col])).filter(v => v !== null)
      : [];

    const cpuVals  = parseAll(colMap.cpuCol);
    const ramVals  = parseAll(colMap.ramCol);
    const diskVals = parseAll(colMap.diskCol);

    const stats = (vals) => vals.length
      ? { max: Math.max(...vals), avg: vals.reduce((a, b) => a + b, 0) / vals.length, latest: vals[vals.length - 1] }
      : { max: null, avg: null, latest: null };

    const cpuStats  = stats(cpuVals);
    const ramStats  = stats(ramVals);
    const diskStats = stats(diskVals);

    // ── Disk health (string-based) ──
    const rawDiskHealth = colMap.diskHealthCol
      ? (lastRow[colMap.diskHealthCol] ?? firstRow[colMap.diskHealthCol])
      : null;
    const diskHealth = rawDiskHealth ? parseDiskHealth(rawDiskHealth) : null;

    // ── Network ──
    const rawNet = colMap.networkCol ? (lastRow[colMap.networkCol] ?? firstRow[colMap.networkCol]) : null;
    const networkStatus = parseNetworkStatus(rawNet);

    // ── Current readings (use last row's values or max) ──
    const cpuNow  = cpuStats.latest  ?? cpuStats.max  ?? 0;
    const ramNow  = ramStats.latest  ?? ramStats.max  ?? 0;
    // For disk display: prefer numeric, fall back to health score
    const diskNow = diskStats.latest ?? diskStats.max ?? diskHealth?.score ?? 0;

    // ── Metadata ──
    const osVal  = colMap.osCol       ? (firstRow[colMap.osCol] || 'Unknown OS') : 'Unknown OS';
    const ipVal  = colMap.ipCol       ? (firstRow[colMap.ipCol] || `10.0.${Math.floor(idx/254)}.${(idx % 254) + 1}`) : `192.168.1.${100 + (idx % 155)}`;
    const locVal = colMap.locationCol ? (firstRow[colMap.locationCol] || 'Lab') : `Lab ${String.fromCharCode(65 + (idx % 5))} — Row ${Math.floor(idx / 5) + 1}`;
    const tsVal  = colMap.timestampCol ? (lastRow[colMap.timestampCol] || new Date().toISOString()) : new Date().toISOString();

    // ── Faults ──
    const faults = detectFaults(
      lastRow,   // pass the last/only row for explicit fault detection
      { cpu: cpuStats, ram: ramStats, disk: diskStats, networkStatus, rowCount: deviceRows.length },
      colMap,
      diskHealth,
      networkStatus,
    );

    const status = overallStatus(faults, networkStatus);

    // ── Metric series for chart ──
    const metrics = buildMetricsSeries(deviceRows, colMap);

    // ── Logs ──
    const logs = buildLogs(deviceRows, colMap);

    // ── Extra metadata from dataset-specific columns ──
    const faultType  = colMap.faultTypeCol  ? (lastRow[colMap.faultTypeCol]  || null) : null;
    const fixApplied = colMap.fixCol        ? (lastRow[colMap.fixCol]        || null) : null;
    const dataOrigin = colMap.dataOriginCol ? (lastRow[colMap.dataOriginCol] || null) : null;
    const component  = colMap.componentCol  ? (lastRow[colMap.componentCol]  || null) : null;

    return {
      id:          rawId,
      hostname:    rawId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      os:          String(osVal).trim(),
      ip:          String(ipVal).trim(),
      location:    String(locVal).trim(),
      status,
      network:     networkStatus === 'unknown' ? 'online' : networkStatus,
      cpu:         Math.round(cpuNow),
      ram:         Math.round(ramNow),
      disk:        Math.round(diskNow),
      diskHealth:  diskHealth?.label || null,
      lastSeen:    new Date(tsVal).toISOString() || new Date().toISOString(),
      analysedAt:  new Date().toISOString(),
      faults,
      metrics,
      logs,
      // Dataset-specific metadata
      faultType,
      fixApplied,
      dataOrigin,
      component,
      // raw stats for potential future use
      _stats: { cpu: cpuStats, ram: ramStats, disk: diskStats },
    };
  });

  /* ── Summary ──────────────────────────────────────────────────── */
  const healthy  = devices.filter(d => d.status === 'healthy').length;
  const warning  = devices.filter(d => d.status === 'warning').length;
  const critical = devices.filter(d => d.status === 'critical').length;

  // Fault distribution
  const faultCounts = {};
  devices.forEach(d => d.faults.forEach(f => {
    faultCounts[f.type] = (faultCounts[f.type] || 0) + 1;
  }));
  const palette = ['#39766f', '#648780', '#899e99', '#afbfbb', '#d0d9d6'];
  const faultDistribution = Object.entries(faultCounts).map(([name, count], i) => ({
    name, count, fill: palette[i % palette.length],
  }));

  // Recent activity
  const recentActivity = devices
    .filter(d => d.status !== 'healthy')
    .slice(0, 8)
    .map(d => ({
      id:    d.id,
      type:  d.status,
      event: d.faults[0] ? `${d.faults[0].type} detected (${d.faults[0].confidence}% confidence)` : 'Issue detected',
      time:  'Just now',
    }));

  const summary = {
    totalDevices:     devices.length,
    healthy,
    warning,
    critical,
    lastAnalysis:     new Date().toISOString(),
    datasetName:      fileInfo.name,
    faultDistribution,
    recentActivity,
  };

  return { devices, summary };
}
