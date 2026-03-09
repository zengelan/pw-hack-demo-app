/**
 * Dictionary Loader
 * Fetches password dictionaries from URLs and caches them.
 * Filters dictionaries based on regex patterns.
 */

class DictionaryLoader {
  constructor() {
    this.cache = new Map();
  }
  
  /**
   * Load dictionary from URL
   */
  async load(url, filterRegex = null) {
    // Check cache
    const cacheKey = `${url}::${filterRegex || 'all'}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      console.log(`[Dict] ✅ Cache HIT for ${url.split('/').pop()} (${cached.length.toLocaleString()} words)`);
      return cached;
    }
    
    console.log(`[Dict] 📥 Fetching dictionary: ${url}`);
    const fetchStart = Date.now();
    
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const text = await res.text();
      const fetchDuration = Date.now() - fetchStart;
      
      let words = text.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      console.log(`[Dict] ✅ Downloaded ${words.length.toLocaleString()} words from ${url.split('/').pop()} in ${fetchDuration}ms`);
      
      // Apply filter regex
      if (filterRegex) {
        const beforeFilter = words.length;
        const regex = new RegExp(filterRegex);
        words = words.filter(w => regex.test(w));
        const filtered = beforeFilter - words.length;
        console.log(`[Dict] 🔍 Filtered ${filtered.toLocaleString()} words using regex /${filterRegex}/ (${words.length.toLocaleString()} remaining)`);
      } else {
        console.log(`[Dict] ⏭️  No filter applied - using all ${words.length.toLocaleString()} words`);
      }
      
      this.cache.set(cacheKey, words);
      return words;
      
    } catch (e) {
      console.error(`[Dict] ❌ Failed to load dictionary from ${url}:`, e.message);
      return [];
    }
  }
  
  /**
   * Load all dictionaries for a password type
   */
  async loadForType(passwordType) {
    const strategy = passwordType.bruteForceStrategy;
    if (!strategy.dictionarySupport || !strategy.dictionaryUrls) {
      console.log(`[Dict] ⏭️  No dictionary support for type: ${passwordType.id}`);
      return [];
    }
    
    console.log(`[Dict] 📚 Loading ${strategy.dictionaryUrls.length} dictionaries for ${passwordType.id}`);
    const loadStart = Date.now();
    
    const filterRegex = strategy.dictionaryFilterRegex;
    const allWords = [];
    
    for (let i = 0; i < strategy.dictionaryUrls.length; i++) {
      const url = strategy.dictionaryUrls[i];
      console.log(`[Dict] 📖 Dictionary ${i + 1}/${strategy.dictionaryUrls.length}: ${url.split('/').pop()}`);
      const words = await this.load(url, filterRegex);
      allWords.push(...words);
    }
    
    // Deduplicate
    const beforeDedup = allWords.length;
    const unique = [...new Set(allWords)];
    const duplicates = beforeDedup - unique.length;
    
    const loadDuration = Date.now() - loadStart;
    
    if (duplicates > 0) {
      console.log(`[Dict] 🔄 Removed ${duplicates.toLocaleString()} duplicate entries`);
    }
    
    console.log(`[Dict] ✅ Total loaded for ${passwordType.id}: ${unique.length.toLocaleString()} unique words in ${loadDuration}ms`);
    return unique;
  }
  
  /**
   * Clear cache
   */
  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[Dict] 🗑️  Cache cleared (${size} entries removed)`);
  }
}

const dictionaryLoader = new DictionaryLoader();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DictionaryLoader, dictionaryLoader };
}
