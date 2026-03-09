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
  totalTime: 0,
  dictionaryStats: null  // Store dictionary loading stats
};
let submissions = [];  // All submissions
let allSpaces = [];    // All available spaces
let currentSpace = null;  // Currently selected space
let progressInterval = null;
let totalCores = navigator.hardwareConcurrency || 4;  // Store cores globally

// Type badge mapping (no emojis)
const TYPE_BADGES = {
  'birthday_ddmmyyyy': { label: 'Birthday', class: 'type-birthday' },
  'digits8': { label: 'Digits8', class: 'type-digits8' },
  'lowercase8': { label: 'Lower8', class: 'type-lowercase8' }
};

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize password spaces
  await PasswordSpaces.init();
  
  // Load spaces first, then submissions
  await loadSpaces();
  
  initControlCenter();
  
  // Wire up space filter
  const spaceSelect = document.getElementById('space-filter-select');
  if (spaceSelect) {
    spaceSelect.addEventListener('change', () => {
      currentSpace = spaceSelect.value;
      localStorage.setItem('selectedSpace', currentSpace);
      loadSubmissions();
    });
  }
  
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

// --- Load spaces and populate dropdown ---
async function loadSpaces() {
  try {
    const res = await fetch('/api/spaces');
    if (!res.ok) {
      console.error('Failed to load spaces');
      return;
    }
    allSpaces = await res.json();
    
    const spaceSelect = document.getElementById('space-filter-select');
    if (!spaceSelect) return;
    
    // Clear existing options except placeholder
    spaceSelect.innerHTML = '<option value="" disabled>Select a space...</option>';
    
    if (allSpaces.length === 0) {
      spaceSelect.innerHTML = '<option value="" disabled selected>No spaces available</option>';
      return;
    }
    
    // Populate dropdown
    allSpaces.forEach(space => {
      const option = document.createElement('option');
      option.value = space.id;
      option.textContent = `${space.name} (${space.id})`;
      spaceSelect.appendChild(option);
    });
    
    // Auto-select if only one space or restore from localStorage
    const savedSpace = localStorage.getItem('selectedSpace');
    if (allSpaces.length === 1) {
      currentSpace = allSpaces[0].id;
      spaceSelect.value = currentSpace;
    } else if (savedSpace && allSpaces.find(s => s.id === savedSpace)) {
      currentSpace = savedSpace;
      spaceSelect.value = currentSpace;
    }
    
    // Load submissions if space is selected
    if (currentSpace) {
      await loadSubmissions();
    }
    
  } catch (e) {
    console.error('Error loading spaces:', e);
  }
}

// --- Get filtered submissions for current space ---
function getFilteredSubmissions() {
  if (!currentSpace) return [];
  return submissions.filter(s => s.spaceId === currentSpace);
}

// --- Initialize Control Center ---
function initControlCenter() {
  // Update mode UI first
  updateModeUI();
  
  // Populate type filters
  populateTypeFilters();
  
  // Initialize status
  updateStatus('IDLE');
}

function populateTypeFilters() {
  const container = document.getElementById('type-filter-checkboxes');
  if (!container) return;
  
  const filteredSubs = getFilteredSubmissions();
  
  const types = [
    { id: 'birthday_ddmmyyyy', defaultChecked: true },  // Only birthday checked by default
    { id: 'digits8', defaultChecked: false },           // Too large for browser
    { id: 'lowercase8', defaultChecked: false }         // Way too large for browser
  ];
  container.innerHTML = '';
  
  types.forEach(type => {
    const badge = TYPE_BADGES[type.id];
    const count = filteredSubs.filter(s => s.passwordTypeId === type.id && !s.cracked).length;
    
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.innerHTML = `
      <input type="checkbox" value="${type.id}" ${type.defaultChecked ? 'checked' : ''}>
      <span>${badge.label} <span style="color:#666">[${count} left]</span></span>
    `;
    container.appendChild(label);
  });
}

function updateModeUI() {
  const mode = document.querySelector('input[name="crack-mode"]:checked').value;
  const isGPU = mode === 'gpu';
  const isSingle = mode === 'single';
  const isMulti = mode === 'multi';
  
  // Update button visibility
  document.getElementById('btn-start-crack').style.display = isGPU ? 'none' : 'inline-block';
  document.getElementById('btn-download-gpu').style.display = isGPU ? 'inline-block' : 'none';
  
  // Update info text - with null check
  const infoEl = document.getElementById('mode-info');
  if (!infoEl) return;  // Guard clause
  
  if (isGPU) {
    infoEl.innerHTML = 'Export: <span>Python script</span>';
  } else if (isSingle) {
    infoEl.innerHTML = 'Workers: <span id="worker-count">1</span> thread';
  } else if (isMulti) {
    infoEl.innerHTML = `Workers: <span id="worker-count">${totalCores}</span> threads`;
  }
}

// --- Get worker count based on mode ---
function getWorkerCount() {
  const mode = document.querySelector('input[name="crack-mode"]:checked').value;
  if (mode === 'single') return 1;
  if (mode === 'multi') return totalCores;
  return 1; // Default
}

// --- Load submissions from API ---
async function loadSubmissions() {
  try {
    const res = await fetch('/api/hashes');
    if (!res.ok) return;
    const data = await res.json();
    submissions = Array.isArray(data) ? data : [];
    
    // Filter by current space if selected
    const filteredSubs = getFilteredSubmissions();
    renderTable(filteredSubs);
    
    // Update counts and type filters
    document.getElementById('sub-count').textContent = submissions.length;
    populateTypeFilters();
    
    updateStatus('IDLE');
  } catch (e) {
    console.error('Error loading submissions:', e);
  }
}

// --- Update status display ---
function updateStatus(status, message = '') {
  const statusEl = document.getElementById('crack-status');
  if (!statusEl) return;
  
  let statusText = '';
  let statusColor = '#888';
  
  switch(status) {
    case 'IDLE':
      statusText = 'Ready';
      statusColor = '#4cff80';
      break;
    case 'CRACKING':
      statusText = 'Cracking...';
      statusColor = '#ffaa00';
      break;
    case 'PAUSED':
      statusText = 'Paused';
      statusColor = '#ff8800';
      break;
    case 'COMPLETE':
      statusText = 'Complete';
      statusColor = '#4cff80';
      break;
    case 'ERROR':
      statusText = 'Error';
      statusColor = '#f66';
      break;
  }
  
  statusEl.textContent = statusText + (message ? ': ' + message : '');
  statusEl.style.color = statusColor;
}

// --- Render table ---
function renderTable(subs) {
  const tbody = document.getElementById('submissions-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#666">No submissions yet. Waiting...</td></tr>';
    return;
  }
  
  subs.forEach((s, i) => {
    const cracked = s.cracked && s.password;
    const dur = cracked ? formatCrackDuration(s) : '';
    const badge = TYPE_BADGES[s.passwordTypeId] || { label: s.passwordTypeId || '?', class: 'type-unknown' };
    
    const tr = document.createElement('tr');
    tr.id = 'row-' + s.id;
    tr.style.background = cracked ? 'rgba(0,180,80,0.08)' : (i % 2 === 0 ? '#12121f' : '#0d0d1a');
    
    const crackedCell = cracked
      ? '✅ <strong>' + s.password + '</strong>' +
        (dur ? '<br><span style="font-size:0.75em;color:#888;font-weight:normal">cracked in ' + dur + '</span>' : '')
      : '<span style="color:#555">—</span>';
    
    tr.innerHTML =
      '<td style="text-align:center;color:#666;font-size:0.85em">' + (i + 1) + '</td>' +
      '<td><code title="' + s.hash + '" style="font-size:0.8em;cursor:help;color:#aaa">' + s.hash.substring(0, 12) + '…</code></td>' +
      '<td><span class="type-badge ' + badge.class + '">' + badge.label + '</span></td>' +
      '<td id="crack-' + s.id + '" style="font-weight:bold;color:' + (cracked ? '#4cff80' : '#555') + '">' + crackedCell + '</td>' +
      '<td style="font-size:0.88em" class="hide-mobile">' + guessDeviceType(s.meta && s.meta.userAgent) + '</td>' +
      '<td style="font-family:monospace;font-size:0.82em;color:#aaa" class="hide-mobile">' + ((s.meta && s.meta.ip) || '—') + '</td>' +
      '<td style="font-size:0.85em;color:#aaa" class="hide-mobile">' + (s.spaceId || '—') + '</td>' +
      '<td style="font-size:0.82em;color:#777">' + (s.submitted ? new Date(s.submitted).toLocaleTimeString() : '—') + '</td>' +
      '<td style="white-space:nowrap">' +
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
    if (action === 'info')   showMeta(sub);
  };
}

// --- Device type + OS from User Agent ---
function guessDeviceType(ua) {
  if (!ua || ua === 'unknown') return '❓ Unknown';
  if (/bot|crawler|spider|headless|python|curl|wget|go-http/i.test(ua)) return '🤖 Bot';

  // Mobile OS
  if (/iphone/i.test(ua))                          return '📱 iPhone (iOS)';
  if (/ipad/i.test(ua))                            return '📟 iPad (iOS)';
  if (/android/i.test(ua) && /mobile/i.test(ua))  return '📱 Android';
  if (/android/i.test(ua))                         return '📟 Android Tablet';
  if (/windows phone/i.test(ua))                   return '📱 Windows Phone';
  if (/blackberry|bb10/i.test(ua))                 return '📱 BlackBerry';

  // Desktop OS
  if (/windows nt/i.test(ua))                      return '🖥 Desktop (Windows)';
  if (/macintosh|mac os x/i.test(ua))              return '🖥 Desktop (macOS)';
  if (/cros/i.test(ua))                            return '🖥 Desktop (ChromeOS)';
  if (/linux/i.test(ua))                           return '🖥 Desktop (Linux)';

  return '🖥 Desktop';
}

// --- Crack duration ---
function formatCrackDuration(sub) {
  if (!sub.crackedAt || !sub.submitted) return '';
  const ms = sub.crackedAt - sub.submitted;
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

// --- Show metadata modal ---
function showMeta(sub) {
  const payload = {
    id:        sub.id,
    hash:      sub.hash,
    spaceId:   sub.spaceId,
    passwordTypeId: sub.passwordTypeId,
    submitted: sub.submitted ? new Date(sub.submitted).toISOString() : null,
    cracked:   sub.cracked,
    password:  sub.password || null,
    crackedAt: sub.crackedAt ? new Date(sub.crackedAt).toISOString() : null,
    attempts:  sub.attempts,
    meta:      sub.meta || {}
  };
  document.getElementById('meta-modal-body').innerHTML =
    '<pre style="margin:0;padding:1em;background:#0d1117;border-radius:6px;' +
    'font-family:\'Fira Code\',\'Cascadia Code\',\'Consolas\',monospace;' +
    'font-size:0.82em;line-height:1.6;overflow:auto;max-height:65vh;' +
    'color:#d4d4d4;white-space:pre;tab-size:2">' +
    syntaxHighlightJson(payload) + '</pre>';
  document.getElementById('meta-modal').style.display = 'block';
}

// --- JSON syntax highlighter (VS Code dark theme colors) ---
function syntaxHighlightJson(obj) {
  const json = JSON.stringify(obj, null, 2)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    /(&quot;(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\&])*&quot;(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function(match) {
      var cls = 'color:#ce9178'; // string value
      if (/^&quot;/.test(match)) {
        if (/:$/.test(match)) cls = 'color:#9cdcfe'; // key
      } else if (/true|false/.test(match)) {
        cls = 'color:#569cd6'; // boolean
      } else if (/null/.test(match)) {
        cls = 'color:#808080'; // null
      } else {
        cls = 'color:#b5cea8'; // number
      }
      return '<span style="' + cls + '">' + match + '</span>';
    }
  );
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

// --- Cracking functions (stubbed for new architecture) ---
async function startCracking() {
  updateStatus('CRACKING', 'Not yet implemented in new architecture');
  // TODO: Implement with worker pool
}

function pauseCracking() {
  updateStatus('PAUSED');
  // TODO: Implement pause functionality
}

function stopCracking() {
  updateStatus('IDLE');
  // TODO: Implement stop functionality
}

function downloadGPUScript() {
  // TODO: Generate and download GPU Python script
  alert('GPU script download not yet implemented');
}

function exportCSV() {
  const filteredSubs = getFilteredSubmissions();
  if (filteredSubs.length === 0) {
    alert('No submissions to export');
    return;
  }
  
  let csv = 'ID,Hash,Type,Password,Cracked,Submitted,CrackedAt,Attempts,SpaceId,Device,IP\n';
  filteredSubs.forEach(s => {
    const device = guessDeviceType(s.meta && s.meta.userAgent).replace(/,/g, ';');
    csv += [
      s.id,
      s.hash,
      s.passwordTypeId || '',
      s.password || '',
      s.cracked ? 'Yes' : 'No',
      s.submitted ? new Date(s.submitted).toISOString() : '',
      s.crackedAt ? new Date(s.crackedAt).toISOString() : '',
      s.attempts || '',
      s.spaceId || '',
      '"' + device + '"',
      (s.meta && s.meta.ip) || ''
    ].join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'submissions-' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
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
