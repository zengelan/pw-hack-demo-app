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
    const hash = md5(word);
    
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
    const hash = md5(candidate);
    
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
 * MD5 hash function (simple implementation)
 */
function md5(string) {
  function rotateLeft(value, amount) {
    return (value << amount) | (value >>> (32 - amount));
  }
  
  function addUnsigned(x, y) {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  }
  
  function md5_f(x, y, z) {
    return (x & y) | ((~x) & z);
  }
  
  function md5_g(x, y, z) {
    return (x & z) | (y & (~z));
  }
  
  function md5_h(x, y, z) {
    return x ^ y ^ z;
  }
  
  function md5_i(x, y, z) {
    return y ^ (x | (~z));
  }
  
  function md5_ff(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(md5_f(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  
  function md5_gg(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(md5_g(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  
  function md5_hh(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(md5_h(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  
  function md5_ii(a, b, c, d, x, s, ac) {
    a = addUnsigned(a, addUnsigned(addUnsigned(md5_i(b, c, d), x), ac));
    return addUnsigned(rotateLeft(a, s), b);
  }
  
  function convertToWordArray(string) {
    let lWordCount;
    const lMessageLength = string.length;
    const lNumberOfWords_temp1 = lMessageLength + 8;
    const lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
    const lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
    const lWordArray = Array(lNumberOfWords - 1);
    let lBytePosition = 0;
    let lByteCount = 0;
    
    while (lByteCount < lMessageLength) {
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
      lByteCount++;
    }
    
    lWordCount = (lByteCount - (lByteCount % 4)) / 4;
    lBytePosition = (lByteCount % 4) * 8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
    
    return lWordArray;
  }
  
  function wordToHex(lValue) {
    let wordToHexValue = "";
    let wordToHexValue_temp = "";
    let lByte, lCount;
    
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255;
      wordToHexValue_temp = "0" + lByte.toString(16);
      wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2);
    }
    
    return wordToHexValue;
  }
  
  let x = [];
  let k, AA, BB, CC, DD, a, b, c, d;
  const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21;
  
  x = convertToWordArray(string);
  a = 0x67452301;
  b = 0xEFCDAB89;
  c = 0x98BADCFE;
  d = 0x10325476;
  
  for (k = 0; k < x.length; k += 16) {
    AA = a;
    BB = b;
    CC = c;
    DD = d;
    
    a = md5_ff(a, b, c, d, x[k + 0], S11, 0xD76AA478);
    d = md5_ff(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
    c = md5_ff(c, d, a, b, x[k + 2], S13, 0x242070DB);
    b = md5_ff(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
    a = md5_ff(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
    d = md5_ff(d, a, b, c, x[k + 5], S12, 0x4787C62A);
    c = md5_ff(c, d, a, b, x[k + 6], S13, 0xA8304613);
    b = md5_ff(b, c, d, a, x[k + 7], S14, 0xFD469501);
    a = md5_ff(a, b, c, d, x[k + 8], S11, 0x698098D8);
    d = md5_ff(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
    c = md5_ff(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
    b = md5_ff(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
    a = md5_ff(a, b, c, d, x[k + 12], S11, 0x6B901122);
    d = md5_ff(d, a, b, c, x[k + 13], S12, 0xFD987193);
    c = md5_ff(c, d, a, b, x[k + 14], S13, 0xA679438E);
    b = md5_ff(b, c, d, a, x[k + 15], S14, 0x49B40821);
    
    a = md5_gg(a, b, c, d, x[k + 1], S21, 0xF61E2562);
    d = md5_gg(d, a, b, c, x[k + 6], S22, 0xC040B340);
    c = md5_gg(c, d, a, b, x[k + 11], S23, 0x265E5A51);
    b = md5_gg(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
    a = md5_gg(a, b, c, d, x[k + 5], S21, 0xD62F105D);
    d = md5_gg(d, a, b, c, x[k + 10], S22, 0x2441453);
    c = md5_gg(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
    b = md5_gg(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
    a = md5_gg(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
    d = md5_gg(d, a, b, c, x[k + 14], S22, 0xC33707D6);
    c = md5_gg(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
    b = md5_gg(b, c, d, a, x[k + 8], S24, 0x455A14ED);
    a = md5_gg(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
    d = md5_gg(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
    c = md5_gg(c, d, a, b, x[k + 7], S23, 0x676F02D9);
    b = md5_gg(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
    
    a = md5_hh(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
    d = md5_hh(d, a, b, c, x[k + 8], S32, 0x8771F681);
    c = md5_hh(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
    b = md5_hh(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
    a = md5_hh(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
    d = md5_hh(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
    c = md5_hh(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
    b = md5_hh(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
    a = md5_hh(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
    d = md5_hh(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
    c = md5_hh(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
    b = md5_hh(b, c, d, a, x[k + 6], S34, 0x4881D05);
    a = md5_hh(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
    d = md5_hh(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
    c = md5_hh(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
    b = md5_hh(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
    
    a = md5_ii(a, b, c, d, x[k + 0], S41, 0xF4292244);
    d = md5_ii(d, a, b, c, x[k + 7], S42, 0x432AFF97);
    c = md5_ii(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
    b = md5_ii(b, c, d, a, x[k + 5], S44, 0xFC93A039);
    a = md5_ii(a, b, c, d, x[k + 12], S41, 0x655B59C3);
    d = md5_ii(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
    c = md5_ii(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
    b = md5_ii(b, c, d, a, x[k + 1], S44, 0x85845DD1);
    a = md5_ii(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
    d = md5_ii(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
    c = md5_ii(c, d, a, b, x[k + 6], S43, 0xA3014314);
    b = md5_ii(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
    a = md5_ii(a, b, c, d, x[k + 4], S41, 0xF7537E82);
    d = md5_ii(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
    c = md5_ii(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
    b = md5_ii(b, c, d, a, x[k + 9], S44, 0xEB86D391);
    
    a = addUnsigned(a, AA);
    b = addUnsigned(b, BB);
    c = addUnsigned(c, CC);
    d = addUnsigned(d, DD);
  }
  
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
}
