// instructor.js - Instructor Dashboard Logic

const DEFAULT_POLL_INTERVAL = 0; // Off by default
let pollTimer = null;
let isCracking = false;
let crackTimer = null;
let currentCrackIndex = 0;
let submissions = [];

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadSubmissions();
  
  // Wire up poll interval dropdown
  const pollSelect = document.getElementById('poll-interval-select');
  if (pollSelect) {
    pollSelect.addEventListener('change', () => {
      const val = parseInt(pollSelect.value, 10);
      startPolling(isNaN(val) ? 0 : val);
    });
    // Start with default (Off)
    startPolling(DEFAULT_POLL_INTERVAL);
  }
  
  document.getElementById('btn-delete-all').addEventListener('click', deleteAll);
  document.getElementById('btn-crack-all').addEventListener('click', crackAll);
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

// --- Load submissions from API ---
async function loadSubmissions() {
  try {
    const res = await fetch('/api/hashes');
    if (!res.ok) return;
    const data = await res.json();
    submissions = Array.isArray(data) ? data : [];
    renderTable(submissions);
    document.getElementById('sub-count').textContent = submissions.length;
  } catch (e) {
    console.error('Poll error:', e);
  }
}

// --- Device type + OS from User Agent ---
function guessDeviceType(ua) {
  if (!ua || ua === 'unknown') return '\u2753 Unknown';
  if (/bot|crawler|spider|headless|python|curl|wget|go-http/i.test(ua)) return '\uD83E\uDD16 Bot';

  // Mobile OS
  if (/iphone/i.test(ua))                          return '\uD83D\uDCF1 iPhone (iOS)';
  if (/ipad/i.test(ua))                            return '\uD83D\uDCDF iPad (iOS)';
  if (/android/i.test(ua) && /mobile/i.test(ua))  return '\uD83D\uDCF1 Android';
  if (/android/i.test(ua))                         return '\uD83D\uDCDF Android Tablet';
  if (/windows phone/i.test(ua))                   return '\uD83D\uDCF1 Windows Phone';
  if (/blackberry|bb10/i.test(ua))                 return '\uD83D\uDCF1 BlackBerry';

  // Desktop OS
  if (/windows nt/i.test(ua))                      return '\uD83D\uDDA5 Desktop (Windows)';
  if (/macintosh|mac os x/i.test(ua))              return '\uD83D\uDDA5 Desktop (macOS)';
  if (/cros/i.test(ua))                            return '\uD83D\uDDA5 Desktop (ChromeOS)';
  if (/linux/i.test(ua))                           return '\uD83D\uDDA5 Desktop (Linux)';

  return '\uD83D\uDDA5 Desktop';
}

// --- Crack duration ---
function formatCrackDuration(sub) {
  if (!sub.crackedAt || !sub.submitted) return '';
  const ms = sub.crackedAt - sub.submitted;
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
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

// --- Show metadata modal ---
function showMeta(sub) {
  const payload = {
    id:        sub.id,
    hash:      sub.hash,
    spaceId:   sub.spaceId,
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

// --- Render table ---
function renderTable(subs) {
  const tbody = document.getElementById('submissions-tbody');
  tbody.innerHTML = '';
  if (subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#666">No submissions yet. Waiting...</td></tr>';
    return;
  }
  subs.forEach((s, i) => {
    const cracked = s.cracked && s.password;
    const dur = cracked ? formatCrackDuration(s) : '';
    const tr = document.createElement('tr');
    tr.id = 'row-' + s.id;
    tr.style.background = cracked ? 'rgba(0,180,80,0.08)' : (i % 2 === 0 ? '#12121f' : '#0d0d1a');
    const crackedCell = cracked
      ? '\u2705 <strong>' + s.password + '</strong>' +
        (dur ? '<br><span style="font-size:0.75em;color:#888;font-weight:normal">cracked in ' + dur + '</span>' : '')
      : '<span style="color:#555">\u2014</span>';
    tr.innerHTML =
      '<td style="text-align:center;color:#666;font-size:0.85em">' + (i + 1) + '</td>' +
      '<td><code title="' + s.hash + '" style="font-size:0.8em;cursor:help;color:#aaa">' + s.hash.substring(0, 12) + '\u2026</code></td>' +
      '<td id="crack-' + s.id + '" style="font-weight:bold;color:' + (cracked ? '#4cff80' : '#555') + '">' + crackedCell + '</td>' +
      '<td style="font-size:0.88em">' + guessDeviceType(s.meta && s.meta.userAgent) + '</td>' +
      '<td style="font-family:monospace;font-size:0.82em;color:#aaa">' + ((s.meta && s.meta.ip) || '\u2014') + '</td>' +
      '<td style="font-size:0.85em;color:#aaa">' + (s.spaceId || '\u2014') + '</td>' +
      '<td style="font-size:0.82em;color:#777">' + (s.submitted ? new Date(s.submitted).toLocaleTimeString() : '\u2014') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button class="btn-sm btn-crack" data-action="crack" data-id="' + s.id + '" title="Crack this hash">\u26A1</button> ' +
        '<button class="btn-sm btn-info"  data-action="info"  data-id="' + s.id + '" title="Show all metadata">\uD83D\uDD0D</button> ' +
        '<button class="btn-sm btn-danger" data-action="delete" data-id="' + s.id + '" title="Delete">\u2715</button>' +
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
    if (action === 'crack')  crackSingle(id, sub.hash);
    if (action === 'info')   showMeta(sub);
  };
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

// --- Crack single entry ---
function crackSingle(id, hash) {
  const cell = document.getElementById('crack-' + id);
  if (!cell) return;
  cell.textContent = 'Cracking\u2026';
  cell.style.color = '#888';
  bruteForce(hash, (pwd, attempts, ms) => {
    if (pwd) {
      cell.innerHTML = '\u2705 <strong>' + pwd + '</strong>' +
        '<br><span style="font-size:0.75em;color:#888;font-weight:normal">' +
        attempts.toLocaleString() + ' attempts, ' + ms + 'ms</span>';
      cell.style.color = '#4cff80';
      playSound('win');
      fetch('/api/hash/' + id, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: pwd, attempts})
      });
    } else {
      cell.textContent = 'Not found';
      cell.style.color = '#f66';
      playSound('fail');
    }
  });
}

// --- Crack all sequentially ---
function crackAll() {
  if (isCracking) return;
  isCracking = true;
  currentCrackIndex = 0;
  crackNext();
}

function crackNext() {
  if (currentCrackIndex >= submissions.length) {
    isCracking = false;
    return;
  }
  const s = submissions[currentCrackIndex];
  currentCrackIndex++;
  const cell = document.getElementById('crack-' + s.id);
  if (!cell) { crackNext(); return; }
  cell.textContent = 'Cracking\u2026';
  cell.style.color = '#888';
  bruteForce(s.hash, (pwd, attempts, ms) => {
    if (pwd) {
      cell.innerHTML = '\u2705 <strong>' + pwd + '</strong>' +
        '<br><span style="font-size:0.75em;color:#888;font-weight:normal">' +
        attempts.toLocaleString() + ' attempts, ' + ms + 'ms</span>';
      cell.style.color = '#4cff80';
      fetch('/api/hash/' + s.id, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: pwd, attempts})
      });
    } else {
      cell.textContent = 'Not found';
      cell.style.color = '#f66';
    }
    setTimeout(crackNext, 200);
  });
}

// --- Brute force engine (DDMMYYYY birthday passwords) ---
async function bruteForce(targetHash, callback) {
  const start = Date.now();
  let attempts = 0;
  for (let year = 2020; year >= 1940; year--) {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 31; day++) {
        const candidate = String(day).padStart(2,'0') + String(month).padStart(2,'0') + String(year);
        attempts++;
        const hash = await sha256(candidate);
        if (hash === targetHash) {
          callback(candidate, attempts, Date.now() - start);
          return;
        }
        if (attempts % 1000 === 0) {
          updateProgress(candidate, attempts);
          await sleep(0);
        }
      }
    }
  }
  callback(null, attempts, Date.now() - start);
}

function updateProgress(current, attempts) {
  const el = document.getElementById('crack-progress');
  if (el) el.textContent = 'Trying: ' + current + ' | Attempts: ' + attempts.toLocaleString();
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
    const spaces = await res.json(); // Backend returns direct array
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
