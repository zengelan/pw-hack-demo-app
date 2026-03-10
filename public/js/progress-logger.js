// progress-logger.js - Enhanced progress tracking and event logging

const ProgressLogger = {
  eventLog: [],
  hashResults: new Map(),
  sessionStats: {
    startTime: null,
    totalAttempts: 0,
    totalCracked: 0,
    totalFailed: 0,
    speedSamples: []
  },
  
  init() {
    // Set up event listeners
    document.getElementById('btn-clear-log')?.addEventListener('click', () => this.clearLog());
    document.getElementById('btn-export-log')?.addEventListener('click', () => this.exportLog());
  },
  
  // Log an event to the event log
  logEvent(type, message, data = null) {
    const timestamp = new Date();
    const entry = {
      timestamp,
      type, // 'info', 'success', 'error', 'warning'
      message,
      data
    };
    
    this.eventLog.push(entry);
    
    // Keep only last 200 entries to prevent memory issues
    if (this.eventLog.length > 200) {
      this.eventLog.shift();
    }
    
    this.renderEventLog();
  },
  
  // Render the event log
  renderEventLog() {
    const container = document.getElementById('event-log');
    if (!container) return;
    
    // Only render last 50 entries for performance
    const recent = this.eventLog.slice(-50);
    
    container.innerHTML = recent.map(entry => {
      const timeStr = entry.timestamp.toLocaleTimeString('en-GB');
      return `
        <div class="log-entry ${entry.type}">
          <span class="log-timestamp">${timeStr}</span>
          <span class="log-message">${this.escapeHtml(entry.message)}</span>
        </div>
      `;
    }).join('');
  },
  
  // Update or create a hash result entry
  updateHashResult(hashId, data) {
    const existing = this.hashResults.get(hashId) || {};
    const updated = { ...existing, ...data, hashId };
    this.hashResults.set(hashId, updated);
    this.renderHashResults();
  },
  
  // Render hash results panel
  renderHashResults() {
    const container = document.getElementById('hash-results');
    if (!container) return;
    
    if (this.hashResults.size === 0) {
      container.innerHTML = '<p style="color:#666;text-align:center;margin:20px 0">No hashes being processed</p>';
      return;
    }
    
    const results = Array.from(this.hashResults.values());
    
    container.innerHTML = results.map(result => {
      const statusClass = result.status || 'processing';
      const statusText = {
        'processing': '⏳ Processing',
        'cracked': '✅ Cracked',
        'failed': '❌ Failed'
      }[statusClass] || statusClass;
      
      return `
        <div class="hash-result-item ${statusClass}">
          <div class="hash-result-header">
            <span class="hash-result-hash" title="${result.hash || ''}">${(result.hash || '').substring(0, 16)}...</span>
            <span class="hash-result-status ${statusClass}">${statusText}</span>
          </div>
          ${result.password ? `<div style="margin-top:8px;color:#4cff80;font-weight:600;">Password: ${this.escapeHtml(result.password)}</div>` : ''}
          <div class="hash-result-details">
            <div class="hash-result-detail">
              <span>Type:</span>
              <strong>${result.passwordType || '—'}</strong>
            </div>
            <div class="hash-result-detail">
              <span>Attempts:</span>
              <strong>${this.formatNumber(result.attempts || 0)}</strong>
            </div>
            <div class="hash-result-detail">
              <span>Duration:</span>
              <strong>${this.formatDuration(result.duration || 0)}</strong>
            </div>
            <div class="hash-result-detail">
              <span>Speed:</span>
              <strong>${this.formatSpeed(result.avgSpeed || 0)}</strong>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },
  
  // Start a new session
  startSession() {
    this.sessionStats.startTime = Date.now();
    this.sessionStats.totalAttempts = 0;
    this.sessionStats.totalCracked = 0;
    this.sessionStats.totalFailed = 0;
    this.sessionStats.speedSamples = [];
    
    this.logEvent('info', '🚀 Cracking session started');
    
    // Show progress details panel
    const panel = document.getElementById('progress-details');
    if (panel) panel.style.display = 'grid';
  },
  
  // End session
  endSession(reason = 'complete') {
    const duration = this.sessionStats.startTime ? Date.now() - this.sessionStats.startTime : 0;
    const message = reason === 'complete' 
      ? `✅ Session complete - ${this.sessionStats.totalCracked} cracked, ${this.sessionStats.totalFailed} failed in ${this.formatDuration(duration)}`
      : `⏹️ Session stopped - ${reason}`;
    
    this.logEvent('info', message);
  },
  
  // Update performance metrics
  updatePerformance(speed) {
    // Add speed sample
    this.sessionStats.speedSamples.push(speed);
    
    // Keep only last 20 samples
    if (this.sessionStats.speedSamples.length > 20) {
      this.sessionStats.speedSamples.shift();
    }
    
    // Calculate average speed
    const avgSpeed = this.sessionStats.speedSamples.reduce((a, b) => a + b, 0) / this.sessionStats.speedSamples.length;
    
    // Update UI
    document.getElementById('perf-avg-speed').textContent = this.formatSpeed(avgSpeed);
    document.getElementById('perf-total-attempts').textContent = this.formatNumber(this.sessionStats.totalAttempts);
    
    // Calculate success rate
    const total = this.sessionStats.totalCracked + this.sessionStats.totalFailed;
    const successRate = total > 0 ? Math.round((this.sessionStats.totalCracked / total) * 100) : 0;
    document.getElementById('perf-success-rate').textContent = successRate + '%';
  },
  
  // Hash started processing
  onHashStart(hashId, hash, passwordType) {
    this.updateHashResult(hashId, {
      hash,
      passwordType,
      status: 'processing',
      startTime: Date.now()
    });
    
    this.logEvent('info', `Starting hash <code>${hash.substring(0, 12)}...</code> (type: ${passwordType})`);
  },
  
  // Hash cracked successfully
  onHashCracked(hashId, password, attempts, duration) {
    this.sessionStats.totalCracked++;
    this.sessionStats.totalAttempts += attempts;
    
    const avgSpeed = attempts / (duration / 1000);
    
    this.updateHashResult(hashId, {
      status: 'cracked',
      password,
      attempts,
      duration,
      avgSpeed
    });
    
    this.logEvent('success', `✅ Cracked password: <code>${this.escapeHtml(password)}</code> in ${this.formatDuration(duration)} (${this.formatNumber(attempts)} attempts)`);
  },
  
  // Hash failed to crack
  onHashFailed(hashId, attempts, duration) {
    this.sessionStats.totalFailed++;
    this.sessionStats.totalAttempts += attempts;
    
    const avgSpeed = attempts / (duration / 1000);
    
    this.updateHashResult(hashId, {
      status: 'failed',
      attempts,
      duration,
      avgSpeed
    });
    
    this.logEvent('error', `❌ Failed to crack hash after ${this.formatNumber(attempts)} attempts`);
  },
  
  // Progress update for current hash
  onProgress(progress) {
    if (progress.speed) {
      this.updatePerformance(progress.speed);
    }
  },
  
  // Phase change (dictionary -> brute-force)
  onPhaseChange(phase, hashId) {
    const phaseText = phase === 'dictionary' ? '📚 Dictionary attack' : '🔢 Brute-force';
    this.logEvent('info', `Phase: ${phaseText}`);
  },
  
  // Clear log
  clearLog() {
    this.eventLog = [];
    this.renderEventLog();
    this.logEvent('info', 'Log cleared');
  },
  
  // Export log as text file
  exportLog() {
    const text = this.eventLog.map(entry => {
      const time = entry.timestamp.toISOString();
      return `[${time}] [${entry.type.toUpperCase()}] ${entry.message.replace(/<[^>]*>/g, '')}`;
    }).join('\n');
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cracking-log-' + new Date().toISOString().split('T')[0] + '.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    this.logEvent('info', '📥 Log exported');
  },
  
  // Utility functions
  formatSpeed(speed) {
    if (speed >= 1000000) return (speed / 1000000).toFixed(1) + ' MH/s';
    if (speed >= 1000) return (speed / 1000).toFixed(1) + ' KH/s';
    return Math.round(speed) + ' H/s';
  },
  
  formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  },
  
  formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ProgressLogger.init());
} else {
  ProgressLogger.init();
}
