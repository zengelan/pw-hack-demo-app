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
});

// --- Load submissions from API ---
async function loadSubmissions() {
  try {
    const res = await fetch('/api/list');
    if (!res.ok) return;
    const data = await res.json();
    submissions = data.submissions || [];
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
  subs.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.id = 'row-' + s.id;
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td title="${s.hash}">${s.hash.substring(0, 16)}...</td>
      <td id="crack-${s.id}">-</td>
      <td>${s.meta?.country || '-'}</td>
      <td>${s.meta?.ip || '-'}</td>
      <td>${s.meta?.browser || '-'}</td>
      <td>${new Date(s.timestamp).toLocaleTimeString()}</td>
      <td>
        <button class="btn-sm btn-danger" onclick="deleteSingle('${s.id}')">X</button>
        <button class="btn-sm btn-crack" onclick="crackSingle('${s.id}', '${s.hash}')">Crack</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Delete single ---
async function deleteSingle(id) {
  await fetch('/api/delete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id}) });
  loadSubmissions();
}

// --- Delete all ---
async function deleteAll() {
  if (!confirm('Delete ALL submissions?')) return;
  await fetch('/api/deleteAll', { method: 'POST' });
  loadSubmissions();
}

// --- Crack single entry ---
function crackSingle(id, hash) {
  const cell = document.getElementById('crack-' + id);
  cell.textContent = 'Cracking...';
  bruteForce(hash, (pwd, attempts, ms) => {
    if (pwd) {
      cell.textContent = pwd + ' (' + attempts.toLocaleString() + ' attempts, ' + ms + 'ms)';
      cell.style.color = '#f00';
      playSound('win');
    } else {
      cell.textContent = 'Not found';
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

  // Generate all valid DDMMYYYY dates from 1940-2020
  for (let year = 2020; year >= 1940; year--) {
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 31; day++) {
        const candidate = 
          String(day).padStart(2,'0') +
          String(month).padStart(2,'0') +
          String(year);
        attempts++;
        const hash = await sha256(candidate);
        if (hash === targetHash) {
          callback(candidate, attempts, Date.now() - start);
          return;
        }
        // Yield every 1000 to keep UI responsive
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Sound effects ---
function playSound(type) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  if (type === 'win') {
    // Victory fanfare: ascending notes
    playNote(ctx, 523, 0.0, 0.15);
    playNote(ctx, 659, 0.15, 0.15);
    playNote(ctx, 784, 0.30, 0.15);
    playNote(ctx, 1047, 0.45, 0.40);
  } else {
    // Failure: da-da-daa-daaaaa
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
