// student.js - Student submission form logic

const MAX_SUBMISSIONS = 25;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSpaces();
  setupMetaDisclosure();
  document.getElementById('space-select').addEventListener('change', onSpaceChange);
  document.getElementById('submit-btn').addEventListener('click', onSubmit);
  document.getElementById('pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') onSubmit();
  });
});

// --- Load spaces from API ---
async function loadSpaces() {
  try {
    const res = await fetch('/api/spaces');
    if (!res.ok) {
      throw new Error('API returned status ' + res.status);
    }
    const spaces = await res.json(); // Backend returns direct array
    if (!Array.isArray(spaces)) {
      throw new Error('Invalid response format');
    }

    const sel = document.getElementById('space-select');

    if (spaces.length === 0) {
      // No spaces available - show message and allow password entry anyway
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = 'Default Space (No spaces configured)';
      sel.appendChild(opt);
      sel.value = 'default';
      document.getElementById('pw-section').style.display = 'block';
      document.getElementById('space-info').innerHTML =
          '<p style="color:#fa0;padding:8px;background:#1a1a0a;border-radius:4px;">⚠️ No spaces configured. Using default space.</p>';
      document.getElementById('space-info').style.display = 'block';
      return;
    }

    spaces.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });

    // Auto-select and auto-trigger if there is only one space
    if (spaces.length === 1) {
      sel.value = spaces[0].id;
      await onSpaceChange();
      // Hide space-info when only one space (no selection needed)
      document.getElementById('space-info').style.display = 'none';
    }
  } catch(e) {
    console.error('Failed to load spaces:', e);
    // Show error but still allow password entry
    const sel = document.getElementById('space-select');
    const opt = document.createElement('option');
    opt.value = 'default';
    opt.textContent = 'Default Space (API Error)';
    sel.appendChild(opt);
    sel.value = 'default';
    document.getElementById('pw-section').style.display = 'block';
    document.getElementById('space-info').innerHTML =
        '<p style="color:#f00;padding:8px;background:#1a0a0a;border-radius:4px;">⚠️ Failed to load spaces: ' + e.message + '. Using default space.</p>';
    document.getElementById('space-info').style.display = 'block';
  }
}

// --- Space selection ---
async function onSpaceChange() {
  const spaceId = document.getElementById('space-select').value;
  if (!spaceId) {
    document.getElementById('pw-section').style.display = 'none';
    return;
  }

  // Always show password section when a space is selected
  document.getElementById('pw-section').style.display = 'block';

  // Check if only one space exists (hide info panel)
  const res = await fetch('/api/spaces');
  const spaces = await res.json();
  if (spaces.length === 1) {
    document.getElementById('space-info').style.display = 'none';
    return;
  }

  // Try to fetch space details
  try {
    const space = spaces.find(s => s.id === spaceId);
    if (space) {
      renderSpaceInfo(space);
      document.getElementById('space-info').style.display = 'block';
    } else if (spaceId === 'default') {
      // Default space selected, already shown message
    } else {
      document.getElementById('space-info').innerHTML =
          '<p style="color:#aaa;padding:8px;">Space information not available</p>';
      document.getElementById('space-info').style.display = 'block';
    }
  } catch(e) {
    // Space details failed but we can still proceed
    console.error('Failed to fetch space details:', e);
  }
}

function renderSpaceInfo(space) {
  const el = document.getElementById('space-info');
  el.innerHTML = `
    <table class="info-table">
      <tr><th>Space</th><td>${space.name}</td></tr>
      <tr><th>Location</th><td>${space.location || '-'}</td></tr>
      <tr><th>Description</th><td>${space.description || '-'}</td></tr>
    </table>`;
  el.style.display = 'block';
}

// --- Hash password ---
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Collect metadata ---
function collectMeta() {
  const nav = navigator;
  return {
    userAgent: nav.userAgent,
    language: nav.language,
    languages: [...(nav.languages || [nav.language])],
    platform: nav.platform,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    screenWidth: screen.width,
    screenHeight: screen.height,
    screenDepth: screen.colorDepth,
    devicePixelRatio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    hardwareConcurrency: nav.hardwareConcurrency,
    maxTouchPoints: nav.maxTouchPoints,
    online: nav.onLine,
    connection: nav.connection ? {type: nav.connection.effectiveType, downlink: nav.connection.downlink} : null,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    referrer: document.referrer,
    submittedAt: new Date().toISOString()
  };
}

// --- Meta disclosure panel ---
function setupMetaDisclosure() {
  const toggle = document.getElementById('meta-toggle');
  const panel = document.getElementById('meta-panel');
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => {
    const meta = collectMeta();
    panel.textContent = JSON.stringify(meta, null, 2);
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
}

// --- Submit ---
async function onSubmit() {
  const spaceId = document.getElementById('space-select').value;
  const pw = document.getElementById('pw-input').value.trim();
  const status = document.getElementById('status-msg');

  if (!spaceId) {
    status.innerHTML = '<span style="color:#fa0">⚠️ Please select a space first.</span>';
    return;
  }
  if (!pw) {
    status.innerHTML = '<span style="color:#fa0">⚠️ Please enter a password.</span>';
    return;
  }
  if (!/^\d{8}$/.test(pw)) {
    status.innerHTML = '<span style="color:#fa0">⚠️ Password must be 8 digits (DDMMYYYY).</span>';
    return;
  }

  const hash = await sha256(pw);
  const meta = collectMeta();
  status.innerHTML = '<span style="color:#7af">📤 Submitting...</span>';
  document.getElementById('submit-btn').disabled = true;

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({spaceId, hash, meta})
    });
    const data = await res.json();

    if (res.status === 403) {
      status.innerHTML = '<span style="color:#f00">🚫 ' + (data.error || 'Access denied.') + '</span><br>Your IP: ' + (data.ip || '');
      document.getElementById('submit-btn').disabled = false;
    } else if (res.status === 429) {
      status.innerHTML = '<span style="color:#f00">⚠️ ' + (data.error || 'Maximum submissions reached. No more passwords accepted.') + '</span>';
    } else if (res.ok) {
      status.innerHTML = '<span style="color:#0f0">✅ Hash submitted successfully!</span><br>Hash: <code>' + hash.substring(0,32) + '...</code>';
      document.getElementById('pw-input').value = '';
      document.getElementById('pw-input').disabled = true;
      document.getElementById('submit-btn').disabled = true;
    } else {
      status.innerHTML = '<span style="color:#f00">❌ ' + (data.error || 'Submission failed.') + '</span>';
      document.getElementById('submit-btn').disabled = false;
    }
  } catch(e) {
    status.innerHTML = '<span style="color:#f00">⚠️ Network error: ' + e.message + '</span>';
    document.getElementById('submit-btn').disabled = false;
  }
}
