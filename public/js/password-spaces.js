/**
 * Password Space Generators
 * Implements brute-force iteration strategies based on backend PASSWORD_TYPES metadata.
 * Each generator is a JavaScript generator function for memory-efficient iteration.
 */

const PasswordSpaces = {
  types: [],
  typesById: {},
  
  /**
   * Load password type metadata from backend
   */
  async init() {
    try {
      const res = await fetch('/api/password-types');
      const data = await res.json();
      this.types = data.types;
      this.typesById = Object.fromEntries(this.types.map(t => [t.id, t]));
      console.log('Password spaces initialized:', this.types.length, 'types');
    } catch (e) {
      console.error('Failed to load password types:', e);
      this.types = [];
      this.typesById = {};
    }
  },
  
  /**
   * Get generator for a password type
   * @param {string} passwordTypeId
   * @param {object} options - { offset: number, limit: number }
   *   offset: how many entries to skip from the start (default 0)
   *   limit:  max entries to yield after offset (default: all remaining)
   */
  getGenerator(passwordTypeId, options = {}) {
    const type = this.typesById[passwordTypeId];
    if (!type) throw new Error(`Unknown password type: ${passwordTypeId}`);
    
    const strategy = type.bruteForceStrategy;
    if (!strategy) {
      console.warn(`Password type ${passwordTypeId} has no bruteForceStrategy defined`);
      throw new Error(`Password type ${passwordTypeId} has no brute-force strategy`);
    }
    
    const generatorType = strategy.generatorType;
    if (!generatorType) {
      throw new Error(`Password type ${passwordTypeId} has no generatorType defined`);
    }
    
    switch (generatorType) {
      case 'calendar':
        return this.generators.calendar(strategy.generatorConfig, options);
      case 'numeric_range':
        return this.generators.numericRange(strategy.generatorConfig, options);
      case 'combinatorial':
        return this.generators.combinatorial(strategy.generatorConfig, options);
      default:
        throw new Error(`Unknown generator type: ${generatorType}`);
    }
  },
  
  /**
   * Generator implementations.
   * All generators now support options.offset (skip N entries) and options.limit (yield at most N entries).
   */
  generators: {
    
    /**
     * Calendar date generator (DDMMYYYY)
     * Supports offset/limit for efficient worker sharding.
     */
    calendar: function* (config, options = {}) {
      const [yearMin, yearMax] = config.yearRange;
      const orderDesc = config.orderBy === 'year_desc';
      const offset = options.offset || 0;
      const limit = options.limit != null ? options.limit : Infinity;
      
      const years = [];
      for (let y = yearMin; y <= yearMax; y++) years.push(y);
      if (orderDesc) years.reverse();
      
      let globalIndex = 0;
      let yielded = 0;
      
      for (const year of years) {
        for (let month = 1; month <= 12; month++) {
          const daysInMonth = new Date(year, month, 0).getDate();
          for (let day = 1; day <= daysInMonth; day++) {
            if (globalIndex < offset) {
              globalIndex++;
              continue;
            }
            if (yielded >= limit) return;
            yield String(day).padStart(2, '0') +
                  String(month).padStart(2, '0') +
                  String(year);
            globalIndex++;
            yielded++;
          }
        }
      }
    },
    
    /**
     * Numeric range generator (00000000-99999999)
     * Supports offset/limit for efficient worker sharding.
     */
    numericRange: function* (config, options = {}) {
      const { min, max, padding } = config;
      const offset = options.offset || 0;
      const limit = options.limit != null ? options.limit : (max - min + 1);
      
      const startAt = min + offset;
      const stopBefore = Math.min(max + 1, startAt + limit);
      
      for (let i = startAt; i < stopBefore; i++) {
        yield String(i).padStart(padding, '0');
      }
    },
    
    /**
     * Combinatorial generator (aaaaaaaa-zzzzzzzz)
     * Supports offset/limit for efficient worker sharding.
     * Uses direct index arithmetic to jump to offset in O(length) — no loop needed.
     */
    combinatorial: function* (config, options = {}) {
      const { alphabet, length } = config;
      const offset = options.offset || 0;
      const limit = options.limit != null ? options.limit : Infinity;
      const base = alphabet.length;
      
      // Convert linear offset to base-N indices directly (O(length) jump, no skipping)
      const indices = new Array(length).fill(0);
      let remaining = offset;
      for (let pos = length - 1; pos >= 0 && remaining > 0; pos--) {
        indices[pos] = remaining % base;
        remaining = Math.floor(remaining / base);
      }
      if (remaining > 0) return; // offset exceeds total space
      
      let count = 0;
      while (count < limit) {
        yield indices.map(i => alphabet[i]).join('');
        count++;
        
        // Increment base-N counter
        let pos = length - 1;
        while (pos >= 0) {
          indices[pos]++;
          if (indices[pos] < base) break;
          indices[pos] = 0;
          pos--;
        }
        if (pos < 0) break; // Exhausted entire space
      }
    }
  },
  
  /**
   * Get metadata for a password type
   */
  getMetadata(passwordTypeId) {
    return this.typesById[passwordTypeId];
  },
  
  /**
   * Get estimated attempts for a type with given options
   */
  getEstimatedAttempts(passwordTypeId, options = {}) {
    const type = this.typesById[passwordTypeId];
    if (!type) return 0;
    
    const strategy = type.bruteForceStrategy;
    if (!strategy) {
      console.warn(`Password type ${passwordTypeId} has no bruteForceStrategy`);
      return 0;
    }
    
    if (options.truncationMode) {
      const mode = strategy.truncationModes?.find(m => m.name === options.truncationMode);
      if (mode) return mode.limit;
    }
    
    if (options.limit) {
      return Math.min(options.limit, strategy.estimatedAttempts || 0);
    }
    
    return strategy.estimatedAttempts || 0;
  },
  
  /**
   * Get label for password type (for UI display)
   */
  getLabel(passwordTypeId) {
    const type = this.typesById[passwordTypeId];
    return type ? type.label : passwordTypeId || 'Unknown';
  }
};

// Export for worker environment
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.PasswordSpaces = PasswordSpaces;
}
