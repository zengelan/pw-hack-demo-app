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
    console.log(`Worker pool initialized: ${this.maxWorkers} workers`);
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
    
    const strategy = passwordType.bruteForceStrategy;
    let totalAttempts = 0;
    const startTime = Date.now();
    
    // Phase 1: Dictionary Attack (if supported)
    if (strategy.dictionarySupport && options.dictionary && options.dictionary.length > 0) {
      console.log(`Phase 1: Dictionary attack (${options.dictionary.length} words)`);
      
      const dictResult = await this._runDictionaryAttack(
        targetHash,
        options.dictionary,
        options.onProgress
      );
      
      if (dictResult.found) {
        return {
          password: dictResult.password,
          attempts: dictResult.attempts,
          duration: Date.now() - startTime,
          method: 'dictionary'
        };
      }
      
      totalAttempts += dictResult.attempts;
    }
    
    // Phase 2: Brute-force (parallel)
    console.log('Phase 2: Brute-force attack (parallel)');
    
    const bruteResult = await this._runBruteForceAttack(
      targetHash,
      passwordType,
      options,
      totalAttempts
    );
    
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
      
      const cleanup = () => {
        worker.onmessage = null;
        worker.onerror = null;
      };
      
      worker.onmessage = (e) => {
        const { type, data } = e.data;
        
        if (type === 'progress' && onProgress) {
          onProgress({
            phase: 'dictionary',
            current: data.current,
            attempts: data.attempts,
            speed: data.speed
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
        console.error('Worker error:', err);
        cleanup();
        resolve({ found: false, attempts: 0 });
      };
      
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
            
            options.onProgress({
              phase: 'brute-force',
              current: data.current,
              attempts: baseAttempts + aggregatedAttempts,
              speed: data.speed * numWorkers // Aggregate speed
            });
          }
        }
        
        if (type === 'found') {
          found = true;
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
          console.error('Worker error:', err);
          completed++;
          if (completed === numWorkers) {
            cleanup();
            resolve({ password: null, attempts: totalAttempts });
          }
        };
        
        const offset = i * rangeSize;
        const limit = Math.min(rangeSize, totalSpace - offset);
        
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
    this.workers.forEach(w => {
      w.postMessage({ action: 'cancel' });
    });
    this.activeTask = null;
  }
}

// Singleton instance
const workerPool = new WorkerPool();
