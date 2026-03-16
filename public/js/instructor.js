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
  currentPhase: null   // tracks active phase for speed-avg reset on phase switch
};
let submissions = [];
let allSpaces = [];
let currentSpace = null;
let progressInterval = null;
let totalCores = navigator.hardwareConcurrency || 4;

// --- Throttled UI state for Candidate / Speed / Estimated ---
const STATS_UI_UPDATE_MS = 5000;
let lastStatsUiUpdateAt = 0;
let latestStatsUi = { candidate: '—', speed: '0 H/s', estimated: '—' };

function flushThrottledStatsUi(force = false) {
  const now = Date.now();
  if (!force && now - lastStatsUiUpdateAt < STATS_UI_UPDATE_MS) return;
  document.getElementById('metric-candidate').textContent = latestStatsUi.candidate;
  document.getElementById('metric-speed').textContent     = latestStatsUi.speed;
  document.getElementById('metric-estimated').textContent = latestStatsUi.estimated;
  lastStatsUiUpdateAt = now;
}

// --- #3: Dictionary cache (per cracking session, keyed by passwordTypeId) ---
// Cleared at startCracking() so a new session always re-fetches fresh lists.
const sessionDictionaryCache = new Map();
// ---------------------------------------------------------------------------

function getApiBaseUrl() {
  const hostname = window.location.hostname;
  if (hostname.includes('.pages.dev')) {
    return 'https://pw-hack-demo.apps.zengel.cloud';
  }
  return '';
}

const API_BASE = getApiBaseUrl();

function getDictionaryInfo(passwordTypeId) {
  const type = PasswordSpaces.getMetadata(passwordTypeId);
  if (!type || !type.bruteForceStrategy) return { count: 0, urls: [], tooltip: '' };
  
  const strategy = type.bruteForceStrategy;
  const urls = strategy.dictionaryUrls || [];
  const count = urls.length;
  
  if (count === 0 || !strategy.dictionarySupport) {
    return { count: 0, urls: [], tooltip: 'No dictionary support' };
  }
  
  const tooltip = `Uses ${count} ${count === 1 ? 'dictionary' : 'dictionaries'}:\n` + 
                  urls.map(url => '• ' + url.split('/').pop()).join('\n');
  
  return { count, urls, tooltip };
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('API Base URL:', API_BASE || '(relative paths)');
  
  await PasswordSpaces.init();
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
  document.getElementById('btn-pause-crack').addEventListener('click', togglePause);
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

function startPolling(intervalMs) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
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
    if (!res.ok) { console.error('Failed to load spaces'); return; }
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
    
    if (currentSpace) await loadSubmissions();
    
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
  const availableTypes = PasswordSpaces.types || [];
  
  if (availableTypes.length === 0) {
    container.innerHTML = '<div style="color:#888;font-size:0.9em">Loading password types...</div>';
    return;
  }
  
  container.innerHTML = '';
  
  availableTypes.forEach(type => {
    const dictInfo = getDictionaryInfo(type.id);
    const count = filteredSubs.filter(s => s.passwordTypeId === type.id && !s.cracked).length;
    const defaultChecked = type.id === 'birthday';
    
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.title = dictInfo.tooltip;
    
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
  const isGPU    = mode === 'gpu';
  const isSingle = mode === 'single';
  const isMulti  = mode === 'multi';
  
  document.getElementById('btn-start-crack').style.display  = isGPU ? 'none' : 'inline-block';
  document.getElementById('btn-download-gpu').style.display = isGPU ? 'inline-block' : 'none';
  
  const infoEl = document.getElementById('mode-info');
  if (!infoEl) return;
  
  if (isGPU)         infoEl.innerHTML = 'Export: <span>Python script</span>';
  else if (isSingle) infoEl.innerHTML = 'Workers: <span id="worker-count">1</span> thread';
  else if (isMulti)  infoEl.innerHTML = `Workers: <span id="worker-count">${totalCores}</span> threads`;
}

function getWorkerCount() {
  const mode = document.querySelector('input[name="crack-mode"]:checked').value;
  if (mode === 'single') return 1;
  if (mode === 'multi')  return totalCores;
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
    
    if (!crackingState.active) updateStatus('IDLE');
  } catch (e) {
    console.error('Error loading submissions:', e);
  }
}

function updateStatus(status, message = '') {
  const statusEl = document.getElementById('crack-status');
  if (!statusEl) return;
  
  const map = {
    IDLE:     { text: 'Ready',      color: '#4cff80' },
    CRACKING: { text: 'Cracking...', color: '#ffaa00' },
    PAUSED:   { text: 'Paused',     color: '#ff8800' },
    COMPLETE: { text: 'Complete',   color: '#4cff80' },
    ERROR:    { text: 'Error',      color: '#f66'    }
  };
  const s = map[status] || { text: status, color: '#888' };
  statusEl.textContent = s.text + (message ? ': ' + message : '');
  statusEl.style.color = s.color;
}

function updateSummary() {
  const filtered = getFilteredSubmissions();
  const cracked   = filtered.filter(s => s.cracked).length;
  const total     = filtered.length;
  const remaining = total - cracked;
  const percent   = total > 0 ? Math.round((cracked / total) * 100) : 0;
  
  document.getElementById('summary-total').textContent     = total;
  document.getElementById('summary-cracked').textContent   = `${cracked} (${percent}%)`;
  document.getElementById('summary-remaining').textContent = remaining;
  
  if (crackingState.startTime) {
    document.getElementById('summary-time').textContent =
      formatDuration(Date.now() - crackingState.startTime);
  }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

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
  
  // #3: Clear dictionary cache so this session always starts with fresh lists
  sessionDictionaryCache.clear();
  console.log('[Dict] Session cache cleared for new cracking run');
  
  crackingState.active       = true;
  crackingState.paused       = false;
  crackingState.batch        = uncracked;
  crackingState.batchIndex   = 0;
  crackingState.startTime    = Date.now();
  crackingState.crackedCount = 0;
  crackingState.totalAttempts = 0;
  crackingState.currentPhase = null;
  
  lastStatsUiUpdateAt = 0;
  latestStatsUi = { candidate: '—', speed: '0 H/s', estimated: '—' };
  flushThrottledStatsUi(true);
  
  const numWorkers = getWorkerCount();
  console.log(`Starting cracking with ${numWorkers} workers, ${uncracked.length} hashes`);
  workerPool.setWorkerCount(numWorkers);
  
  if (typeof ProgressLogger !== 'undefined') ProgressLogger.startSession();
  
  updateStatus('CRACKING');
  document.getElementById('btn-start-crack').style.display  = 'none';
  document.getElementById('btn-pause-crack').style.display  = 'inline-block';
  document.getElementById('btn-stop-crack').style.display   = 'inline-block';
  
  await processBatch();
}

async function processBatch() {
  while (
    crackingState.batchIndex < crackingState.batch.length &&
    crackingState.active &&
    !crackingState.paused
  ) {
    const submission = crackingState.batch[crackingState.batchIndex];
    crackingState.currentId   = submission.id;
    crackingState.currentHash = submission.hash;
    crackingState.currentPhase = null;  // reset phase tracking per hash
    
    document.getElementById('metric-hash').textContent  = submission.hash.substring(0, 16) + '...';
    document.getElementById('metric-phase').textContent = `Hash ${crackingState.batchIndex + 1} of ${crackingState.batch.length}`;
    
    const passwordType = PasswordSpaces.getMetadata(submission.passwordTypeId);
    if (!passwordType) {
      console.error('Unknown password type:', submission.passwordTypeId);
      crackingState.batchIndex++;
      continue;
    }
    
    if (typeof ProgressLogger !== 'undefined') {
      ProgressLogger.onHashStart(submission.id, submission.hash, submission.passwordTypeId);
    }
    
    const useDictionary  = document.getElementById('opt-dictionary')?.checked;
    const truncationMode = document.getElementById('opt-truncation')?.value || 'full';
    
    // #3: Load dictionary once per type per session using cache
    let dictionary = [];
    if (useDictionary && typeof dictionaryLoader !== 'undefined') {
      const typeId = passwordType.id;
      if (sessionDictionaryCache.has(typeId)) {
        dictionary = sessionDictionaryCache.get(typeId);
        console.log(`[Dict] Cache HIT for ${typeId}: ${dictionary.length} words`);
      } else {
        try {
          console.log(`[Dict] Cache MISS for ${typeId} — loading...`);
          dictionary = await dictionaryLoader.loadForType(passwordType);
          sessionDictionaryCache.set(typeId, dictionary);
          if (dictionary.length === 0) {
            console.warn(`⚠️ Dictionary empty for ${typeId} — brute-force only`);
            updateStatus('CRACKING', 'Dictionary unavailable — using brute-force');
          } else {
            console.log(`✅ Loaded & cached ${dictionary.length} words for ${typeId}`);
            updateStatus('CRACKING');
          }
        } catch (e) {
          console.error('Failed to load dictionary for type:', typeId, e);
          updateStatus('CRACKING', 'Dictionary error — using brute-force only');
          dictionary = [];
          sessionDictionaryCache.set(typeId, []); // cache the failure so we don't retry
        }
      }
    }
    
    // #4: onPhaseChange is now in options so the pool can call it directly.
    // #5: When the phase changes, reset the speed rolling avg via ProgressLogger.
    const options = {
      dictionary,
      truncationMode,
      onPhaseChange: (phase, threadCount) => {
        // #5: Reset speed average on every phase transition
        if (phase !== crackingState.currentPhase) {
          crackingState.currentPhase = phase;
          if (typeof ProgressLogger !== 'undefined') {
            ProgressLogger.onPhaseChange(phase, submission.id);
            if (typeof ProgressLogger.resetSpeedAverage === 'function') {
              ProgressLogger.resetSpeedAverage();
            }
          }
          console.log(`[Phase] → ${phase} (${threadCount} thread${threadCount > 1 ? 's' : ''})`);
        }
      },
      onProgress: (progress) => {
        updateProgress(progress);
        if (typeof ProgressLogger !== 'undefined') {
          ProgressLogger.onProgress(progress);
        }
      }
    };
    
    const hashStartTime = Date.now();
    
    try {
      const result = await workerPool.crack(submission.hash, passwordType, options);
      const hashDuration = Date.now() - hashStartTime;
      
      if (result.password) {
        console.log(`✅ Cracked ${submission.hash}: ${result.password} (${result.attempts} attempts, ${result.duration}ms)`);
        await saveCrackedPassword(submission.id, result.password, result.attempts, result.duration);
        crackingState.crackedCount++;
        if (typeof ProgressLogger !== 'undefined') {
          ProgressLogger.onHashCracked(submission.id, result.password, result.attempts, hashDuration);
        }
      } else {
        console.log(`❌ Failed to crack ${submission.hash} after ${result.attempts} attempts`);
        if (typeof ProgressLogger !== 'undefined') {
          ProgressLogger.onHashFailed(submission.id, result.attempts, hashDuration);
        }
      }
      
      crackingState.totalAttempts += result.attempts;
      
    } catch (err) {
      console.error('Error cracking hash:', err);
      if (typeof ProgressLogger !== 'undefined') {
        ProgressLogger.logEvent('error', `Error cracking hash: ${err.message}`);
      }
    }
    
    crackingState.batchIndex++;
    updateSummary();
  }
  
  if (crackingState.batchIndex >= crackingState.batch.length) finishCracking();
}

function updateProgress(progress) {
  latestStatsUi.candidate = progress.current || '—';
  latestStatsUi.speed     = formatSpeed(progress.speed || 0);

  document.getElementById('metric-attempts').textContent =
    `${formatNumber(progress.attempts || 0)} / ${formatNumber(progress.total || 0)}`;

  if (crackingState.startTime) {
    document.getElementById('metric-elapsed').textContent =
      formatTime(Date.now() - crackingState.startTime);
  }

  if (progress.total && progress.attempts) {
    const percent = Math.min(100, (progress.attempts / progress.total) * 100);
    document.getElementById('progress-fill').style.width = percent + '%';
    document.getElementById('progress-text').textContent = Math.round(percent) + '%';

    if (progress.speed > 0 && progress.total > progress.attempts) {
      const remaining = progress.total - progress.attempts;
      latestStatsUi.estimated = formatTime(Math.ceil(remaining / progress.speed) * 1000);
    } else {
      latestStatsUi.estimated = '—';
    }
  }

  const phaseText = progress.phase === 'dictionary' ? 'Dictionary attack' : 'Brute-force';
  document.getElementById('metric-phase').textContent =
    `${phaseText} — Hash ${crackingState.batchIndex + 1} of ${crackingState.batch.length}`;

  flushThrottledStatsUi(false);
}

function formatSpeed(speed) {
  if (speed >= 1000000) return (speed / 1000000).toFixed(1) + ' MH/s';
  if (speed >= 1000)    return (speed / 1000).toFixed(1) + ' KH/s';
  return Math.round(speed) + ' H/s';
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000)    return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatTime(ms) {
  if (ms < 1000) return ms + 'ms';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

async function saveCrackedPassword(id, password, attempts, durationMs) {
  try {
    const res = await fetch(API_BASE + `/api/crack/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, attempts, crackedAt: Date.now(), crackDurationMs: durationMs })
    });
    
    if (res.ok) {
      const sub = submissions.find(s => s.id === id);
      if (sub) {
        sub.password = password; sub.cracked = true;
        sub.crackedAt = Date.now(); sub.attempts = attempts; sub.crackDurationMs = durationMs;
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
  crackingState.active  = false;
  crackingState.paused  = false;
  
  if (typeof ProgressLogger !== 'undefined') ProgressLogger.endSession('complete');
  
  updateStatus('COMPLETE', `${crackingState.crackedCount} passwords cracked`);
  
  document.getElementById('btn-start-crack').style.display = 'inline-block';
  document.getElementById('btn-pause-crack').style.display = 'none';
  document.getElementById('btn-stop-crack').style.display  = 'none';
  document.getElementById('btn-pause-crack').textContent   = '⏸️ PAUSE';
  document.getElementById('progress-fill').style.width     = '100%';
  document.getElementById('progress-text').textContent     = '100%';

  flushThrottledStatsUi(true);
  loadSubmissions();
}

function togglePause() {
  if (crackingState.paused) resumeCracking(); else pauseCracking();
}

function pauseCracking() {
  crackingState.paused = true;
  updateStatus('PAUSED');
  document.getElementById('btn-pause-crack').textContent = '▶️ RESUME';
  if (typeof ProgressLogger !== 'undefined') ProgressLogger.logEvent('warning', '⏸️ Cracking paused');
  if (workerPool) workerPool.cancel();
}

function resumeCracking() {
  crackingState.paused = false;
  updateStatus('CRACKING');
  document.getElementById('btn-pause-crack').textContent = '⏸️ PAUSE';
  if (typeof ProgressLogger !== 'undefined') ProgressLogger.logEvent('info', '▶️ Cracking resumed');
  workerPool.setWorkerCount(getWorkerCount());
  processBatch();
}

function stopCracking() {
  crackingState.active = false;
  crackingState.paused = false;
  
  if (workerPool) workerPool.cancel();
  if (typeof ProgressLogger !== 'undefined') ProgressLogger.endSession('stopped by user');
  
  updateStatus('IDLE', 'Stopped by user');
  
  document.getElementById('btn-start-crack').style.display = 'inline-block';
  document.getElementById('btn-pause-crack').style.display = 'none';
  document.getElementById('btn-stop-crack').style.display  = 'none';
  document.getElementById('btn-pause-crack').textContent   = '⏸️ PAUSE';
  
  document.getElementById('progress-fill').style.width     = '0%';
  document.getElementById('progress-text').textContent     = '0%';
  document.getElementById('metric-hash').textContent       = '—';
  document.getElementById('metric-attempts').textContent   = '0 / 0';
  document.getElementById('metric-elapsed').textContent    = '00:00';
  document.getElementById('metric-phase').textContent      = 'Stopped';

  latestStatsUi = { candidate: '—', speed: '0 H/s', estimated: '—' };
  flushThrottledStatsUi(true);
  loadSubmissions();
}

async function downloadGPUScript() {
  const uncracked = getFilteredUncracked();
  if (uncracked.length === 0) { alert('No uncracked hashes to export'); return; }
  
  const filtered = getFilteredSubmissions();
  const exportMetadata = {
    instructorSession: crypto.randomUUID(),
    totalSubmissions: filtered.length,
    crackedCount: filtered.filter(s => s.cracked).length,
    browserAttempts: crackingState.totalAttempts,
    browserDurationMs: crackingState.startTime ? (Date.now() - crackingState.startTime) : 0,
    stoppedReason: crackingState.active ? 'export_during_session' : 'user_export'
  };
  
  try {
    const res = await fetch(API_BASE + '/api/export-gpu-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remainingHashes: uncracked.map(h => h.id), exportMetadata })
    });
    
    if (!res.ok) { alert('Failed to export GPU script: ' + res.status); return; }
    
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'gpu-cracker-' + new Date().toISOString().split('T')[0] + '.py';
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('✅ GPU script exported successfully');
    if (typeof ProgressLogger !== 'undefined') {
      ProgressLogger.logEvent('info', `📥 GPU script exported for ${uncracked.length} hashes`);
    }
  } catch (e) {
    console.error('Failed to export GPU script:', e);
    alert('Network error exporting GPU script');
  }
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
    const id  = btn.getAttribute('data-id');
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
  if (/iphone/i.test(ua))                                               return '📱 iPhone (iOS)';
  if (/ipad/i.test(ua))                                                 return '📟 iPad (iOS)';
  if (/android/i.test(ua) && /mobile/i.test(ua))                       return '📱 Android';
  if (/android/i.test(ua))                                              return '📟 Android Tablet';
  if (/windows phone/i.test(ua))                                        return '📱 Windows Phone';
  if (/blackberry|bb10/i.test(ua))                                      return '📱 BlackBerry';
  if (/windows nt/i.test(ua))                                           return '🖥 Desktop (Windows)';
  if (/macintosh|mac os x/i.test(ua))                                   return '🖥 Desktop (macOS)';
  if (/cros/i.test(ua))                                                 return '🖥 Desktop (ChromeOS)';
  if (/linux/i.test(ua))                                                return '🖥 Desktop (Linux)';
  return '🖥 Desktop';
}

function formatCrackDuration(sub) {
  if (!sub.crackDurationMs) return '';
  const ms = sub.crackDurationMs;
  if (ms < 1000)  return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const minutes = Math.floor(ms / 60000);
  return `${minutes}m ${((ms % 60000) / 1000).toFixed(0)}s`;
}

function showMeta(sub) {
  const payload = {
    id: sub.id, hash: sub.hash, spaceId: sub.spaceId,
    passwordTypeId: sub.passwordTypeId,
    submitted:  sub.submitted  ? new Date(sub.submitted).toISOString()  : null,
    cracked:    sub.cracked,
    password:   sub.password   || null,
    crackedAt:  sub.crackedAt  ? new Date(sub.crackedAt).toISOString()  : null,
    attempts:   sub.attempts,
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
    (match) => {
      let cls = 'color:#ce9178';
      if (/^&quot;/.test(match))  cls = /:$/.test(match) ? 'color:#9cdcfe' : 'color:#ce9178';
      else if (/true|false/.test(match)) cls = 'color:#569cd6';
      else if (/null/.test(match))       cls = 'color:#808080';
      else                               cls = 'color:#b5cea8';
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
  if (filteredSubs.length === 0) { alert('No submissions to export'); return; }
  
  let csv = 'ID,Hash,Type,Password,Cracked,Submitted,CrackedAt,Attempts,CrackDurationMs,SpaceId,Device,IP\n';
  filteredSubs.forEach(s => {
    const device = guessDeviceType(s.meta && s.meta.userAgent).replace(/,/g, ';');
    csv += [
      s.id, s.hash, s.passwordTypeId || '', s.password || '',
      s.cracked ? 'Yes' : 'No',
      s.submitted  ? new Date(s.submitted).toISOString()  : '',
      s.crackedAt  ? new Date(s.crackedAt).toISOString()  : '',
      s.attempts || '', s.crackDurationMs || '', s.spaceId || '',
      '"' + device + '"', (s.meta && s.meta.ip) || ''
    ].join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
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
        '<td>' + s.id + '</td><td>' + s.name + '</td>' +
        '<td>' + (s.location || '-') + '</td><td>' + (s.description || '-') + '</td>' +
        '<td><button class="btn-sm btn-danger" data-spaceid="' + s.id + '">Delete</button></td>';
      tbody.appendChild(tr);
    });
    tbody.onclick = async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.getAttribute('data-spaceid');
      if (!id || !confirm('Delete space "' + id + '"?')) return;
      await fetch(API_BASE + '/api/spaces/' + id, { method: 'DELETE' });
      loadSpacesAdmin();
    };
  } catch (e) {
    console.error('Spaces load error:', e);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#f66">Network error: ' + e.message + '</td></tr>';
  }
}

async function saveSpaceFromForm() {
  const id          = (document.getElementById('space-id-input')?.value       || '').trim();
  const name        = (document.getElementById('space-name-input')?.value     || '').trim();
  const location    = (document.getElementById('space-location-input')?.value || '').trim();
  const description = (document.getElementById('space-desc-input')?.value     || '').trim();
  const status      = document.getElementById('space-save-status');
  
  if (!id || !name) {
    if (status) { status.textContent = 'ID and Name are required.'; status.style.color = '#f00'; }
    return;
  }
  try {
    const res = await fetch(API_BASE + '/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, location, description })
    });
    if (res.ok) {
      if (status) {
        status.textContent = 'Space saved!'; status.style.color = '#0f0';
        setTimeout(() => { status.textContent = ''; }, 2000);
      }
      ['space-id-input','space-name-input','space-location-input','space-desc-input']
        .forEach(elId => { const el = document.getElementById(elId); if (el) el.value = ''; });
      loadSpacesAdmin();
    } else {
      const d = await res.json();
      if (status) { status.textContent = d.error || 'Error saving space.'; status.style.color = '#f00'; }
    }
  } catch (e) {
    if (status) { status.textContent = 'Network error.'; status.style.color = '#f00'; }
  }
}