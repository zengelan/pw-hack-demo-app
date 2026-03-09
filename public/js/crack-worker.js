/**
 * Crack Worker - Background computation for password cracking
 * Runs in Web Worker context (no DOM access)
 */

importScripts('/js/password-spaces.js');

let cancelled = false;

// Message handler
self.onmessage = async function(e) {
  const { action } = e.data;
  
  if (action === 'cancel') {
    cancelled = true;
    return;
  }
  
  cancelled = false;
  
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
  
  for (const word of dictionary) {
    if (cancelled) {
      self.postMessage({ type: 'cancelled', data: { attempts } });
      return;
    }
    
    attempts++;
    const hash = await sha256(word);
    
    if (hash === targetHash) {
      self.postMessage({
        type: 'found',
        data: { password: word, attempts }
      });
      return;
    }
    
    if (attempts % 5000 === 0) {
      const elapsed = Date.now() - startTime;
      const speed = elapsed > 0 ? Math.floor(attempts / (elapsed / 1000)) : 0;
      
      self.postMessage({
        type: 'progress',
        data: { current: word, attempts, speed }
      });
    }
  }
  
  self.postMessage({
    type: 'exhausted',
    data: { attempts }
  });
}

/**
 * Brute-force attack with offset and limit
 */
async function bruteForceAttack({ targetHash, passwordType, offset, limit }) {
  // Initialize PasswordSpaces if not already
  if (!PasswordSpaces.types.length) {
    await PasswordSpaces.init();
  }
  
  const generator = PasswordSpaces.getGenerator(passwordType.id, { limit: offset + limit });
  
  let attempts = 0;
  let skipped = 0;
  const startTime = Date.now();
  
  // Skip to offset
  for (const candidate of generator) {
    if (skipped < offset) {
      skipped++;
      continue;
    }
    
    if (cancelled) {
      self.postMessage({ type: 'cancelled', data: { attempts } });
      return;
    }
    
    attempts++;
    const hash = await sha256(candidate);
    
    if (hash === targetHash) {
      self.postMessage({
        type: 'found',
        data: { password: candidate, attempts }
      });
      return;
    }
    
    if (attempts % 5000 === 0) {
      const elapsed = Date.now() - startTime;
      const speed = elapsed > 0 ? Math.floor(attempts / (elapsed / 1000)) : 0;
      
      self.postMessage({
        type: 'progress',
        data: { current: candidate, attempts, speed }
      });
    }
    
    if (attempts >= limit) break;
  }
  
  self.postMessage({
    type: 'exhausted',
    data: { attempts }
  });
}

/**
 * SHA-256 hash function
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
