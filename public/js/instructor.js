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

// Rest of instructor.js remains unchanged...
// (The file is too long to include in full, but the changes above are the only modifications)
