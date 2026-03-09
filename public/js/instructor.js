// instructor.js - Enhanced Instructor Dashboard with Control Center

const DEFAULT_POLL_INTERVAL = 0;
let pollTimer = null;
let crackingState = {
  active: false,
  paused: false,
  currentId: null,
  currentHash: null,
  batchMode: false,
  batch: [],
  batchIndex: 0,
  startTime: null,
  totalAttempts: 0,
  totalTime: 0,
  crackedCount: 0,
  dictionary: null
};
let submissions = [];
let allSpaces = [];
let currentSpace = null;
let progressInterval = null;
let totalCores = navigator.hardwareConcurrency || 4;

// API Base URL detection
// Cloudflare Pages preview URLs (*.pages.dev) only serve static files
// API routes are only available on production domain
function getApiBaseUrl() {
  const hostname = window.location.hostname;
  
  // If on a Cloudflare Pages preview URL, use production for API
  if (hostname.includes('.pages.dev')) {
    return 'https://pw-hack-demo.apps.zengel.cloud';
  }
  
  // Otherwise use relative paths (same origin)
  return '';
}

const API_BASE = getApiBaseUrl();

// Get dictionary count for a password type
function getDictionaryInfo(passwordTypeId) {
  const type = PasswordSpaces.getMetadata(passwordTypeId);
  if (!type || !type.bruteForceStrategy) return { count: 0, urls: [], tooltip: '' };
  
  const strategy = type.bruteForceStrategy;
  const urls = strategy.dictionaryUrls || [];
  const count = urls.length;
  
  if (count === 0 || !strategy.dictionarySupport) {
    return { count: 0, urls: [], tooltip: 'No dictionary support' };
  }
  
  // Build tooltip with dictionary list
  const tooltip = `Uses ${count} ${count === 1 ? 'dictionary' : 'dictionaries'}:\n` + 
                  urls.map(url => '• ' + url.split('/').pop()).join('\n');
  
  return { count, urls, tooltip };
}

document.addEventListener('DOMContentLoaded', async () => {
  // Log API routing info
  console.log('API Base URL:', API_BASE || '(relative paths)');
  
  await PasswordSpaces.init();
  await loadDictionary();
  await loadSpaces();
  initControlCenter();
  
  const spaceSelect = document.getElementById('space-filter-select');
  if (spaceSelect) {
    spaceSelect.addEventListener('change', () => {
      currentSpace = spaceSelect.value;
      localStorage.setItem('selectedSpace', currentSpace);
      loadSubmissions();
    });
  }
  
  const pollSelect = document.getElementById('poll-interval-select');
  if (pollSelect) {
    pollSelect.addEventListener('change', () => {
      const val = parseInt(pollSelect.value, 10);
      startPolling(isNaN(val) ? 0 : val);
    });
    startPolling(DEFAULT_POLL_INTERVAL);
  }
  
  document.getElementById('btn-delete-all').addEventListener('click', deleteAll);
  document.getElementById('btn-refresh').addEventListener('click', loadSubmissions);
  document.getElementById('btn-start-crack').addEventListener('click', startCracking);
  document.getElementById('btn-pause-crack').addEventListener('click', pauseCracking);
  document.getElementById('btn-stop-crack').addEventListener('click', stopCracking);
  document.getElementById('btn-download-gpu').addEventListener('click', downloadGPUScript);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);
  
  document.querySelectorAll('input[name="crack-mode"]').forEach(radio => {
    radio.addEventListener('change', updateModeUI);
  });
  
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

async function loadDictionary() {
  if (typeof dictionaryLoader !== 'undefined') {
    try {
      crackingState.dictionary = await dictionaryLoader.load('/dictionaries/common-passwords.txt');
      console.log('Dictionary loaded:', crackingState.dictionary ? crackingState.dictionary.length : 0, 'words');
    } catch (e) {
      console.error('Failed to load dictionary:', e);
      crackingState.dictionary = [];
    }
  } else {
    console.warn('dictionaryLoader not available');
    crackingState.dictionary = [];
  }
}

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

async function loadSpaces() {
  try {
    const res = await fetch(API_BASE + '/api/spaces');
    if (!res.ok) {
      console.error('Failed to load spaces');
      return;
    }
    allSpaces = await res.json();
    
    const spaceSelect = document.getElementById('space-filter-select');
    if (!spaceSelect) return;
    
    spaceSelect.innerHTML = '<option value="" disabled>Select a space...</option>';
    
    if (allSpaces.length === 0) {
      spaceSelect.innerHTML = '<option value="" disabled selected>No spaces available</option>';
      return;
    }
    
    allSpaces.forEach(space => {
      const option = document.createElement('option');
      option.value = space.id;
      option.textContent = `${space.name} (${space.id})`;
      spaceSelect.appendChild(option);
    });
    
    const savedSpace = localStorage.getItem('selectedSpace');
    if (allSpaces.length === 1) {
      currentSpace = allSpaces[0].id;
      spaceSelect.value = currentSpace;
    } else if (savedSpace && allSpaces.find(s => s.id === savedSpace)) {
      currentSpace = savedSpace;
      spaceSelect.value = currentSpace;
    }
    
    if (currentSpace) {
      await loadSubmissions();
    }
    
  } catch (e) {
    console.error('Error loading spaces:', e);
  }
}

function getFilteredSubmissions() {
  if (!currentSpace) return [];
  return submissions.filter(s => s.spaceId === currentSpace);
}

function getFilteredUncracked() {
  const filtered = getFilteredSubmissions();
  const selectedTypes = Array.from(
    document.querySelectorAll('#type-filter-checkboxes input[type="checkbox"]:checked')
  ).map(cb => cb.value);
  
  return filtered.filter(s => !s.cracked && selectedTypes.includes(s.passwordTypeId));
}

function initControlCenter() {
  updateModeUI();
  populateTypeFilters();
  updateStatus('IDLE');
  updateSummary();
}

function populateTypeFilters() {
  const container = document.getElementById('type-filter-checkboxes');
  if (!container) return;
  
  const filteredSubs = getFilteredSubmissions();
  
  // Get all password types from PasswordSpaces (dynamically loaded from backend)
  const availableTypes = PasswordSpaces.types || [];
  
  if (availableTypes.length === 0) {
    container.innerHTML = '<div style="color:#888;font-size:0.9em">Loading password types...</div>';
    return;
  }
  
  container.innerHTML = '';
  
  // Build filters dynamically from backend types - ALWAYS show all types
  availableTypes.forEach(type => {
    const dictInfo = getDictionaryInfo(type.id);
    const count = filteredSubs.filter(s => s.passwordTypeId === type.id && !s.cracked).length;
    
    // Only birthday checked by default (weakest type)
    const defaultChecked = type.id === 'birthday';
    
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.title = dictInfo.tooltip;
    
    // Show count with visual indicator if 0
    const countDisplay = count === 0 
      ? '<span style="color:#444">[0]</span>' 
      : `<span style="color:#666">[${count} left]</span>`;
    
    label.innerHTML = `
      <input type="checkbox" value="${type.id}" ${defaultChecked ? 'checked' : ''}>
      <span>
        <code style="color:#4c9aff;font-size:0.9em">${type.id}</code>
        ${countDisplay}
        <span style="color:#888;font-size:0.85em;margin-left:4px" title="${dictInfo.tooltip}">
          📚 ${dictInfo.count === 0 ? 'None' : dictInfo.count + ' dict' + (dictInfo.count > 1 ? 's' : '')}
        </span>
      </span>
    `;
    container.appendChild(label);
  });
}

function updateModeUI() {
  const mode = document.querySelector('input[name="crack-mode"]:checked').value;
  const isGPU = mode === 'gpu';
  const isSingle = mode === 'single';
  const isMulti = mode === 'multi';
  
  document.getElementById('btn-start-crack').style.display = isGPU ? 'none' : 'inline-block';
  document.getElementById('btn-download-gpu').style.display = isGPU ? 'inline-block' : 'none';
  
  const infoEl = document.getElementById('mode-info');
  if (!infoEl) return;
  
  if (isGPU) {
    infoEl.innerHTML = 'Export: <span>Python script</span>';
  } else if (isSingle) {
    infoEl.innerHTML = 'Workers: <span id="worker-count">1</span> thread';
  } else if (isMulti) {
    infoEl.innerHTML = `Workers: <span id="worker-count">${totalCores}</span> threads`;
  }
}

function getWorkerCount() {
  const mode = document.querySelector('input[name="crack-mode"]:checked').value;
  if (mode === 'single') return 1;
  if (mode === 'multi') return totalCores;
  return 1;
}

async function loadSubmissions() {
  try {
    const res = await fetch(API_BASE + '/api/hashes');
    if (!res.ok) return;
    const data = await res.json();
    submissions = Array.isArray(data) ? data : [];
    
    const filteredSubs = getFilteredSubmissions();
    renderTable(filteredSubs);
    
    document.getElementById('sub-count').textContent = submissions.length;
    populateTypeFilters();
    updateSummary();
    
    if (!crackingState.active) {
      updateStatus('IDLE');
    }
  } catch (e) {
    console.error('Error loading submissions:', e);
  }
}

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

function updateSummary() {
  const filtered = getFilteredSubmissions();
  const cracked = filtered.filter(s => s.cracked).length;
  const total = filtered.length;
  const remaining = total - cracked;
  const percent = total > 0 ? Math.round((cracked / total) * 100) : 0;
  
  document.getElementById('summary-total').textContent = total;
  document.getElementById('summary-cracked').textContent = `${cracked} (${percent}%)`;
  document.getElementById('summary-remaining').textContent = remaining;
  
  if (crackingState.startTime) {
    const elapsed = Date.now() - crackingState.startTime;
    document.getElementById('summary-time').textContent = formatDuration(elapsed);
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// CRACKING LOGIC - Main implementation
async function startCracking() {
  const uncracked = getFilteredUncracked();
  
  if (uncracked.length === 0) {
    updateStatus('ERROR', 'No uncracked hashes to process');
    return;
  }
  
  if (typeof workerPool === 'undefined') {
    updateStatus('ERROR', 'Worker pool not initialized');
    console.error('workerPool is not defined');
    return;
  }
  
  crackingState.active = true;
  crackingState.paused = false;
  crackingState.batch = uncracked;
  crackingState.batchIndex = 0;
  crackingState.startTime = Date.now();
  crackingState.crackedCount = 0;
  crackingState.totalAttempts = 0;
  
  updateStatus('CRACKING');
  document.getElementById('btn-start-crack').style.display = 'none';
  document.getElementById('btn-pause-crack').style.display = 'inline-block';
  document.getElementById('btn-stop-crack').style.display = 'inline-block';
  
  const numWorkers = getWorkerCount();
  console.log(`Starting cracking with ${numWorkers} workers, ${uncracked.length} hashes`);
  
  workerPool.maxWorkers = numWorkers;
  
  await processBatch();
}

async function processBatch() {
  while (crackingState.batchIndex < crackingState.batch.length && crackingState.active && !crackingState.paused) {
    const submission = crackingState.batch[crackingState.batchIndex];
    crackingState.currentId = submission.id;
    crackingState.currentHash = submission.hash;
    
    document.getElementById('metric-hash').textContent = submission.hash.substring(0, 16) + '...';
    document.getElementById('metric-phase').textContent = `Hash ${crackingState.batchIndex + 1} of ${crackingState.batch.length}`;
    
    const passwordType = PasswordSpaces.getMetadata(submission.passwordTypeId);
    if (!passwordType) {
      console.error('Unknown password type:', submission.passwordTypeId);
      crackingState.batchIndex++;
      continue;
    }
    
    const useDictionary = document.getElementById('opt-dictionary')?.checked && crackingState.dictionary && crackingState.dictionary.length > 0;
    const truncationMode = document.getElementById('opt-truncation')?.value || 'full';
    
    const options = {
      dictionary: useDictionary ? crackingState.dictionary : [],
      truncationMode: truncationMode,
      onProgress: updateProgress
    };
    
    try {
      const result = await workerPool.crack(submission.hash, passwordType, options);
      
      if (result.password) {
        console.log(`✅ Cracked ${submission.hash}: ${result.password} (${result.attempts} attempts, ${result.duration}ms)`);
        await saveCrackedPassword(submission.id, result.password, result.attempts, result.duration);
        crackingState.crackedCount++;
      } else {
        console.log(`❌ Failed to crack ${submission.hash} after ${result.attempts} attempts`);
      }
      
      crackingState.totalAttempts += result.attempts;
      
    } catch (err) {
      console.error('Error cracking hash:', err);
    }
    
    crackingState.batchIndex++;
    updateSummary();
  }
  
  if (crackingState.batchIndex >= crackingState.batch.length) {
    finishCracking();
  }
}

function updateProgress(progress) {
  document.getElementById('metric-candidate').textContent = progress.current || '—';
  document.getElementById('metric-speed').textContent = formatSpeed(progress.speed || 0);
  document.getElementById('metric-attempts').textContent = `${formatNumber(progress.attempts || 0)} / ${formatNumber(progress.total || 0)}`;
  
  if (crackingState.startTime) {
    const elapsed = Date.now() - crackingState.startTime;
    document.getElementById('metric-elapsed').textContent = formatTime(elapsed);
  }
  
  if (progress.total && progress.attempts) {
    const percent = Math.min(100, (progress.attempts / progress.total) * 100);
    document.getElementById('progress-fill').style.width = percent + '%';
    document.getElementById('progress-text').textContent = Math.round(percent) + '%';
    
    if (progress.speed > 0 && progress.total > progress.attempts) {
      const remaining = progress.total - progress.attempts;
      const eta = Math.ceil(remaining / progress.speed) * 1000;
      document.getElementById('metric-estimated').textContent = formatTime(eta);
    }
  }
  
  const phaseText = progress.phase === 'dictionary' ? 'Dictionary attack' : 'Brute-force';
  document.getElementById('metric-phase').textContent = `${phaseText} - Hash ${crackingState.batchIndex + 1} of ${crackingState.batch.length}`;
}

function formatSpeed(speed) {
  if (speed >= 1000000) return (speed / 1000000).toFixed(1) + ' MH/s';
  if (speed >= 1000) return (speed / 1000).toFixed(1) + ' KH/s';
  return Math.round(speed) + ' H/s';
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatTime(ms) {
  if (ms < 1000) return ms + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

async function saveCrackedPassword(id, password, attempts, durationMs) {
  try {
    const res = await fetch(API_BASE + `/api/crack/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: password,
        attempts: attempts,
        crackedAt: Date.now(),
        crackDurationMs: durationMs
      })
    });
    
    if (res.ok) {
      const sub = submissions.find(s => s.id === id);
      if (sub) {
        sub.password = password;
        sub.cracked = true;
        sub.crackedAt = Date.now();
        sub.attempts = attempts;
        sub.crackDurationMs = durationMs;
      }
      
      const crackedCell = document.getElementById('crack-' + id);
      if (crackedCell) {
        crackedCell.innerHTML = '✅ <strong>' + password + '</strong>';
        crackedCell.style.color = '#4cff80';
      }
    } else {
      console.error('Failed to save cracked password:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Failed to save cracked password:', err);
  }
}

function finishCracking() {
  crackingState.active = false;
  crackingState.paused = false;
  
  updateStatus('COMPLETE', `${crackingState.crackedCount} passwords cracked`);
  
  document.getElementById('btn-start-crack').style.display = 'inline-block';
  document.getElementById('btn-pause-crack').style.display = 'none';
  document.getElementById('btn-stop-crack').style.display = 'none';
  
  document.getElementById('progress-fill').style.width = '100%';
  document.getElementById('progress-text').textContent = '100%';
  
  loadSubmissions();
}

function pauseCracking() {
  crackingState.paused = true;
  updateStatus('PAUSED');
  document.getElementById('btn-pause-crack').textContent = '▶️ RESUME';
  document.getElementById('btn-pause-crack').removeEventListener('click', pauseCracking);
  document.getElementById('btn-pause-crack').addEventListener('click', resumeCracking);
  
  if (workerPool) {
    workerPool.cancel();
  }
}

function resumeCracking() {
  crackingState.paused = false;
  updateStatus('CRACKING');
  document.getElementById('btn-pause-crack').textContent = '⏸️ PAUSE';
  document.getElementById('btn-pause-crack').removeEventListener('click', resumeCracking);
  document.getElementById('btn-pause-crack').addEventListener('click', pauseCracking);
  
  processBatch();
}

function stopCracking() {
  crackingState.active = false;
  crackingState.paused = false;
  
  if (workerPool) {
    workerPool.cancel();
  }
  
  updateStatus('IDLE', 'Stopped by user');
  
  document.getElementById('btn-start-crack').style.display = 'inline-block';
  document.getElementById('btn-pause-crack').style.display = 'none';
  document.getElementById('btn-stop-crack').style.display = 'none';
  
  document.getElementById('metric-hash').textContent = '—';
  document.getElementById('metric-candidate').textContent = '—';
  document.getElementById('metric-speed').textContent = '0 H/s';
  document.getElementById('metric-attempts').textContent = '0 / 0';
  document.getElementById('metric-estimated').textContent = '—';
  document.getElementById('metric-phase').textContent = 'Stopped';
  
  loadSubmissions();
}

function downloadGPUScript() {
  const uncracked = getFilteredUncracked();
  
  if (uncracked.length === 0) {
    alert('No uncracked hashes to export');
    return;
  }
  
  let script = '#!/usr/bin/env python3\n';
  script += '# GPU Password Cracking Script\n';
  script += '# Generated by Password Hack Demo App\n\n';
  script += 'hashes = [\n';
  
  uncracked.forEach(sub => {
    script += `    {"hash": "${sub.hash}", "type": "${sub.passwordTypeId}", "id": "${sub.id}"},\n`;
  });
  
  script += ']\n\n';
  script += '# Use hashcat or similar tool to crack these hashes\n';
  script += '# Example: hashcat -m 0 -a 3 hashes.txt ?d?d?d?d?d?d?d?d\n';
  
  const blob = new Blob([script], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gpu-crack-' + new Date().toISOString().split('T')[0] + '.py';
  a.click();
  URL.revokeObjectURL(url);
}

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
      '<td><code style="color:#4c9aff;font-size:0.85em">' + (s.passwordTypeId || '?') + '</code></td>' +
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

function guessDeviceType(ua) {
  if (!ua || ua === 'unknown') return '❓ Unknown';
  if (/bot|crawler|spider|headless|python|curl|wget|go-http/i.test(ua)) return '🤖 Bot';
  if (/iphone/i.test(ua)) return '📱 iPhone (iOS)';
  if (/ipad/i.test(ua)) return '📟 iPad (iOS)';
  if (/android/i.test(ua) && /mobile/i.test(ua)) return '📱 Android';
  if (/android/i.test(ua)) return '📟 Android Tablet';
  if (/windows phone/i.test(ua)) return '📱 Windows Phone';
  if (/blackberry|bb10/i.test(ua)) return '📱 BlackBerry';
  if (/windows nt/i.test(ua)) return '🖥 Desktop (Windows)';
  if (/macintosh|mac os x/i.test(ua)) return '🖥 Desktop (macOS)';
  if (/cros/i.test(ua)) return '🖥 Desktop (ChromeOS)';
  if (/linux/i.test(ua)) return '🖥 Desktop (Linux)';
  return '🖥 Desktop';
}

function formatCrackDuration(sub) {
  if (!sub.crackDurationMs) return '';
  const ms = sub.crackDurationMs;
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const minutes = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${secs}s`;
}

function showMeta(sub) {
  const payload = {
    id: sub.id,
    hash: sub.hash,
    spaceId: sub.spaceId,
    passwordTypeId: sub.passwordTypeId,
    submitted: sub.submitted ? new Date(sub.submitted).toISOString() : null,
    cracked: sub.cracked,
    password: sub.password || null,
    crackedAt: sub.crackedAt ? new Date(sub.crackedAt).toISOString() : null,
    attempts: sub.attempts,
    crackDurationMs: sub.crackDurationMs || null,
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

async function deleteSingle(id) {
  await fetch(API_BASE + '/api/hash/' + id, { method: 'DELETE' });
  loadSubmissions();
}

async function deleteAll() {
  if (!confirm('Delete ALL submissions?')) return;
  await fetch(API_BASE + '/api/clear', { method: 'POST' });
  loadSubmissions();
}

function exportCSV() {
  const filteredSubs = getFilteredSubmissions();
  if (filteredSubs.length === 0) {
    alert('No submissions to export');
    return;
  }
  
  let csv = 'ID,Hash,Type,Password,Cracked,Submitted,CrackedAt,Attempts,CrackDurationMs,SpaceId,Device,IP\n';
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
      s.crackDurationMs || '',
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

async function loadSpacesAdmin() {
  const tbody = document.getElementById('spaces-tbody');
  if (!tbody) return;
  try {
    const res = await fetch(API_BASE + '/api/spaces');
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
      await fetch(API_BASE + '/api/spaces/' + id, { method: 'DELETE' });
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
    const res = await fetch(API_BASE + '/api/spaces', {
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