// student.js - Student submission form logic

const MAX_SUBMISSIONS = 25;

let selectedPasswordType = null;
let _passwordTypes = [];

document.addEventListener('DOMContentLoaded', async () => {
  injectPasswordTypeSection();
  await Promise.all([loadSpaces(), loadPasswordTypes()]);
  setupMetaDisclosure();
  document.getElementById('space-select').addEventListener('change', onSpaceChange);
  document.getElementById('submit-btn').addEventListener('click', onSubmit);
  document.getElementById('pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') onSubmit();
  });
});

// --- Inject password type section between space-info and pw-section ---
function injectPasswordTypeSection() {
  const pwSection = document.getElementById('pw-section');
  if (!pwSection || document.getElementById('pwtype-section')) return;
  const section = document.createElement('div');
  section.id = 'pwtype-section';
  section.className = 'info-section';
  section.style.display = 'none';
  section.innerHTML = `
    <h3>&#x1F511; Step 2: Choose Your Password Type</h3>
    <p>
      Select the type of password you will enter below. The instructor's
      brute-force cracker uses this hint to know <em>which search space</em>
      to iterate — so pick honestly! Notice how the number of possible
      values differs dramatically between types.
    </p>
    <div id="pwtype-cards" role="radiogroup" aria-label="Password type"></div>
    <div id="pwtype-info" style="display:none;margin-top:12px;"></div>
  `;
  pwSection.parentNode.insertBefore(section, pwSection);
}

// --- Load password types from API ---
async function loadPasswordTypes() {
  try {
    const res = await fetch('/api/password-types');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data.types) || data.types.length === 0)
      throw new Error('Empty or invalid types array');
    _passwordTypes = data.types;
  } catch (e) {
    console.error('Failed to load password types, using built-in fallback:', e);
    _passwordTypes = [{
      id: 'birthday_ddmmyyyy',
      label: 'Birthday (DDMMYYYY)',
      description: 'An 8-digit password derived from a birth date in DDMMYYYY format (e.g. 15081990). Very common and very easy to crack.',
      format: 'DDMMYYYY',
      possibleValues: 26645,
      exampleValues: ['01011990', '24121985', '07031975'],
      crackingHint: 'Brute-forceable in milliseconds — only ~27k valid calendar dates.',
      weaknessLevel: 'very_high'
    }];
  }
}

// --- Render password type cards ---
function renderPasswordTypeSection() {
  const section = document.getElementById('pwtype-section');
  const cards = document.getElementById('pwtype-cards');
  if (!section || !cards) return;

  cards.innerHTML = '';

  _passwordTypes.forEach((type, idx) => {
    const isFirst = idx === 0;
    const card = document.createElement('label');
    card.style.cssText = [
      'display:flex', 'align-items:flex-start', 'gap:12px',
      'padding:12px 16px', 'margin-bottom:8px',
      'border:2px solid var(--border, #444)',
      'border-radius:8px', 'cursor:pointer',
      'transition:border-color 0.15s, background 0.15s',
      isFirst ? 'border-color:var(--accent, #4af);background:rgba(68,170,255,0.07)' : ''
    ].join(';');
    card.setAttribute('for', 'pwtype-' + type.id);

    const weakIcon = { very_high: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[type.weaknessLevel] || '⚪';

    card.innerHTML = `
      <input type="radio" id="pwtype-${type.id}" name="pw-type" value="${type.id}"
             style="margin-top:4px;flex-shrink:0;accent-color:var(--accent,#4af);"
             ${isFirst ? 'checked' : ''}>
      <div style="line-height:1.4;">
        <strong>${weakIcon} ${type.label}</strong>
        <div style="font-size:0.83em;opacity:0.7;margin-top:2px;">
          Format: <code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;">${type.format}</code>
          &nbsp;&middot;&nbsp;
          ~${(type.possibleValues ?? 0).toLocaleString()} possible values
        </div>
      </div>
    `;

    card.querySelector('input').addEventListener('change', () => {
      cards.querySelectorAll('label').forEach(l => {
        l.style.borderColor = 'var(--border, #444)';
        l.style.background = '';
      });
      card.style.borderColor = 'var(--accent, #4af)';
      card.style.background = 'rgba(68,170,255,0.07)';
      onPasswordTypeChange(type);
    });

    cards.appendChild(card);
  });

  // Auto-select first type
  if (_passwordTypes.length > 0) {
    onPasswordTypeChange(_passwordTypes[0]);
  }

  section.style.display = 'block';
}

function onPasswordTypeChange(type) {
  selectedPasswordType = type;

  const infoEl = document.getElementById('pwtype-info');
  if (infoEl) {
    infoEl.style.display = 'block';
    const examples = type.exampleValues ? type.exampleValues.slice(0, 3).map(v => `<code>${v}</code>`).join(', ') : '';
    infoEl.innerHTML = `
      <div style="padding:11px 14px;border-left:3px solid var(--accent,#4af);
                  background:var(--surface2,rgba(255,255,255,0.04));border-radius:0 6px 6px 0;
                  font-size:0.88em;line-height:1.5;">
        <span>${type.description}</span>
        ${examples ? `<div style="margin-top:6px;opacity:0.75;">Examples: ${examples}</div>` : ''}
        ${type.crackingHint ? `<div style="margin-top:5px;color:var(--warn,#fa0);">&#x26A1; ${type.crackingHint}</div>` : ''}
      </div>
    `;
  }

  const pwInput = document.getElementById('pw-input');
  if (pwInput) {
    const ex = type.exampleValues?.[0];
    pwInput.placeholder = type.format + (ex ? `  e.g. ${ex}` : '');
  }

  document.getElementById('pw-section').style.display = 'block';
}

// --- Load spaces from API ---
async function loadSpaces() {
  try {
    const res = await fetch('/api/spaces');
    if (!res.ok) throw new Error('API returned status ' + res.status);
    const spaces = await res.json();
    if (!Array.isArray(spaces)) throw new Error('Invalid response format');

    const sel = document.getElementById('space-select');

    if (spaces.length === 0) {
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = 'Default Space (No spaces configured)';
      sel.appendChild(opt);
      sel.value = 'default';
      document.getElementById('space-info').innerHTML =
          '\n\n⚠️ No spaces configured. Using default space.\n\n';
      document.getElementById('space-info').style.display = 'block';
      renderPasswordTypeSection();
      return;
    }

    spaces.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });

    if (spaces.length === 1) {
      sel.value = spaces[0].id;
      await onSpaceChange();
      document.getElementById('space-info').style.display = 'none';
    }
  } catch (e) {
    console.error('Failed to load spaces:', e);
    const sel = document.getElementById('space-select');
    const opt = document.createElement('option');
    opt.value = 'default';
    opt.textContent = 'Default Space (API Error)';
    sel.appendChild(opt);
    sel.value = 'default';
    document.getElementById('space-info').innerHTML =
        '\n⚠️ Failed to load spaces: ' + e.message + '. Using default space.\n\n';
    document.getElementById('space-info').style.display = 'block';
    renderPasswordTypeSection();
  }
}

// --- Space selection ---
async function onSpaceChange() {
  const spaceId = document.getElementById('space-select').value;

  if (!spaceId) {
    const pts = document.getElementById('pwtype-section');
    if (pts) pts.style.display = 'none';
    document.getElementById('pw-section').style.display = 'none';
    return;
  }

  document.getElementById('pw-section').style.display = 'none';

  const res = await fetch('/api/spaces');
  const spaces = await res.json();

  if (spaces.length === 1) {
    document.getElementById('space-info').style.display = 'none';
  } else {
    try {
      const space = spaces.find(s => s.id === spaceId);
      if (space) {
        renderSpaceInfo(space);
        document.getElementById('space-info').style.display = 'block';
      } else if (spaceId !== 'default') {
        document.getElementById('space-info').innerHTML =
            '\nSpace information not available\n\n';
        document.getElementById('space-info').style.display = 'block';
      }
    } catch (e) {
      console.error('Failed to fetch space details:', e);
    }
  }

  renderPasswordTypeSection();
}

function renderSpaceInfo(space) {
  const el = document.getElementById('space-info');
  el.innerHTML =
      `|Space|${space.name}|\n|--|--|\n|Location|${space.location || '-'}|\n|Description|${space.description || '-'}|`;
}

// --- Meta disclosure toggle ---
function setupMetaDisclosure() {
  const toggle = document.getElementById('meta-toggle');
  const details = document.getElementById('meta-details');
  if (!toggle || !details) return;
  toggle.addEventListener('click', () => {
    const hidden = details.style.display === 'none' || !details.style.display;
    details.style.display = hidden ? 'block' : 'none';
    toggle.textContent = hidden ? '▲ Hide collected data' : '▼ What data is collected?';
  });
}

// --- Submit ---
async function onSubmit() {
  const pw = document.getElementById('pw-input').value.trim();
  const spaceId = document.getElementById('space-select').value;
  const status = document.getElementById('status');

  if (!pw) {
    status.innerHTML = '<span style="color:orange">⚠️ Please enter a password.</span>';
    return;
  }
  if (!selectedPasswordType) {
    status.innerHTML = '<span style="color:orange">⚠️ Please select a password type.</span>';
    return;
  }

  document.getElementById('submit-btn').disabled = true;
  status.innerHTML = 'Hashing…';

  try {
    const encoded = new TextEncoder().encode(pw);
    const buffer = await crypto.subtle.digest('SHA-256', encoded);
    const hash = Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    status.innerHTML = 'Submitting…';

    let meta = {};
    try { if (typeof collectClientMeta === 'function') meta = collectClientMeta(); } catch (_) {}

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash, spaceId, passwordTypeId: selectedPasswordType.id, meta })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      status.innerHTML =
          '✅ Submitted! Your hash:<br><code style="word-break:break-all;">' +
          hash.substring(0, 32) + '…</code>';
      document.getElementById('pw-input').value = '';
      document.getElementById('pw-input').disabled = true;
      document.getElementById('submit-btn').disabled = true;
    } else {
      status.innerHTML = '❌ ' + (data.error || 'Submission failed.');
      document.getElementById('submit-btn').disabled = false;
    }
  } catch (e) {
    status.innerHTML = '⚠️ Network error: ' + e.message;
    document.getElementById('submit-btn').disabled = false;
  }
}
