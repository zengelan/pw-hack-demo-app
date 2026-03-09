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
    
    // Select generator implementation
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
   * Generator implementations
   */
  generators: {
    
    /**
     * Calendar date generator (DDMMYYYY)
     */
    calendar: function* (config, options) {
      const [yearMin, yearMax] = config.yearRange;
      const orderDesc = config.orderBy === 'year_desc';
      
      const years = [];
      for (let y = yearMin; y <= yearMax; y++) years.push(y);
      if (orderDesc) years.reverse();
      
      for (const year of years) {
        for (let month = 1; month <= 12; month++) {
          const daysInMonth = new Date(year, month, 0).getDate();
          for (let day = 1; day <= daysInMonth; day++) {
            yield String(day).padStart(2, '0') + 
                  String(month).padStart(2, '0') + 
                  String(year);
          }
        }
      }
    },
    
    /**
     * Numeric range generator (00000000-99999999)
     */
    numericRange: function* (config, options) {
      const { min, max, padding } = config;
      const limit = options.limit || (max - min + 1);
      const actualMax = Math.min(max, min + limit - 1);
      
      for (let i = min; i <= actualMax; i++) {
        yield String(i).padStart(padding, '0');
      }
    },
    
    /**
     * Combinatorial generator (aaaaaaaa-zzzzzzzz)
     */
    combinatorial: function* (config, options) {
      const { alphabet, length } = config;
      const limit = options.limit || Infinity;
      const base = alphabet.length;
      
      let count = 0;
      const indices = new Array(length).fill(0);
      
      while (count < limit) {
        // Convert indices to string
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
        
        if (pos < 0) break; // Overflow, exhausted space
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
    
    // Check truncation
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
  // Inside worker
  self.PasswordSpaces = PasswordSpaces;
}
