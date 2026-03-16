/**
 * Worker Pool Manager
 * Manages multiple Web Workers for parallel password cracking
 */

class WorkerPool {
  constructor(maxWorkers = null) {
    this.maxWorkers = maxWorkers || navigator.hardwareConcurrency || 4;
    this.workers = [];
    this.taskQueue = [];
    this.activeTask = null;
    console.log(`[Pool] Worker pool initialized: ${this.maxWorkers} workers`);
  }

  /**
   * Initialize workers
   */
  init() {
    this.terminate();
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker('/js/crack-worker.js');
      worker.workerId = i;
      this.workers.push(worker);
    }
    console.log(`[Pool] ${this.workers.length} workers created`);
  }

  /**
   * Terminate all workers
   */
  terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.activeTask = null;
  }

  /**
   * Crack password using dictionary + brute-force approach
   */
  async crack(targetHash, passwordType, options = {}) {
    if (!this.workers.length) this.init();

    const strategy = passwordType?.bruteForceStrategy || {};
    let totalAttempts = 0;
    const startTime = Date.now();

    console.log(`[Pool] \uD83C\uDFAF Target: ${targetHash.substring(0, 16)}... (type: ${passwordType.id})`);

    // Phase 1: Dictionary Attack (if supported)
    if (strategy.dictionarySupport && options.dictionary && options.dictionary.length > 0) {
      const dictStartTime = Date.now();
      console.log(`[Pool] \uD83D\uDCDA Phase 1: Dictionary attack starting (${options.dictionary.length.toLocaleString()} words, ${this.workers.length} workers)`);

      // Notify once — phase change logging is deduplicated inside ProgressLogger
      if (options.onPhaseChange) options.onPhaseChange('dictionary', this.workers.length);

      const dictResult = await this._runDictionaryAttack(
        targetHash,
        options.dictionary,
        options.onProgress
      );

      const dictDuration = Date.now() - dictStartTime;

      if (dictResult.found) {
        console.log(`[Pool] \u2705 Dictionary attack SUCCESS! Found "${dictResult.password}" after ${dictResult.attempts.toLocaleString()} attempts in ${dictDuration}ms`);
        return {
          password: dictResult.password,
          attempts: dictResult.attempts,
          duration: Date.now() - startTime,
          method: 'dictionary'
        };
      }

      console.log(`[Pool] \u274C Dictionary attack exhausted (${dictResult.attempts.toLocaleString()} attempts, ${dictDuration}ms) - moving to brute-force`);
      totalAttempts += dictResult.attempts;
    } else {
      if (!strategy.dictionarySupport) {
        console.log(`[Pool] \u23ED\uFE0F  Skipping dictionary phase (not supported for ${passwordType.id})`);
      } else {
        console.log(`[Pool] \u23ED\uFE0F  Skipping dictionary phase (no dictionary loaded)`);
      }
    }

    // Phase 2: Brute-force (parallel)
    const bruteStartTime = Date.now();
    console.log(`[Pool] \uD83D\uDD28 Phase 2: Brute-force attack starting (${this.workers.length} workers)`);

    // Notify once for brute-force phase — ProgressLogger deduplicates further
    if (options.onPhaseChange) options.onPhaseChange('brute-force', this.workers.length);

    const bruteResult = await this._runBruteForceAttack(
      targetHash,
      passwordType,
      options,
      totalAttempts
    );

    const bruteDuration = Date.now() - bruteStartTime;

    if (bruteResult.password) {
      console.log(`[Pool] \u2705 Brute-force SUCCESS! Found "${bruteResult.password}" after ${bruteResult.attempts.toLocaleString()} attempts in ${bruteDuration}ms`);
    } else {
      console.log(`[Pool] \u274C Brute-force exhausted (${bruteResult.attempts.toLocaleString()} attempts, ${bruteDuration}ms)`);
    }

    return {
      password: bruteResult.password,
      attempts: totalAttempts + bruteResult.attempts,
      duration: Date.now() - startTime,
      method: bruteResult.password ? 'brute-force' : 'exhausted'
    };
  }

  /**
   * Dictionary attack — split across ALL workers for parallel hashing.
   */
  _runDictionaryAttack(targetHash, dictionary, onProgress) {
    return new Promise((resolve) => {
      const numWorkers = this.workers.length;
      const chunkSize = Math.ceil(dictionary.length / numWorkers);
      let completed = 0;
      let totalAttempts = 0;
      let found = false;

      console.log(`[Pool] \uD83D\uDCD6 Splitting ${dictionary.length.toLocaleString()} words across ${numWorkers} workers (${chunkSize.toLocaleString()} per worker)`);

      const cleanup = () => {
        this.workers.forEach(w => { w.onmessage = null; w.onerror = null; });
      };

      const cancelOthers = () => {
        this.workers.forEach(w => w.postMessage({ action: 'cancel' }));
      };

      this.workers.forEach((worker, i) => {
        const chunk = dictionary.slice(i * chunkSize, (i + 1) * chunkSize);
        if (chunk.length === 0) { completed++; return; }

        worker.onmessage = (e) => {
          if (found) return;
          const { type, data } = e.data;

          if (type === 'progress' && onProgress) {
            onProgress({ phase: 'dictionary', current: data.current, attempts: data.attempts, speed: data.speed, total: chunk.length });
          }

          if (type === 'found') {
            found = true;
            cancelOthers();
            cleanup();
            resolve({ found: true, password: data.password, attempts: data.attempts });
          }

          if (type === 'exhausted') {
            totalAttempts += data.attempts;
            completed++;
            if (completed === numWorkers) { cleanup(); resolve({ found: false, attempts: totalAttempts }); }
          }

          if (type === 'cancelled') {
            completed++;
            if (completed === numWorkers && !found) { cleanup(); resolve({ found: false, attempts: totalAttempts }); }
          }
        };

        worker.onerror = (err) => {
          console.error(`[Pool] \u274C Worker ${i} error during dictionary attack:`, err);
          completed++;
          if (completed === numWorkers && !found) { cleanup(); resolve({ found: false, attempts: totalAttempts }); }
        };

        console.log(`[Pool] \uD83D\uDCE4 Worker ${i}: dictionary chunk ${chunk.length.toLocaleString()} words`);
        worker.postMessage({ action: 'dictionary', targetHash, dictionary: chunk });
      });
    });
  }

  /**
   * Brute-force attack (parallel across all workers).
   * Aggregates speed correctly: each worker tracks its own attempts/elapsed,
   * the pool sums all workers' speeds for the total throughput figure.
   */
  _runBruteForceAttack(targetHash, passwordType, options, baseAttempts) {
    return new Promise((resolve) => {
      const numWorkers = this.workers.length;
      const totalSpace = PasswordSpaces.getEstimatedAttempts(passwordType.id, options);
      const rangeSize = Math.ceil(totalSpace / numWorkers);
      let completed = 0;
      let totalAttempts = 0;
      let found = false;

      // Per-worker state for aggregation
      const attemptsAggregator = {};   // workerId -> attempts so far
      const speedAggregator = {};      // workerId -> last reported speed (H/s)
      const workerStartTimes = {};     // workerId -> Date.now() when worker started
      let lastProgressLog = 0;

      console.log(`[Pool] \uD83D\uDD28 Distributing ${totalSpace.toLocaleString()} attempts across ${numWorkers} workers (${rangeSize.toLocaleString()} per worker)`);

      const cleanup = () => {
        this.workers.forEach(w => { w.onmessage = null; w.onerror = null; });
      };

      const cancelOthers = () => {
        this.workers.forEach(w => w.postMessage({ action: 'cancel' }));
      };

      const onWorkerMessage = (workerId) => (e) => {
        if (found) return;
        const { type, data } = e.data;

        if (type === 'progress') {
          attemptsAggregator[workerId] = data.attempts;
          // Each worker reports its own H/s; sum = total pool throughput
          speedAggregator[workerId] = data.speed;

          if (options.onProgress) {
            const aggregatedAttempts = Object.values(attemptsAggregator).reduce((s, a) => s + a, 0);
            const aggregatedSpeed    = Object.values(speedAggregator).reduce((s, v) => s + v, 0);
            const percent = totalSpace > 0 ? Math.floor((aggregatedAttempts / totalSpace) * 100) : 0;

            if (percent >= lastProgressLog + 10) {
              console.log(`[Pool] \uD83D\uDD28 Brute-force progress: ${percent}% (${aggregatedAttempts.toLocaleString()}/${totalSpace.toLocaleString()}, ~${aggregatedSpeed.toLocaleString()} H/s total)`);
              lastProgressLog = percent;
            }

            options.onProgress({
              phase: 'brute-force',
              current: data.current,
              attempts: baseAttempts + aggregatedAttempts,
              // Pass aggregated total speed — ProgressLogger.updatePerformance() will average it
              speed: aggregatedSpeed,
              total: totalSpace
            });
          }
        }

        if (type === 'found') {
          found = true;
          console.log(`[Pool] \u2705 Worker ${workerId} found password: "${data.password}"`);
          cancelOthers();
          cleanup();
          const aggregatedSoFar = Object.values(attemptsAggregator).reduce((s, a) => s + a, 0);
          resolve({
            password: data.password,
            attempts: aggregatedSoFar + data.attempts
          });
        }

        if (type === 'exhausted') {
          completed++;
          totalAttempts += data.attempts;
          console.log(`[Pool] \uD83D\uDD28 Worker ${workerId} exhausted (${data.attempts.toLocaleString()} attempts, ${completed}/${numWorkers} done)`);
          if (completed === numWorkers) { cleanup(); resolve({ password: null, attempts: totalAttempts }); }
        }
      };

      this.workers.forEach((worker, i) => {
        workerStartTimes[i] = Date.now();
        attemptsAggregator[i] = 0;
        speedAggregator[i] = 0;

        worker.onmessage = onWorkerMessage(i);
        worker.onerror = (err) => {
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

  /**
   * Cancel all active tasks
   */
  cancel() {
    console.log('[Pool] \uD83D\uDED1 Cancelling all workers');
    this.workers.forEach(w => w.postMessage({ action: 'cancel' }));
    this.activeTask = null;
  }
}

// Singleton instance
const workerPool = new WorkerPool();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkerPool, workerPool };
}
