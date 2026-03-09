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
    
    // Safely access bruteForceStrategy with null checks
    const strategy = passwordType?.bruteForceStrategy || {};
    let totalAttempts = 0;
    const startTime = Date.now();
    
    console.log(`[Pool] 🎯 Target: ${targetHash.substring(0, 16)}... (type: ${passwordType.id})`);
    
    // Phase 1: Dictionary Attack (if supported)
    if (strategy.dictionarySupport && options.dictionary && options.dictionary.length > 0) {
      const dictStartTime = Date.now();
      console.log(`[Pool] 📚 Phase 1: Dictionary attack starting (${options.dictionary.length.toLocaleString()} words)`);
      
      const dictResult = await this._runDictionaryAttack(
        targetHash,
        options.dictionary,
        options.onProgress
      );
      
      const dictDuration = Date.now() - dictStartTime;
      
      if (dictResult.found) {
        console.log(`[Pool] ✅ Dictionary attack SUCCESS! Found "${dictResult.password}" after ${dictResult.attempts.toLocaleString()} attempts in ${dictDuration}ms`);
        return {
          password: dictResult.password,
          attempts: dictResult.attempts,
          duration: Date.now() - startTime,
          method: 'dictionary'
        };
      }
      
      console.log(`[Pool] ❌ Dictionary attack exhausted (${dictResult.attempts.toLocaleString()} attempts, ${dictDuration}ms) - moving to brute-force`);
      totalAttempts += dictResult.attempts;
    } else {
      if (!strategy.dictionarySupport) {
        console.log(`[Pool] ⏭️  Skipping dictionary phase (not supported for ${passwordType.id})`);
      } else if (!options.dictionary || options.dictionary.length === 0) {
        console.log(`[Pool] ⏭️  Skipping dictionary phase (no dictionary loaded)`);
      }
    }
    
    // Phase 2: Brute-force (parallel)
    const bruteStartTime = Date.now();
    console.log(`[Pool] 🔨 Phase 2: Brute-force attack starting (${this.workers.length} workers)`);
    
    const bruteResult = await this._runBruteForceAttack(
      targetHash,
      passwordType,
      options,
      totalAttempts
    );
    
    const bruteDuration = Date.now() - bruteStartTime;
    
    if (bruteResult.password) {
      console.log(`[Pool] ✅ Brute-force SUCCESS! Found "${bruteResult.password}" after ${bruteResult.attempts.toLocaleString()} attempts in ${bruteDuration}ms`);
    } else {
      console.log(`[Pool] ❌ Brute-force exhausted (${bruteResult.attempts.toLocaleString()} attempts, ${bruteDuration}ms)`);
    }
    
    return {
      password: bruteResult.password,
      attempts: totalAttempts + bruteResult.attempts,
      duration: Date.now() - startTime,
      method: bruteResult.password ? 'brute-force' : 'exhausted'
    };
  }
  
  /**
   * Dictionary attack (single worker, sequential)
   */
  _runDictionaryAttack(targetHash, dictionary, onProgress) {
    return new Promise((resolve) => {
      const worker = this.workers[0];
      let lastProgressLog = 0;
      
      const cleanup = () => {
        worker.onmessage = null;
        worker.onerror = null;
      };
      
      worker.onmessage = (e) => {
        const { type, data } = e.data;
        
        if (type === 'progress' && onProgress) {
          // Log every 25% progress
          const percent = Math.floor((data.attempts / dictionary.length) * 100);
          if (percent >= lastProgressLog + 25) {
            console.log(`[Pool] 📖 Dictionary progress: ${percent}% (${data.attempts.toLocaleString()}/${dictionary.length.toLocaleString()} words, ${data.speed.toLocaleString()} H/s)`);
            lastProgressLog = percent;
          }
          
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
          resolve({
            found: true,
            password: data.password,
            attempts: data.attempts
          });
        }
        
        if (type === 'exhausted') {
          cleanup();
          resolve({
            found: false,
            attempts: data.attempts
          });
        }
      };
      
      worker.onerror = (err) => {
        console.error('[Pool] ❌ Worker error during dictionary attack:', err);
        cleanup();
        resolve({ found: false, attempts: 0 });
      };
      
      console.log(`[Pool] 📤 Sending dictionary to worker (${dictionary.length.toLocaleString()} words)`);
      worker.postMessage({
        action: 'dictionary',
        targetHash,
        dictionary
      });
    });
  }
  
  /**
   * Brute-force attack (parallel across all workers)
   */
  _runBruteForceAttack(targetHash, passwordType, options, baseAttempts) {
    return new Promise((resolve) => {
      const numWorkers = this.workers.length;
      const totalSpace = PasswordSpaces.getEstimatedAttempts(
        passwordType.id,
        options
      );
      
      const rangeSize = Math.ceil(totalSpace / numWorkers);
      let completed = 0;
      let totalAttempts = 0;
      let found = false;
      
      const progressAggregator = {};
      let lastProgressLog = 0;
      
      console.log(`[Pool] 🔨 Distributing ${totalSpace.toLocaleString()} attempts across ${numWorkers} workers (${rangeSize.toLocaleString()} per worker)`);
      
      const cleanup = () => {
        this.workers.forEach(w => {
          w.onmessage = null;
          w.onerror = null;
        });
      };
      
      const onWorkerMessage = (workerId) => (e) => {
        if (found) return;
        
        const { type, data } = e.data;
        
        if (type === 'progress') {
          progressAggregator[workerId] = data.attempts;
          
          if (options.onProgress) {
            const aggregatedAttempts = Object.values(progressAggregator)
              .reduce((sum, a) => sum + a, 0);
            
            // Log every 10% progress
            const percent = Math.floor((aggregatedAttempts / totalSpace) * 100);
            if (percent >= lastProgressLog + 10) {
              console.log(`[Pool] 🔨 Brute-force progress: ${percent}% (${aggregatedAttempts.toLocaleString()}/${totalSpace.toLocaleString()} attempts, ~${(data.speed * numWorkers).toLocaleString()} H/s)`);
              lastProgressLog = percent;
            }
            
            options.onProgress({
              phase: 'brute-force',
              current: data.current,
              attempts: baseAttempts + aggregatedAttempts,
              speed: data.speed * numWorkers, // Aggregate speed
              total: totalSpace
            });
          }
        }
        
        if (type === 'found') {
          found = true;
          console.log(`[Pool] ✅ Worker ${workerId} found password: "${data.password}"`);
          cleanup();
          resolve({
            password: data.password,
            attempts: baseAttempts + Object.values(progressAggregator)
              .reduce((sum, a) => sum + a, 0)
          });
        }
        
        if (type === 'exhausted') {
          completed++;
          totalAttempts += data.attempts;
          console.log(`[Pool] 🔨 Worker ${workerId} exhausted (${data.attempts.toLocaleString()} attempts, ${completed}/${numWorkers} workers done)`);
          
          if (completed === numWorkers) {
            cleanup();
            resolve({
              password: null,
              attempts: totalAttempts
            });
          }
        }
      };
      
      // Start all workers with their ranges
      this.workers.forEach((worker, i) => {
        worker.onmessage = onWorkerMessage(i);
        worker.onerror = (err) => {
          console.error(`[Pool] ❌ Worker ${i} error:`, err);
          completed++;
          if (completed === numWorkers) {
            cleanup();
            resolve({ password: null, attempts: totalAttempts });
          }
        };
        
        const offset = i * rangeSize;
        const limit = Math.min(rangeSize, totalSpace - offset);
        
        console.log(`[Pool] 📤 Worker ${i}: offset=${offset.toLocaleString()}, limit=${limit.toLocaleString()}`);
        
        worker.postMessage({
          action: 'brute-force',
          targetHash,
          passwordType,
          offset,
          limit
        });
      });
    });
  }
  
  /**
   * Cancel all active tasks
   */
  cancel() {
    console.log('[Pool] 🛑 Cancelling all workers');
    this.workers.forEach(w => {
      w.postMessage({ action: 'cancel' });
    });
    this.activeTask = null;
  }
}

// Singleton instance
const workerPool = new WorkerPool();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WorkerPool, workerPool };
}
