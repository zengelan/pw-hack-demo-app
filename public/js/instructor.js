// instructor.js - Instructor Dashboard Logic

const POLL_INTERVAL = 3000;
let pollTimer = null;
let isCracking = false;
let crackTimer = null;
let currentCrackIndex = 0;
let submissions = [];

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadSubmissions();
  pollTimer = setInterval(loadSubmissions, POLL_INTERVAL);
  document.getElementById('btn-delete-all').addEventListener('click', deleteAll);
  document.getElementById('btn-crack-all').addEventListener('click', crackAll);
  loadSpacesAdmin();
  const saveSpaceBtn = document.getElementById('btn-save-space');
  if (saveSpaceBtn) saveSpaceBtn.addEventListener('click', saveSpaceFromForm);
});

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

// --- Render table ---
function renderTable(subs) {
  const tbody = document.getElementById('submissions-tbody');
  tbody.innerHTML = '';
  if (subs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#666">No submissions yet. Waiting...</td></tr>';
    return;
  }
  subs.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.id = 'row-' + s.id;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td title="${s.hash}">${s.hash.substring(0, 16)}...</td>
      <td id="crack-${s.id}">${s.cracked ? (s.password || '-') : '-'}</td>
      <td>${s.meta?.country || '-'}</td>
      <td>${s.meta?.ip || '-'}</td>
      <td>${s.meta?.userAgent ? s.meta.userAgent.substring(0, 30) + '...' : '-'}</td>
      <td>${s.submitted ? new Date(s.submitted).toLocaleTimeString() : '-'}</td>
      <td>
        <button class="btn-sm btn-danger" data-action="delete" data-id="${s.id}">X</button>
        <button class="btn-sm btn-crack" data-action="crack" data-id="${s.id}">Crack</button>
      </td>
    `;
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
    if (action === 'crack') crackSingle(id, sub.hash);
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
  cell.textContent = 'Cracking...';
  bruteForce(hash, (pwd, attempts, ms) => {
    if (pwd) {
      cell.textContent = pwd + ' (' + attempts.toLocaleString() + ' attempts, ' + ms + 'ms)';
      cell.style.color = '#f00';
      playSound('win');
      // Update the hash entry on the server
      fetch('/api/hash/' + id, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: pwd, attempts})
      });
    } else {
      cell.textContent = 'Not found';
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
  cell.textContent = 'Cracking...';
  bruteForce(s.hash, (pwd, attempts, ms) => {
    if (pwd) {
      cell.textContent = pwd + ' (' + attempts.toLocaleString() + ' att, ' + ms + 'ms)';
      cell.style.color = '#f00';
      fetch('/api/hash/' + s.id, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password: pwd, attempts})
      });
    } else {
      cell.textContent = 'Not found';
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
    if (!res.ok) return;
    const data = await res.json();
    const spaces = data.spaces || [];
    tbody.innerHTML = '';
    if (spaces.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#666">No spaces yet. Create one below.</td></tr>';
      return;
    }
    spaces.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.id}</td>
        <td>${s.name}</td>
        <td>${s.location || '-'}</td>
        <td>${s.description || '-'}</td>
        <td><button class="btn-sm btn-danger" data-spaceid="${s.id}">Delete</button></td>
      `;
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
