// instructor.js - Enhanced Instructor Dashboard with Control Center

const DEFAULT_POLL_INTERVAL = 0; // Off by default
let pollTimer = null;
let crackingState = {
  active: false,
  paused: false,
  currentId: null,
  currentHash: null,
  batchMode: false,
  batchIndex: 0,
  startTime: null,
  totalAttempts: 0,
  totalTime: 0
};
let submissions = [];
let progressInterval = null;

// Type badge mapping
const TYPE_BADGES = {
  'birthday_ddmmyyyy': { emoji: '🎂', label: 'Birthday', class: 'type-birthday' },
  'digits8': { emoji: '🔢', label: 'Digits8', class: 'type-digits8' },
  'lowercase8': { emoji: '🔤', label: 'Lower8', class: 'type-lowercase8' }
};

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize password spaces
  await PasswordSpaces.init();
  
  loadSubmissions();
  initControlCenter();
  
  // Wire up poll interval dropdown
  const pollSelect = document.getElementById('poll-interval-select');
  if (pollSelect) {
    pollSelect.addEventListener('change', () => {
      const val = parseInt(pollSelect.value, 10);
      startPolling(isNaN(val) ? 0 : val);
    });
    startPolling(DEFAULT_POLL_INTERVAL);
  }
  
  // Wire up buttons
  document.getElementById('btn-delete-all').addEventListener('click', deleteAll);
  document.getElementById('btn-refresh').addEventListener('click', loadSubmissions);
  document.getElementById('btn-start-crack').addEventListener('click', startCracking);
  document.getElementById('btn-pause-crack').addEventListener('click', pauseCracking);
  document.getElementById('btn-stop-crack').addEventListener('click', stopCracking);
  document.getElementById('btn-download-gpu').addEventListener('click', downloadGPUScript);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  
  // Mode switching
  document.querySelectorAll('input[name="crack-mode"]').forEach(radio => {
    radio.addEventListener('change', updateModeUI);
  });
  
  // Select all types
  document.getElementById('select-all-types')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('#type-filter-checkboxes input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
    });
  });
  
  loadSpacesAdmin();
  const saveSpaceBtn = document.getElementById('btn-save-space');
  if (saveSpaceBtn) saveSpaceBtn.addEventListener('click', saveSpaceFromForm);
});

// --- Initialize Control Center ---
function initControlCenter() {
  // Detect worker count
  const workerCount = navigator.hardwareConcurrency || 4;
  document.getElementById('worker-count').textContent = workerCount;
  
  // Populate type filters
  populateTypeFilters();
  
  // Update mode UI
  updateModeUI();
  
  // Initialize status
  updateStatus('IDLE');
}

function populateTypeFilters() {
  const container = document.getElementById('type-filter-checkboxes');
  if (!container) return;
  
  const types = ['birthday_ddmmyyyy', 'digits8', 'lowercase8'];
  container.innerHTML = '';
  
  types.forEach(typeId => {
    const badge = TYPE_BADGES[typeId];
    const count = submissions.filter(s => s.passwordTypeId === typeId && !s.cracked).length;
    
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.innerHTML = `
      <input type="checkbox" value="${typeId}" checked>
      <span>${badge.emoji} ${badge.label} <span style="color:#666">[${count} left]</span></span>
    `;
    container.appendChild(label);
  });
}

function updateModeUI() {
  const mode = document.querySelector('input[name="crack-mode"]:checked').value;
  const isGPU = mode === 'gpu';
  
  document.getElementById('btn-start-crack').style.display = isGPU ? 'none' : 'inline-block';
  document.getElementById('btn-download-gpu').style.display = isGPU ? 'inline-block' : 'none';
  
  // Update info text
  const infoEl = document.getElementById('mode-info');
  if (isGPU) {
    infoEl.innerHTML = 'Export: <span>Python script</span>';
  } else {
    const workerCount = navigator.hardwareConcurrency || 4;
    infoEl.innerHTML = `Workers: <span>${workerCount} cores</span>`;
  }
}

// --- Polling control ---
function startPolling(intervalMs) {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (intervalMs > 0) {
    pollTimer = setInterval(loadSubmissions, intervalMs);
    console.log('Polling started: every ' + (intervalMs/1000) + 's');
  } else {
    console.log('Polling disabled');
  }
}

// --- Load submissions from API ---
async function loadSubmissions() {
  try {
    const res = await fetch('/api/hashes');
    if (!res.ok) return;
    const data = await res.json();
    submissions = Array.isArray(data) ? data : [];
    renderTable(submissions);
    document.getElementById('sub-count').textContent = submissions.length;
    populateTypeFilters();
    updateSummary();
  } catch (e) {
    console.error('Poll error:', e);
  }
}

// --- Device type + OS from User Agent ---
function guessDeviceType(ua) {
  if (!ua || ua === 'unknown') return '❓ Unknown';
  if (/bot|crawler|spider|headless|python|curl|wget|go-http/i.test(ua)) return '🤖 Bot';
  if (/iphone/i.test(ua)) return '📱 iPhone (iOS)';
  if (/ipad/i.test(ua)) return '📱 iPad (iOS)';
  if (/android/i.test(ua) && /mobile/i.test(ua)) return '📱 Android';
  if (/android/i.test(ua)) return '📱 Android Tablet';
  if (/windows phone/i.test(ua)) return '📱 Windows Phone';
  if (/blackberry|bb10/i.test(ua)) return '📱 BlackBerry';
  if (/windows nt/i.test(ua)) return '🖥 Desktop (Windows)';
  if (/macintosh|mac os x/i.test(ua)) return '🖥 Desktop (macOS)';
  if (/cros/i.test(ua)) return '🖥 Desktop (ChromeOS)';
  if (/linux/i.test(ua)) return '🖥 Desktop (Linux)';
  return '🖥 Desktop';
}

// --- Crack duration ---
function formatCrackDuration(sub) {
  if (!sub.crackedAt || !sub.submitted) return '';
  const ms = sub.crackedAt - sub.submitted;
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

// --- Get type badge HTML ---
function getTypeBadgeHTML(typeId) {
  const badge = TYPE_BADGES[typeId] || { emoji: '❓', label: 'Unknown', class: 'type-unknown' };
  return `<span class="type-badge ${badge.class}">${badge.emoji} ${badge.label}</span>`;
}

// --- JSON syntax highlighter ---
function syntaxHighlightJson(obj) {
  const json = JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    /(&quot;(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\&])*&quot;(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function(match) {
      var cls = 'color:#ce9178';
      if (/^&quot;/.test(match)) {
        if (/:$/.test(match)) cls = 'color:#9cdcfe';
      } else if (/true|false/.test(match)) {
        cls = 'color:#569cd6';
      } else if (/null/.test(match)) {
        cls = 'color:#808080';
      } else {
        cls = 'color:#b5cea8';
      }
      return '<span style="' + cls + '">' + match + '</span>';
    }
  );
}

// --- Show metadata modal ---
function showMeta(sub) {
  const payload = {
    id: sub.id,
    hash: sub.hash,
    spaceId: sub.spaceId,
    passwordTypeId: sub.passwordTypeId || null,
    submitted: sub.submitted ? new Date(sub.submitted).toISOString() : null,
    cracked: sub.cracked,
    password: sub.password || null,
    crackedAt: sub.crackedAt ? new Date(sub.crackedAt).toISOString() : null,
    attempts: sub.attempts,
    meta: sub.meta || {}
  };
  document.getElementById('meta-modal-body').innerHTML =
    '<pre style="margin:0;padding:1em;background:#0d1117;border-radius:6px;' +
    'font-family:\'Fira Code\',\'Cascadia Code\',\'Consolas\',monospace;' +
    'font-size:0.82em;line-height:1.6;overflow:auto;max-height:65vh;' +
    'color:#d4d4d4;white-space:pre;tab-size:2">' +
    syntaxHighlightJson(payload) + '</pre>';
  document.getElementById('meta-modal').style.display = 'block';
}

// --- Render table with type badges and cracking highlight ---
function renderTable(subs) {
  const tbody = document.getElementById('submissions-tbody');
  tbody.innerHTML = '';
  if (subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#666">No submissions yet. Waiting...</td></tr>';
    return;
  }
  subs.forEach((s, i) => {
    const cracked = s.cracked && s.password;
    const dur = cracked ? formatCrackDuration(s) : '';
    const tr = document.createElement('tr');
    tr.id = 'row-' + s.id;
    
    // Add cracking highlight
    if (crackingState.active && crackingState.currentId === s.id) {
      tr.classList.add('row-cracking');
    }
    
    tr.style.background = cracked ? 'rgba(0,180,80,0.08)' : (i % 2 === 0 ? '#12121f' : '#0d0d1a');
    const crackedCell = cracked
      ? '✅ <strong>' + s.password + '</strong>' +
        (dur ? '<br><span style="font-size:0.75em;color:#888;font-weight:normal">cracked in ' + dur + '</span>' : '')
      : '<span style="color:#555">—</span>';
    
    tr.innerHTML =
      '<td style="text-align:center;color:#666;font-size:0.85em">' + (i + 1) + '</td>' +
      '<td><code title="' + s.hash + '" style="font-size:0.8em;cursor:help;color:#aaa">' + s.hash.substring(0, 12) + '…</code></td>' +
      '<td>' + getTypeBadgeHTML(s.passwordTypeId) + '</td>' +
      '<td id="crack-' + s.id + '" style="font-weight:bold;color:' + (cracked ? '#4cff80' : '#555') + '">' + crackedCell + '</td>' +
      '<td style="font-size:0.88em">' + guessDeviceType(s.meta && s.meta.userAgent) + '</td>' +
      '<td style="font-family:monospace;font-size:0.82em;color:#aaa">' + ((s.meta && s.meta.ip) || '—') + '</td>' +
      '<td style="font-size:0.85em;color:#aaa">' + (s.spaceId || '—') + '</td>' +
      '<td style="font-size:0.82em;color:#777">' + (s.submitted ? new Date(s.submitted).toLocaleTimeString() : '—') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn-sm btn-crack" data-action="crack" data-id="' + s.id + '" title="Crack this hash">⚡</button> ' +
        '<button class="btn-sm btn-info"  data-action="info"  data-id="' + s.id + '" title="Show all metadata">🔍</button> ' +
        '<button class="btn-sm btn-danger" data-action="delete" data-id="' + s.id + '" title="Delete">✕</button>' +
      '</td>';
    tbody.appendChild(tr);
  });

  tbody.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const sub = submissions.find(x => x.id === id);
    if (!sub) return;
    const action = btn.getAttribute('data-action');
    if (action === 'delete') deleteSingle(id);
    if (action === 'crack') crackSingle(sub);
    if (action === 'info') showMeta(sub);
  };
}

// --- Update status display ---
function updateStatus(status) {
  const el = document.getElementById('crack-status');
  el.textContent = status;
  el.className = 'status-' + status.toLowerCase();
  
  // Update control center appearance
  const controlCenter = document.getElementById('control-center');
  if (status === 'RUNNING') {
    controlCenter.classList.add('active');
  } else {
    controlCenter.classList.remove('active');
  }
}

// --- Update progress display ---
function updateProgress(progress) {
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  const percentage = Math.min(100, Math.max(0, progress.percentage || 0));
  
  fill.style.width = percentage + '%';
  text.textContent = percentage.toFixed(1) + '%';
  
  if (crackingState.active && !crackingState.paused) {
    fill.classList.add('animating');
  } else {
    fill.classList.remove('animating');
  }
}

// --- Update metrics ---
function updateMetrics(metrics) {
  document.getElementById('metric-hash').textContent = metrics.hash || '—';
  document.getElementById('metric-candidate').textContent = metrics.candidate || '—';
  document.getElementById('metric-speed').textContent = metrics.speed || '0 H/s';
  document.getElementById('metric-attempts').textContent = metrics.attempts || '0 / 0';
  document.getElementById('metric-elapsed').textContent = metrics.elapsed || '00:00';
  document.getElementById('metric-estimated').textContent = metrics.estimated || '—';
  document.getElementById('metric-phase').textContent = metrics.phase || 'Waiting...';
}

// --- Update summary ---
function updateSummary() {
  const total = submissions.length;
  const cracked = submissions.filter(s => s.cracked).length;
  const remaining = total - cracked;
  const percentage = total > 0 ? ((cracked / total) * 100).toFixed(0) : 0;
  
  document.getElementById('summary-total').textContent = total;
  document.getElementById('summary-cracked').textContent = `${cracked} (${percentage}%)`;
  document.getElementById('summary-remaining').textContent = remaining;
  document.getElementById('summary-time').textContent = formatTime(crackingState.totalTime);
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- Start cracking ---
async function startCracking() {
  if (crackingState.active) {
    alert('A cracking operation is already in progress.');
    return;
  }
  
  // Get selected types
  const selectedTypes = Array.from(
    document.querySelectorAll('#type-filter-checkboxes input[type="checkbox"]:checked')
  ).map(cb => cb.value);
  
  if (selectedTypes.length === 0) {
    alert('Please select at least one password type to crack.');
    return;
  }
  
  // Get options
  const useDictionary = document.getElementById('opt-dictionary').checked;
  const truncationMode = document.getElementById('opt-truncation').value;
  const priorityOrder = document.getElementById('opt-priority').value;
  
  // Filter submissions
  let targets = submissions.filter(s => 
    !s.cracked && selectedTypes.includes(s.passwordTypeId)
  );
  
  // Apply priority ordering
  if (priorityOrder === 'oldest') {
    targets.sort((a, b) => a.submitted - b.submitted);
  } else if (priorityOrder === 'recent') {
    targets.sort((a, b) => b.submitted - a.submitted);
  } else if (priorityOrder === 'by_type') {
    targets.sort((a, b) => {
      const order = ['birthday_ddmmyyyy', 'digits8', 'lowercase8'];
      return order.indexOf(a.passwordTypeId) - order.indexOf(b.passwordTypeId);
    });
  } else if (priorityOrder === 'random') {
    targets.sort(() => Math.random() - 0.5);
  }
  
  if (targets.length === 0) {
    alert('No hashes to crack with selected filters.');
    return;
  }
  
  // Start cracking
  crackingState.active = true;
  crackingState.paused = false;
  crackingState.startTime = Date.now();
  crackingState.batchMode = true;
  
  updateStatus('RUNNING');
  document.getElementById('btn-start-crack').disabled = true;
  document.getElementById('btn-pause-crack').style.display = 'inline-block';
  document.getElementById('btn-stop-crack').style.display = 'inline-block';
  
  for (let i = 0; i < targets.length; i++) {
    if (!crackingState.active) break;
    
    // Wait if paused
    while (crackingState.paused && crackingState.active) {
      await sleep(100);
    }
    
    if (!crackingState.active) break;
    
    await crackSingle(targets[i], { useDictionary, truncationMode });
    await sleep(300);
  }
  
  // Cleanup
  crackingState.active = false;
  crackingState.batchMode = false;
  updateStatus('COMPLETED');
  document.getElementById('btn-start-crack').disabled = false;
  document.getElementById('btn-pause-crack').style.display = 'none';
  document.getElementById('btn-stop-crack').style.display = 'none';
}

// --- Pause cracking ---
function pauseCracking() {
  if (!crackingState.active) return;
  
  crackingState.paused = !crackingState.paused;
  const btn = document.getElementById('btn-pause-crack');
  
  if (crackingState.paused) {
    updateStatus('PAUSED');
    btn.innerHTML = '▶️ RESUME';
  } else {
    updateStatus('RUNNING');
    btn.innerHTML = '⏸️ PAUSE';
  }
}

// --- Stop cracking ---
function stopCracking() {
  if (!confirm('Stop all cracking operations? Progress will be lost.')) return;
  
  workerPool.cancel();
  crackingState.active = false;
  crackingState.paused = false;
  crackingState.currentId = null;
  crackingState.batchMode = false;
  
  updateStatus('STOPPED');
  document.getElementById('btn-start-crack').disabled = false;
  document.getElementById('btn-pause-crack').style.display = 'none';
  document.getElementById('btn-stop-crack').style.display = 'none';
  document.getElementById('btn-pause-crack').innerHTML = '⏸️ PAUSE';
  
  updateProgress({ percentage: 0 });
  updateMetrics({});
  loadSubmissions();
}

// --- Crack single entry ---
async function crackSingle(submission, options = {}) {
  const cell = document.getElementById('crack-' + submission.id);
  if (!cell) return;
  
  if (!crackingState.batchMode) {
    crackingState.active = true;
    crackingState.startTime = Date.now();
    updateStatus('RUNNING');
  }
  
  crackingState.currentId = submission.id;
  crackingState.currentHash = submission.hash;
  
  // Highlight row
  document.querySelectorAll('tr.row-cracking').forEach(tr => tr.classList.remove('row-cracking'));
  const row = document.getElementById('row-' + submission.id);
  if (row) row.classList.add('row-cracking');
  
  cell.innerHTML = '<span style="color:#ff0">Preparing…</span>';
  
  // Determine password type
  let passwordType;
  if (submission.passwordTypeId) {
    passwordType = PasswordSpaces.getMetadata(submission.passwordTypeId);
  }
  
  if (!passwordType) {
    passwordType = PasswordSpaces.getMetadata('birthday_ddmmyyyy');
  }
  
  if (!passwordType) {
    cell.innerHTML = '<span style="color:#f66">Error: No password type found</span>';
    crackingState.currentId = null;
    return;
  }
  
  const badge = TYPE_BADGES[passwordType.id] || { label: 'Unknown' };
  cell.innerHTML = `<span style="color:#888">Cracking ${badge.label}…</span>`;
  
  // Load dictionary if needed
  let dictionary = [];
  if (options.useDictionary !== false && passwordType.bruteForceStrategy.dictionarySupport) {
    cell.innerHTML = `<span style="color:#888">Loading dictionary…</span>`;
    dictionary = await dictionaryLoader.loadForType(passwordType);
  }
  
  // Configure options
  const crackOptions = { dictionary };
  
  // Apply truncation
  if (options.truncationMode && options.truncationMode !== 'full') {
    const mode = passwordType.bruteForceStrategy.truncationModes?.find(
      m => m.name === options.truncationMode
    );
    if (mode) {
      crackOptions.truncationMode = mode.name;
      crackOptions.limit = mode.limit;
    }
  } else if (passwordType.id === 'lowercase8') {
    // Default truncation for lowercase8
    const mode = passwordType.bruteForceStrategy.truncationModes.find(m => m.name === 'first_10M');
    crackOptions.limit = mode.limit;
  }
  
  // Progress callback
  crackOptions.onProgress = (progress) => {
    const speed = progress.speed ? (progress.speed / 1000).toFixed(1) + 'K H/s' : '0 H/s';
    const percentage = progress.total > 0 ? ((progress.attempts / progress.total) * 100) : 0;
    
    updateProgress({ percentage });
    updateMetrics({
      hash: submission.hash.substring(0, 12) + '…',
      candidate: progress.current,
      speed: speed,
      attempts: `${progress.attempts.toLocaleString()} / ${progress.total.toLocaleString()}`,
      elapsed: formatTime(Date.now() - crackingState.startTime),
      estimated: progress.speed > 0 ? formatTime(((progress.total - progress.attempts) / progress.speed) * 1000) : '—',
      phase: progress.phase === 'dictionary' ? 'Dictionary Attack' : 'Brute-force Search'
    });
    
    cell.innerHTML = 
      `<span style="color:#888">${progress.phase === 'dictionary' ? 'Dict' : 'Brute'}: ${progress.current}</span><br>` +
      `<span style="font-size:0.7em;color:#666">${progress.attempts.toLocaleString()} attempts ${speed}</span>`;
  };
  
  try {
    const result = await workerPool.crack(submission.hash, passwordType, crackOptions);
    
    if (result.password) {
      cell.innerHTML = '✅ <strong>' + result.password + '</strong>' +
        '<br><span style="font-size:0.75em;color:#888;font-weight:normal">' +
        result.attempts.toLocaleString() + ' attempts, ' + result.duration + 'ms (' + result.method + ')</span>';
      cell.style.color = '#4cff80';
      playSound('win');
      
      crackingState.totalAttempts += result.attempts;
      crackingState.totalTime += result.duration;
      
      await fetch('/api/hash/' + submission.id, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ password: result.password, attempts: result.attempts })
      });
      
      await loadSubmissions();
    } else {
      cell.innerHTML = '<span style="color:#f66">Not found (' + result.attempts.toLocaleString() + ' attempts)</span>';
      playSound('fail');
    }
  } catch (err) {
    console.error('Crack error:', err);
    cell.innerHTML = '<span style="color:#f66">Error: ' + err.message + '</span>';
  } finally {
    crackingState.currentId = null;
    if (row) row.classList.remove('row-cracking');
    
    if (!crackingState.batchMode) {
      crackingState.active = false;
      updateStatus('IDLE');
      updateProgress({ percentage: 0 });
      updateMetrics({});
    }
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// --- Download GPU script ---
async function downloadGPUScript() {
  // Get selected types
  const selectedTypes = Array.from(
    document.querySelectorAll('#type-filter-checkboxes input[type="checkbox"]:checked')
  ).map(cb => cb.value);
  
  const targets = submissions.filter(s => 
    !s.cracked && selectedTypes.includes(s.passwordTypeId)
  );
  
  if (targets.length === 0) {
    alert('No hashes to export with selected filters.');
    return;
  }
  
  try {
    const res = await fetch('/api/export-gpu-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: targets })
    });
    
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gpu-cracker.py';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert('Error exporting GPU script.');
    }
  } catch (e) {
    alert('Network error: ' + e.message);
  }
}

// --- Export CSV ---
function exportCSV() {
  const headers = ['ID', 'Hash', 'Type', 'Password', 'Cracked', 'Device', 'IP', 'Space', 'Submitted'];
  const rows = submissions.map(s => [
    s.id,
    s.hash,
    s.passwordTypeId || 'unknown',
    s.password || '',
    s.cracked ? 'Yes' : 'No',
    s.meta?.userAgent || '',
    s.meta?.ip || '',
    s.spaceId || '',
    s.submitted ? new Date(s.submitted).toISOString() : ''
  ]);
  
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'submissions.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// --- Delete single ---
async function deleteSingle(id) {
  await fetch('/api/hash/' + id, { method: 'DELETE' });
  loadSubmissions();
}

// --- Delete all ---
async function deleteAll() {
  if (!confirm('Delete ALL submissions?')) return;
  await fetch('/api/clear', { method: 'POST' });
  loadSubmissions();
}

// --- Spaces management ---
async function loadSpacesAdmin() {
  const tbody = document.getElementById('spaces-tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/spaces');
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#f66">Error loading spaces (API returned ' + res.status + ')</td></tr>';
      return;
    }
    const spaces = await res.json();
    if (!Array.isArray(spaces)) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#f66">Invalid response format from spaces API</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    if (spaces.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#666">No spaces yet. Create one below.</td></tr>';
      return;
    }
    spaces.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + s.id + '</td>' +
        '<td>' + s.name + '</td>' +
        '<td>' + (s.location || '-') + '</td>' +
        '<td>' + (s.description || '-') + '</td>' +
        '<td><button class="btn-sm btn-danger" data-spaceid="' + s.id + '">Delete</button></td>';
      tbody.appendChild(tr);
    });
    tbody.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.getAttribute('data-spaceid');
      if (!id) return;
      if (!confirm('Delete space "' + id + '"?')) return;
      await fetch('/api/spaces/' + id, { method: 'DELETE' });
      loadSpacesAdmin();
    };
  } catch (e) {
    console.error('Spaces load error:', e);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#f66">Network error loading spaces: ' + e.message + '</td></tr>';
  }
}

async function saveSpaceFromForm() {
  const id = (document.getElementById('space-id-input')?.value || '').trim();
  const name = (document.getElementById('space-name-input')?.value || '').trim();
  const location = (document.getElementById('space-location-input')?.value || '').trim();
  const description = (document.getElementById('space-desc-input')?.value || '').trim();
  const status = document.getElementById('space-save-status');
  if (!id || !name) {
    if (status) { status.textContent = 'ID and Name are required.'; status.style.color = '#f00'; }
    return;
  }
  try {
    const res = await fetch('/api/spaces', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id, name, location, description})
    });
    if (res.ok) {
      if (status) { status.textContent = 'Space saved!'; status.style.color = '#0f0'; setTimeout(() => { status.textContent = ''; }, 2000); }
      document.getElementById('space-id-input').value = '';
      document.getElementById('space-name-input').value = '';
      if (document.getElementById('space-location-input')) document.getElementById('space-location-input').value = '';
      if (document.getElementById('space-desc-input')) document.getElementById('space-desc-input').value = '';
      loadSpacesAdmin();
    } else {
      const d = await res.json();
      if (status) { status.textContent = d.error || 'Error saving space.'; status.style.color = '#f00'; }
    }
  } catch (e) {
    if (status) { status.textContent = 'Network error.'; status.style.color = '#f00'; }
  }
}

// --- Sound effects ---
function playSound(type) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  if (type === 'win') {
    playNote(ctx, 523, 0.0, 0.15);
    playNote(ctx, 659, 0.15, 0.15);
    playNote(ctx, 784, 0.30, 0.15);
    playNote(ctx, 1047, 0.45, 0.40);
  } else {
    playNote(ctx, 494, 0.0, 0.18);
    playNote(ctx, 466, 0.20, 0.18);
    playNote(ctx, 440, 0.40, 0.18);
    playNote(ctx, 415, 0.60, 0.55);
  }
}

function playNote(ctx, freq, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = freq;
  osc.type = 'sawtooth';
  gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration + 0.01);
}
