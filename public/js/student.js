// student.js - Student submission form logic

const MAX_SUBMISSIONS = 25;

let selectedPasswordType = null;
let _passwordTypes = [];
let _spaces        = []; // fetched once by loadSpaces(), reused by onSpaceChange()
let isSubmittingHash = false; // Track if user is submitting a hash directly

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Types first: loadSpaces() may immediately call renderPasswordTypeSection()
  //    so _passwordTypes[] must be populated before that can happen.
  await loadPasswordTypes();

  // 2. Fetch spaces ONCE into _spaces; onSpaceChange() reuses the cache.
  await loadSpaces();

  // 3. Wire up all persistent event listeners
  setupMetaDisclosure();

  document.getElementById('space-select')
      .addEventListener('change', onSpaceChange);

  document.getElementById('submit-btn')
      .addEventListener('click', onSubmit);

  document.getElementById('pw-input')
      .addEventListener('keydown', e => { if (e.key === 'Enter') onSubmit(); });

  // Add real-time validation for password input
  document.getElementById('pw-input')
      .addEventListener('input', onPasswordInput);

  // pw-type radio listeners are added dynamically in renderPasswordTypeSection()
});

// ---------------------------------------------------------------------------
// Password Types  —  /api/password-types
// ---------------------------------------------------------------------------
async function loadPasswordTypes() {
  try {
    const res = await fetch('/api/password-types');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data.types) || data.types.length === 0)
      throw new Error('Empty or invalid response');
    _passwordTypes = data.types;
  } catch (e) {
    console.error('Failed to load password types, using fallback:', e);
    _passwordTypes = [{
      id: 'birthday_ddmmyyyy',
      label: 'Birthday (DDMMYYYY)',
      description: 'An 8-digit password derived from a birth date in DDMMYYYY format (e.g. 15081990). Very common and very easy to crack.',
      format: 'DDMMYYYY',
      regex: '^(0[1-9]|[12][0-9]|3[01])(0[1-9]|1[0-2])(19[2-9][0-9]|20[0-2][0-9])$',
      possibleValues: 26645,
      exampleValues: ['01011990', '24121985', '07031975'],
      crackingHint: 'Brute-forceable in milliseconds — only ~27k valid calendar dates.',
      weaknessLevel: 'very_high'
    }];
  }
}

// ---------------------------------------------------------------------------
// Password Type selector  —  builds cards into #pwtype-cards
// ---------------------------------------------------------------------------
function renderPasswordTypeSection() {
  const section = document.getElementById('pwtype-section');
  const cards   = document.getElementById('pwtype-cards');
  if (!section || !cards) return;

  cards.innerHTML = ''; // clears the static "Loading…" placeholder too

  _passwordTypes.forEach((type, idx) => {
    const isFirst = idx === 0;
    const card    = document.createElement('label');

    card.style.cssText = [
      'display:flex', 'align-items:flex-start', 'gap:12px',
      'padding:12px 16px', 'margin-bottom:8px',
      'border:2px solid var(--border,#444)', 'border-radius:8px',
      'cursor:pointer', 'transition:border-color 0.15s,background 0.15s',
      isFirst ? 'border-color:var(--accent,#4af);background:rgba(68,170,255,0.07)' : ''
    ].join(';');
    card.setAttribute('for', 'pwtype-' + type.id);

    const weakIcon = { very_high: '🔴', high: '🟠', medium: '🟡', low: '🟢' }
        [type.weaknessLevel] || '⚪';

    card.innerHTML =
        '<input type="radio" id="pwtype-' + type.id + '" name="pw-type" value="' + type.id + '"' +
        ' style="margin-top:4px;flex-shrink:0;accent-color:var(--accent,#4af);"' +
        (isFirst ? ' checked' : '') + '>' +
        '<div style="line-height:1.4;">' +
        '<strong>' + weakIcon + ' ' + type.label + '</strong>' +
        '<div style="font-size:0.83em;opacity:0.7;margin-top:2px;">' +
        'Format: <code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;">' + type.format + '</code>' +
        ' &nbsp;&middot;&nbsp; ~' + (type.possibleValues ?? 0).toLocaleString() + ' possible values' +
        '</div>' +
        '</div>';

    card.querySelector('input').addEventListener('change', (function(t, c) {
      return function() {
        cards.querySelectorAll('label').forEach(function(l) {
          l.style.borderColor = 'var(--border,#444)';
          l.style.background  = '';
        });
        c.style.borderColor = 'var(--accent,#4af)';
        c.style.background  = 'rgba(68,170,255,0.07)';
        onPasswordTypeChange(t);
      };
    })(type, card));

    cards.appendChild(card);
  });

  if (_passwordTypes.length > 0) onPasswordTypeChange(_passwordTypes[0]);
  section.style.display = 'block';
}

function onPasswordTypeChange(type) {
  selectedPasswordType = type;

  var infoEl = document.getElementById('pwtype-info');
  if (infoEl) {
    var examples = (type.exampleValues || []).slice(0, 3)
        .map(function(v) { return '<code>' + v + '</code>'; }).join(', ');
    infoEl.innerHTML =
        '<div style="padding:11px 14px;border-left:3px solid var(--accent,#4af);' +
        'background:rgba(255,255,255,0.04);border-radius:0 6px 6px 0;font-size:0.88em;line-height:1.5;">' +
        '<span>' + type.description + '</span>' +
        (examples ? '<div style="margin-top:6px;opacity:0.75;">Examples: ' + examples + '</div>' : '') +
        (type.crackingHint ? '<div style="margin-top:5px;color:#fa0;">&#x26A1; ' + type.crackingHint + '</div>' : '') +
        '</div>';
    infoEl.style.display = 'block';
  }

  var pwInput = document.getElementById('pw-input');
  if (pwInput) {
    var ex = type.exampleValues && type.exampleValues[0];
    pwInput.placeholder = type.format + (ex ? '  e.g. ' + ex : '');
  }

  // Clear any existing validation errors when type changes
  var status = document.getElementById('status-msg');
  if (status) status.innerHTML = '';

  document.getElementById('pw-section').style.display = 'block';
}

// ---------------------------------------------------------------------------
// Real-time password validation
// ---------------------------------------------------------------------------
function onPasswordInput() {
  var pwInput = document.getElementById('pw-input');
  var pw = pwInput.value.trim();
  var status = document.getElementById('status-msg');
  var preview = document.getElementById('hash-preview');

  // Clear status on input change
  status.innerHTML = '';

  // If empty, hide preview and clear errors
  if (!pw) {
    preview.classList.remove('visible');
    return;
  }

  // Check if input looks like a hash (64 hex characters)
  var hashPattern = /^[a-fA-F0-9]{64}$/;
  if (hashPattern.test(pw)) {
    // User entered a hash - don't validate format, don't show preview
    preview.classList.remove('visible');
    isSubmittingHash = true;
    return;
  }

  isSubmittingHash = false;

  // Validate password format based on selected type
  if (selectedPasswordType && selectedPasswordType.regex) {
    var regex = new RegExp(selectedPasswordType.regex);
    if (!regex.test(pw)) {
      var ex = selectedPasswordType.exampleValues && selectedPasswordType.exampleValues[0];
      status.innerHTML = '<span style="color:#fa0">&#x26A0;&#xFE0F; ' + window.i18n.t('statusInvalidFormat') + ' '
          + '<strong>' + selectedPasswordType.label + '</strong>. '
          + window.i18n.t('statusExpected') + ' <code>' + selectedPasswordType.format + '</code>'
          + (ex ? ' (e.g. <code>' + ex + '</code>)' : '') + '</span>';
      preview.classList.remove('visible');
      return;
    }
  }

  // Valid password - update hash preview
  updateHashPreview(pw);
}

// ---------------------------------------------------------------------------
// Hash preview update
// ---------------------------------------------------------------------------
async function updateHashPreview(password) {
  var preview = document.getElementById('hash-preview');
  var previewVal = document.getElementById('hash-preview-value');

  if (password && !isSubmittingHash) {
    try {
      var hash = await sha256(password);
      previewVal.textContent = hash;
      preview.classList.add('visible');
    } catch (e) {
      console.error('Error generating hash:', e);
      preview.classList.remove('visible');
    }
  } else {
    preview.classList.remove('visible');
  }
}

// ---------------------------------------------------------------------------
// Spaces  —  /api/spaces  (fetched ONCE, result cached in _spaces)
// ---------------------------------------------------------------------------
async function loadSpaces() {
  try {
    var res = await fetch('/api/spaces');
    if (!res.ok) throw new Error('API returned status ' + res.status);
    _spaces = await res.json();
    if (!Array.isArray(_spaces)) throw new Error('Invalid response format');

    var sel = document.getElementById('space-select');

    if (_spaces.length === 0) {
      var opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = 'Default Space (No spaces configured)';
      sel.appendChild(opt);
      sel.value = 'default';
      document.getElementById('space-info').innerHTML =
          '<p style="color:#fa0;padding:8px;background:#1a1a0a;border-radius:4px;">' +
          '&#x26A0;&#xFE0F; No spaces configured. Using default space.</p>';
      document.getElementById('space-info').style.display = 'block';
      renderPasswordTypeSection();
      return;
    }

    _spaces.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });

    if (_spaces.length === 1) {
      sel.value = _spaces[0].id;
      await onSpaceChange();
      document.getElementById('space-info').style.display = 'none';
    }
  } catch (e) {
    console.error('Failed to load spaces:', e);
    var sel = document.getElementById('space-select');
    var opt = document.createElement('option');
    opt.value = 'default';
    opt.textContent = 'Default Space (API Error)';
    sel.appendChild(opt);
    sel.value = 'default';
    document.getElementById('space-info').innerHTML =
        '<p style="color:#f00;padding:8px;background:#1a0a0a;border-radius:4px;">' +
        '&#x26A0;&#xFE0F; Failed to load spaces: ' + e.message + '. Using default space.</p>';
    document.getElementById('space-info').style.display = 'block';
    renderPasswordTypeSection();
  }
}

// Called when user picks a different space from the dropdown.
// Uses cached _spaces — no second API call.
async function onSpaceChange() {
  var spaceId = document.getElementById('space-select').value;

  if (!spaceId) {
    var pts = document.getElementById('pwtype-section');
    if (pts) pts.style.display = 'none';
    document.getElementById('pw-section').style.display = 'none';
    return;
  }

  // Hide password entry until a type is re-confirmed after space change
  document.getElementById('pw-section').style.display = 'none';

  // Show space info panel for multi-space setups — no fetch, uses _spaces cache
  if (_spaces.length > 1) {
    var space = _spaces.find(function(s) { return s.id === spaceId; });
    if (space) {
      renderSpaceInfo(space);
      document.getElementById('space-info').style.display = 'block';
    } else if (spaceId !== 'default') {
      document.getElementById('space-info').innerHTML =
          '<p style="color:#aaa;padding:8px;">Space information not available</p>';
      document.getElementById('space-info').style.display = 'block';
    }
  }

  renderPasswordTypeSection();
}

function renderSpaceInfo(space) {
  var el = document.getElementById('space-info');
  el.innerHTML =
      '<table class="info-table">' +
      '<tr><th>Space</th><td>' + space.name + '</td></tr>' +
      '<tr><th>Location</th><td>' + (space.location || '-') + '</td></tr>' +
      '<tr><th>Description</th><td>' + (space.description || '-') + '</td></tr>' +
      '</table>';
  el.style.display = 'block';
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------
async function sha256(message) {
  var msgBuffer  = new TextEncoder().encode(message);
  var hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
      .map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// ---------------------------------------------------------------------------
// Client metadata
// ---------------------------------------------------------------------------
function collectMeta() {
  var nav = navigator;
  return {
    userAgent:           nav.userAgent,
    language:            nav.language,
    languages:           Array.from(nav.languages || [nav.language]),
    platform:            nav.platform,
    cookieEnabled:       nav.cookieEnabled,
    doNotTrack:          nav.doNotTrack,
    screenWidth:         screen.width,
    screenHeight:        screen.height,
    screenDepth:         screen.colorDepth,
    devicePixelRatio:    window.devicePixelRatio,
    timezone:            Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset:      new Date().getTimezoneOffset(),
    hardwareConcurrency: nav.hardwareConcurrency,
    maxTouchPoints:      nav.maxTouchPoints,
    online:              nav.onLine,
    connection:          nav.connection
        ? { type: nav.connection.effectiveType, downlink: nav.connection.downlink }
        : null,
    windowWidth:  window.innerWidth,
    windowHeight: window.innerHeight,
    referrer:     document.referrer,
    submittedAt:  new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Meta disclosure panel
// ---------------------------------------------------------------------------
function setupMetaDisclosure() {
  var toggle = document.getElementById('meta-toggle');
  var panel  = document.getElementById('meta-panel');
  if (!toggle || !panel) return;
  toggle.addEventListener('click', function() {
    panel.textContent   = JSON.stringify(collectMeta(), null, 2);
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------
async function onSubmit() {
  var spaceId = document.getElementById('space-select').value;
  var pw      = document.getElementById('pw-input').value.trim();
  var status  = document.getElementById('status-msg');

  if (!spaceId) {
    status.innerHTML = '<span style="color:#fa0">&#x26A0;&#xFE0F; ' + window.i18n.t('statusSelectSpace') + '</span>';
    return;
  }
  if (!selectedPasswordType) {
    status.innerHTML = '<span style="color:#fa0">&#x26A0;&#xFE0F; ' + window.i18n.t('statusSelectPasswordType') + '</span>';
    return;
  }
  if (!pw) {
    status.innerHTML = '<span style="color:#fa0">&#x26A0;&#xFE0F; ' + window.i18n.t('statusEnterPassword') + '</span>';
    return;
  }

  // Check if user is trying to submit a hash directly
  var hashPattern = /^[a-fA-F0-9]{64}$/;
  if (hashPattern.test(pw)) {
    // This is a hash - validate it properly
    status.innerHTML = '<span style="color:#fa0">&#x26A0;&#xFE0F; ' + window.i18n.t('statusHashInvalidFormat') + '</span>';
    return;
  }

  // Client-side format validation using the type's own regex
  if (selectedPasswordType.regex) {
    if (!new RegExp(selectedPasswordType.regex).test(pw)) {
      var ex = selectedPasswordType.exampleValues && selectedPasswordType.exampleValues[0];
      status.innerHTML = '<span style="color:#fa0">&#x26A0;&#xFE0F; ' + window.i18n.t('statusInvalidFormat') + ' '
          + '<strong>' + selectedPasswordType.label + '</strong>. '
          + window.i18n.t('statusExpected') + ' <code>' + selectedPasswordType.format + '</code>'
          + (ex ? ' (e.g. <code>' + ex + '</code>)' : '') + '</span>';
      return;
    }
  }

  document.getElementById('submit-btn').disabled = true;
  status.innerHTML = '<span style="color:#7af">&#x1F4E4; Hashing&#x2026;</span>';

  var hash = await sha256(pw);
  var meta = collectMeta();

  status.innerHTML = '<span style="color:#7af">&#x1F4E4; ' + window.i18n.t('statusSubmitting') + '</span>';

  try {
    var res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceId: spaceId, hash: hash, passwordTypeId: selectedPasswordType.id, meta: meta })
    });
    var data = await res.json();

    if (res.status === 403) {
      status.innerHTML = '<span style="color:#f00">&#x1F6AB; ' + (data.error || window.i18n.t('statusAccessDenied')) + '</span>'
          + (data.ip ? '<br>' + window.i18n.t('statusYourIP') + data.ip : '');
      document.getElementById('submit-btn').disabled = false;
    } else if (res.status === 429) {
      status.innerHTML = '<span style="color:#f00">&#x26A0;&#xFE0F; ' + (data.error || window.i18n.t('statusMaxSubmissions')) + '</span>';
    } else if (res.ok) {
      status.innerHTML = '<span style="color:#0f0">&#x2705; ' + window.i18n.t('statusSuccess') + '</span><br>'
          + window.i18n.t('statusHash') + '<code>' + hash.substring(0, 32) + '&#x2026;</code>';
      document.getElementById('pw-input').value     = '';
      document.getElementById('pw-input').disabled  = true;
      document.getElementById('submit-btn').disabled = true;
    } else {
      status.innerHTML = '<span style="color:#f00">&#x274C; ' + (data.error || window.i18n.t('statusFailed')) + '</span>';
      document.getElementById('submit-btn').disabled = false;
    }
  } catch (e) {
    status.innerHTML = '<span style="color:#f00">&#x26A0;&#xFE0F; ' + window.i18n.t('statusNetworkError') + e.message + '</span>';
    document.getElementById('submit-btn').disabled = false;
  }
}
