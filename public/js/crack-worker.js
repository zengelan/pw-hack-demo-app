/**
 * Crack Worker - Background computation for password cracking
 * Runs in Web Worker context (no DOM access)
 */

importScripts('/js/password-spaces.js');

let cancelled = false;
let debugLogCount = 0;

// Message handler
self.onmessage = async function(e) {
  const { action } = e.data;
  
  if (action === 'cancel') {
    cancelled = true;
    return;
  }
  
  cancelled = false;
  debugLogCount = 0;
  
  if (action === 'dictionary') {
    await dictionaryAttack(e.data);
  } else if (action === 'brute-force') {
    await bruteForceAttack(e.data);
  }
};

/**
 * Dictionary attack
 */
async function dictionaryAttack({ targetHash, dictionary }) {
  let attempts = 0;
  const startTime = Date.now();
  
  console.log(`[Worker] Dictionary attack started: ${dictionary.length} words, target: ${targetHash.substring(0,16)}...`);
  
  for (const word of dictionary) {
    if (cancelled) {
      self.postMessage({ type: 'cancelled', data: { attempts } });
      return;
    }
    
    attempts++;
    const hash = await sha256(word);
    
    if (debugLogCount < 3) {
      console.log(`[Worker] Dict attempt ${attempts}: "${word}" -> ${hash.substring(0,16)}...`);
      debugLogCount++;
    }
    
    if (hash === targetHash) {
      console.log(`[Worker] ✅ FOUND via dictionary! "${word}" at attempt ${attempts}`);
      self.postMessage({ type: 'found', data: { password: word, attempts } });
      return;
    }
    
    if (attempts % 5000 === 0) {
      const elapsed = Date.now() - startTime;
      const speed = elapsed > 0 ? Math.floor(attempts / (elapsed / 1000)) : 0;
      self.postMessage({ type: 'progress', data: { current: word, attempts, speed } });
    }
  }
  
  console.log(`[Worker] Dictionary exhausted after ${attempts} attempts`);
  self.postMessage({ type: 'exhausted', data: { attempts } });
}

/**
 * Brute-force attack with offset and limit.
 * Passes offset+limit directly to the generator — no manual skip loop needed.
 * numericRange and combinatorial jump to the offset in O(1)/O(length).
 * calendar iterates but skips without hashing, which is still much cheaper.
 */
async function bruteForceAttack({ targetHash, passwordType, offset, limit }) {
  if (!PasswordSpaces.types.length) {
    await PasswordSpaces.init();
  }
  
  console.log(`[Worker] Brute-force started: type=${passwordType.id}, offset=${offset}, limit=${limit}, target=${targetHash.substring(0,16)}...`);
  
  // Generator starts at the correct position — no skip loop required
  const generator = PasswordSpaces.getGenerator(passwordType.id, { offset, limit });
  
  let attempts = 0;
  const startTime = Date.now();
  
  for (const candidate of generator) {
    if (cancelled) {
      self.postMessage({ type: 'cancelled', data: { attempts } });
      return;
    }
    
    attempts++;
    const hash = await sha256(candidate);
    
    if (debugLogCount < 3) {
      console.log(`[Worker] BF attempt ${attempts} (global ${offset + attempts}): "${candidate}" -> ${hash.substring(0,16)}...`);
      if (debugLogCount === 0) {
        console.log(`[Worker] Target hash:    ${targetHash}`);
        console.log(`[Worker] Generated hash: ${hash}`);
        console.log(`[Worker] Match: ${hash === targetHash}`);
      }
      debugLogCount++;
    }
    
    if (hash === targetHash) {
      console.log(`[Worker] ✅ FOUND via brute-force! "${candidate}" at attempt ${attempts} (global ${offset + attempts})`);
      self.postMessage({ type: 'found', data: { password: candidate, attempts } });
      return;
    }
    
    if (attempts % 5000 === 0) {
      const elapsed = Date.now() - startTime;
      const speed = elapsed > 0 ? Math.floor(attempts / (elapsed / 1000)) : 0;
      self.postMessage({ type: 'progress', data: { current: candidate, attempts, speed } });
    }
  }
  
  console.log(`[Worker] Brute-force exhausted after ${attempts} attempts (limit: ${limit})`);
  self.postMessage({ type: 'exhausted', data: { attempts } });
}

/**
 * SHA-256 hash function (Web Crypto API)
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
