/**
 * Worker Pool Manager
 * Manages multiple Web Workers for parallel password cracking
 *
 * Strategy:
 *   Phase 1 — Dictionary: single-threaded (workers[0] only). Simple, no
 *             race conditions, dictionary order is preserved.
 *   Phase 2 — Brute-force: fully parallel across all N workers, each
 *             given its own offset+limit range.
 */

class WorkerPool {
  constructor(maxWorkers = null) {
    this.maxWorkers = maxWorkers || navigator.hardwareConcurrency || 4;
    this.workers = [];
    this.taskQueue = [];
    this.activeTask = null;
    console.log(`[Pool] Worker pool initialized: ${this.maxWorkers} workers`);
  }

  /** Initialize workers */
  init() {
    this.terminate();
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker('/js/crack-worker.js');
      worker.workerId = i;
      this.workers.push(worker);
    }
    console.log(`[Pool] ${this.workers.length} workers created`);
  }

  /** Terminate all workers */
  terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.activeTask = null;
  }

  /**
   * Crack password: dictionary (single thread) then brute-force (all threads).
   */
  async crack(targetHash, passwordType, options = {}) {
    if (!this.workers.length) this.init();

    const strategy = passwordType?.bruteForceStrategy || {};
    let totalAttempts = 0;
    const startTime = Date.now();

    console.log(`[Pool] \uD83C\uDFAF Target: ${targetHash.substring(0, 16)}... (type: ${passwordType.id})`);

    // ── Phase 1: Dictionary (single thread) ────────────────────────────────
    if (strategy.dictionarySupport && options.dictionary && options.dictionary.length > 0) {
      const dictStartTime = Date.now();
      console.log(`[Pool] \uD83D\uDCDA Phase 1: Dictionary attack starting (${options.dictionary.length.toLocaleString()} words, 1 worker)`);

      if (options.onPhaseChange) options.onPhaseChange('dictionary', 1);

      const dictResult = await this._runDictionaryAttack(
        targetHash,
        options.dictionary,
        options.onProgress
      );

      const dictDuration = Date.now() - dictStartTime;

      if (dictResult.found) {
        console.log(`[Pool] \u2705 Dictionary SUCCESS! Found "${dictResult.password}" after ${dictResult.attempts.toLocaleString()} attempts in ${dictDuration}ms`);
        return {
          password: dictResult.password,
          attempts: dictResult.attempts,
          duration: Date.now() - startTime,
          method: 'dictionary'
        };
      }

      console.log(`[Pool] \u274C Dictionary exhausted (${dictResult.attempts.toLocaleString()} attempts, ${dictDuration}ms) — moving to brute-force`);
      totalAttempts += dictResult.attempts;
    } else {
      console.log(`[Pool] \u23ED\uFE0F  Skipping dictionary phase (${
        !strategy.dictionarySupport ? 'not supported for ' + passwordType.id : 'no dictionary loaded'
      })`);
    }

    // ── Phase 2: Brute-force (all workers in parallel) ─────────────────────
    const bruteStartTime = Date.now();
    console.log(`[Pool] \uD83D\uDD28 Phase 2: Brute-force starting (${this.workers.length} workers)`);

    if (options.onPhaseChange) options.onPhaseChange('brute-force', this.workers.length);

    const bruteResult = await this._runBruteForceAttack(
      targetHash,
      passwordType,
      options,
      totalAttempts
    );

    const bruteDuration = Date.now() - bruteStartTime;
    console.log(`[Pool] \uD83D\uDD28 Brute-force ${
      bruteResult.password
        ? `\u2705 SUCCESS! Found "${bruteResult.password}" after ${bruteResult.attempts.toLocaleString()} attempts in ${bruteDuration}ms`
        : `\u274C exhausted (${bruteResult.attempts.toLocaleString()} attempts, ${bruteDuration}ms)`
    }`);

    return {
      password: bruteResult.password,
      attempts: totalAttempts + bruteResult.attempts,
      duration: Date.now() - startTime,
      method: bruteResult.password ? 'brute-force' : 'exhausted'
    };
  }

  /**
   * Dictionary attack — single-threaded on workers[0].
   * Simple and race-condition-free. Progress forwarded directly.
   */
  _runDictionaryAttack(targetHash, dictionary, onProgress) {
    return new Promise((resolve) => {
      const worker = this.workers[0];

      const cleanup = () => { worker.onmessage = null; worker.onerror = null; };

      worker.onmessage = (e) => {
        const { type, data } = e.data;

        if (type === 'progress' && onProgress) {
          onProgress({
            phase: 'dictionary',
            current: data.current,
            attempts: data.attempts,
            speed: data.speed,
            total: dictionary.length
          });
        }

        if (type === 'found') {
          cleanup();
          resolve({ found: true, password: data.password, attempts: data.attempts });
        }

        if (type === 'exhausted') {
          cleanup();
          resolve({ found: false, attempts: data.attempts });
        }

        if (type === 'cancelled') {
          cleanup();
          resolve({ found: false, attempts: data.attempts || 0 });
        }
      };

      worker.onerror = (err) => {
        console.error('[Pool] \u274C Worker 0 error during dictionary attack:', err);
        cleanup();
        resolve({ found: false, attempts: 0 });
      };

      console.log(`[Pool] \uD83D\uDCE4 Worker 0: dictionary ${dictionary.length.toLocaleString()} words`);
      worker.postMessage({ action: 'dictionary', targetHash, dictionary });
    });
  }

  /**
   * Brute-force attack — parallel across ALL workers.
   * Each worker gets its own offset+limit range.
   * Speed is aggregated (summed) across all workers for correct total throughput.
   */
  _runBruteForceAttack(targetHash, passwordType, options, baseAttempts) {
    return new Promise((resolve) => {
      const numWorkers = this.workers.length;
      const totalSpace = PasswordSpaces.getEstimatedAttempts(passwordType.id, options);
      const rangeSize  = Math.ceil(totalSpace / numWorkers);
      let completed    = 0;
      let totalAttempts = 0;
      let found        = false;

      const attemptsAggregator = {}; // workerId -> cumulative attempts
      const speedAggregator    = {}; // workerId -> last reported H/s
      let lastProgressLog      = 0;

      console.log(`[Pool] \uD83D\uDD28 Distributing ${totalSpace.toLocaleString()} attempts across ${numWorkers} workers (${rangeSize.toLocaleString()} per worker)`);

      const cleanup      = () => this.workers.forEach(w => { w.onmessage = null; w.onerror = null; });
      const cancelOthers = () => this.workers.forEach(w => w.postMessage({ action: 'cancel' }));

      const onWorkerMessage = (workerId) => (e) => {
        if (found) return;
        const { type, data } = e.data;

        if (type === 'progress') {
          attemptsAggregator[workerId] = data.attempts;
          speedAggregator[workerId]    = data.speed;

          if (options.onProgress) {
            const aggAttempts = Object.values(attemptsAggregator).reduce((s, a) => s + a, 0);
            const aggSpeed    = Object.values(speedAggregator).reduce((s, v) => s + v, 0);
            const percent     = totalSpace > 0 ? Math.floor((aggAttempts / totalSpace) * 100) : 0;

            if (percent >= lastProgressLog + 10) {
              console.log(`[Pool] \uD83D\uDD28 BF progress: ${percent}% (~${aggSpeed.toLocaleString()} H/s total)`);
              lastProgressLog = percent;
            }

            options.onProgress({
              phase: 'brute-force',
              current: data.current,
              attempts: baseAttempts + aggAttempts,
              speed: aggSpeed,
              total: totalSpace
            });
          }
        }

        if (type === 'found') {
          found = true;
          console.log(`[Pool] \u2705 Worker ${workerId} found: "${data.password}"`);
          cancelOthers();
          cleanup();
          const aggSoFar = Object.values(attemptsAggregator).reduce((s, a) => s + a, 0);
          resolve({ password: data.password, attempts: aggSoFar + data.attempts });
        }

        if (type === 'exhausted') {
          completed++;
          totalAttempts += data.attempts;
          console.log(`[Pool] \uD83D\uDD28 Worker ${workerId} exhausted (${completed}/${numWorkers} done)`);
          if (completed === numWorkers) { cleanup(); resolve({ password: null, attempts: totalAttempts }); }
        }
      };

      this.workers.forEach((worker, i) => {
        attemptsAggregator[i] = 0;
        speedAggregator[i]    = 0;
        worker.onmessage = onWorkerMessage(i);
        worker.onerror   = (err) => {
          console.error(`[Pool] \u274C Worker ${i} error:`, err);
          completed++;
          if (completed === numWorkers) { cleanup(); resolve({ password: null, attempts: totalAttempts }); }
        };

        const offset = i * rangeSize;
        const limit  = Math.min(rangeSize, totalSpace - offset);
        console.log(`[Pool] \uD83D\uDCE4 Worker ${i}: offset=${offset.toLocaleString()}, limit=${limit.toLocaleString()}`);
        worker.postMessage({ action: 'brute-force', targetHash, passwordType, offset, limit });
      });
    });
  }

  /** Cancel all active tasks */
  cancel() {
    console.log('[Pool] \uD83D\uDED1 Cancelling all workers');
    this.workers.forEach(w => w.postMessage({ action: 'cancel' }));
    this.activeTask = null;
  }
}

// Singleton instance
const workerPool = new WorkerPool();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkerPool, workerPool };
}
