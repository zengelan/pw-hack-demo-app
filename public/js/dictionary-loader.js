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
      console.log('Dictionary cache hit:', url);
      return this.cache.get(cacheKey);
    }
    
    console.log('Fetching dictionary:', url);
    
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const text = await res.text();
      let words = text.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      // Apply filter regex
      if (filterRegex) {
        const regex = new RegExp(filterRegex);
        words = words.filter(w => regex.test(w));
      }
      
      console.log(`Dictionary loaded: ${words.length} words from ${url}`);
      this.cache.set(cacheKey, words);
      return words;
      
    } catch (e) {
      console.error('Dictionary load failed:', url, e);
      return [];
    }
  }
  
  /**
   * Load all dictionaries for a password type
   */
  async loadForType(passwordType) {
    const strategy = passwordType.bruteForceStrategy;
    if (!strategy.dictionarySupport || !strategy.dictionaryUrls) {
      return [];
    }
    
    const filterRegex = strategy.dictionaryFilterRegex;
    const allWords = [];
    
    for (const url of strategy.dictionaryUrls) {
      const words = await this.load(url, filterRegex);
      allWords.push(...words);
    }
    
    // Deduplicate
    const unique = [...new Set(allWords)];
    console.log(`Total dictionary entries for ${passwordType.id}: ${unique.length}`);
    return unique;
  }
  
  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

const dictionaryLoader = new DictionaryLoader();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DictionaryLoader, dictionaryLoader };
}
