const fs = require('fs').promises;
const path = require('path');
const { globalTimer } = require('./timer');

class RAGQueryCache {
  constructor() {
    this.cacheFile = path.join(__dirname, '../../data/rag-query-cache.json');
    this.ttlHours = 168; // Cache expires after 168 hours (7 days)
    this.maxQueries = 10; // Maximum number of cached queries (LRU eviction)
    this.fuzzyThreshold = 0.8; // Minimum similarity score for fuzzy matches (0-1)
  }

  /**
   * Normalize query for better fuzzy matching by removing common words and punctuation
   * @param {string} query - Query to normalize
   * @returns {string} Normalized query
   */
  normalizeForFuzzy(query) {
    return query
      .toLowerCase()
      .replace(/\b(what|is|the|do|you|have|tell|me|about|can|we|get|any|some)\b/g, '') // Remove question words
      .replace(/\b(availability|available|items?|options?|choice|choices)\b/g, '') // Remove availability/options words
      .replace(/[?!.,;:'"()]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')         // Normalize spaces
      .trim();                      // Remove leading/trailing spaces
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Edit distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,     // deletion
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j - 1] + 1  // substitution
          );
        }
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate similarity score between two strings (0-1, higher is more similar)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score between 0 and 1
   */
  calculateSimilarity(str1, str2) {
    // Normalize both strings for better fuzzy matching
    const normalizedStr1 = this.normalizeForFuzzy(str1);
    const normalizedStr2 = this.normalizeForFuzzy(str2);
    
    const maxLen = Math.max(normalizedStr1.length, normalizedStr2.length);
    if (maxLen === 0) return 1; // Both strings are empty
    
    const distance = this.levenshteinDistance(normalizedStr1, normalizedStr2);
    return 1 - (distance / maxLen);
  }

  /**
   * Find the best fuzzy match for a query in the cache
   * @param {string} query - Query to match
   * @param {Object} cache - Cache object with queries
   * @returns {Object|null} {key, similarity} or null if no good match
   */
  findFuzzyMatch(query, cache) {
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const cachedQuery of Object.keys(cache.queries || {})) {
      const similarity = this.calculateSimilarity(query, cachedQuery);
      
      if (similarity >= this.fuzzyThreshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = {
          key: cachedQuery,
          similarity: similarity
        };
      }
    }

    return bestMatch;
  }

  /**
   * Check if a cached entry has expired
   * @param {Object} queryData - The cached query data object
   * @returns {boolean} True if expired, false if still valid
   */
  isExpired(queryData) {
    if (!queryData || !queryData.expiresAt) {
      return true; // No expiration data means expired
    }
    return new Date() > new Date(queryData.expiresAt);
  }

  /**
   * Get cached vector search results for a query (with fuzzy matching)
   * @param {string} cleanedQuery - The preprocessed query string
   * @returns {Object|null} Cached vector results or null if not found/expired
   */
  async getCachedResults(cleanedQuery) {
    try {
      const timerLabel = `RAG-Cache-Lookup-${Date.now()}`;
      globalTimer.start(timerLabel);

      const cache = await this.loadCache();
      
      // Try exact match first
      const queryData = cache.queries?.[cleanedQuery];
      
      if (queryData && !this.isExpired(queryData)) {
        // Update access time for LRU
        queryData.lastAccessed = Date.now();
        queryData.hitCount = (queryData.hitCount || 0) + 1;
        await this.saveCache(cache);
        
        globalTimer.end(timerLabel);
        console.log(`🎯 RAG Cache Hit (exact): "${cleanedQuery}"`);
        return queryData.vectorResults;
      }

      // Try fuzzy matching if exact match failed
      console.log(`🔍 RAG Cache Miss (exact): "${cleanedQuery}" - trying fuzzy match...`);
      const fuzzyMatch = this.findFuzzyMatch(cleanedQuery, cache);
      
      if (fuzzyMatch) {
        const fuzzyQueryData = cache.queries[fuzzyMatch.key];
        
        if (fuzzyQueryData && !this.isExpired(fuzzyQueryData)) {
          // Update access time for LRU
          fuzzyQueryData.lastAccessed = Date.now();
          fuzzyQueryData.hitCount = (fuzzyQueryData.hitCount || 0) + 1;
          await this.saveCache(cache);
          
          globalTimer.end(timerLabel);
          console.log(`🎯 RAG Cache Hit (fuzzy): "${cleanedQuery}" → "${fuzzyMatch.key}" (similarity: ${fuzzyMatch.similarity.toFixed(3)})`);
          return fuzzyQueryData.vectorResults;
        }
      }

      globalTimer.end(timerLabel);
      console.log(`❌ RAG Cache Miss: "${cleanedQuery}"`);
      return null;

    } catch (error) {
      console.error('❌ RAG cache lookup error:', error.message);
      return null;
    }
  }

  /**
   * Cache vector search results for a query
   * @param {string} cleanedQuery - The preprocessed query string
   * @param {Array} vectorResults - The vector search results to cache
   */
  async cacheResults(cleanedQuery, vectorResults) {
    try {
      const timerLabel = `RAG-Cache-Save-${Date.now()}`;
      globalTimer.start(timerLabel);

      const cache = await this.loadCache();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (this.ttlHours * 60 * 60 * 1000));

      // Add/update query
      cache.queries[cleanedQuery] = {
        vectorResults: vectorResults,
        cachedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastAccessed: now.toISOString(),
        hitCount: 0
      };

      // Enforce max size with LRU eviction
      await this.enforceMaxSize(cache);
      
      // Update metadata
      cache.metadata.currentSize = Object.keys(cache.queries).length;
      cache.metadata.lastUpdated = now.toISOString();

      await this.saveCache(cache);

      console.log(`💾 RAG Cache Saved: "${cleanedQuery}" (${cache.metadata.currentSize}/${this.maxQueries})`);
      globalTimer.end(timerLabel);

    } catch (error) {
      console.error('❌ Error saving to RAG cache:', error.message);
    }
  }

  /**
   * Load cache from file
   */
  async loadCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty cache
        return {
          queries: {},
          metadata: {
            maxSize: this.maxQueries,
            currentSize: 0,
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          }
        };
      }
      throw error;
    }
  }

  /**
   * Save cache to file
   */
  async saveCache(cache) {
    // Ensure data directory exists
    const dataDir = path.dirname(this.cacheFile);
    await fs.mkdir(dataDir, { recursive: true });
    
    await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
  }

  /**
   * Enforce maximum cache size using LRU eviction
   */
  async enforceMaxSize(cache) {
    const currentSize = Object.keys(cache.queries).length;
    
    if (currentSize <= this.maxQueries) {
      return; // Within limits
    }

    console.log(`📊 RAG Cache full (${currentSize}/${this.maxQueries}), evicting oldest entries...`);

    // Sort by lastAccessed (oldest first)
    const sortedQueries = Object.entries(cache.queries)
      .sort(([,a], [,b]) => new Date(a.lastAccessed) - new Date(b.lastAccessed));

    // Remove oldest entries until we're within limits
    const toRemove = currentSize - this.maxQueries;
    for (let i = 0; i < toRemove; i++) {
      const [queryToRemove] = sortedQueries[i];
      delete cache.queries[queryToRemove];
      console.log(`🗑️ RAG Cache evicted: "${queryToRemove}"`);
    }
  }

  /**
   * Remove a specific query from cache
   */
  async removeQuery(cleanedQuery) {
    try {
      const cache = await this.loadCache();
      if (cache.queries[cleanedQuery]) {
        delete cache.queries[cleanedQuery];
        cache.metadata.currentSize = Object.keys(cache.queries).length;
        cache.metadata.lastUpdated = new Date().toISOString();
        await this.saveCache(cache);
      }
    } catch (error) {
      console.error('❌ Error removing from RAG cache:', error.message);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStatus() {
    try {
      const cache = await this.loadCache();
      const queries = Object.entries(cache.queries).map(([query, data]) => ({
        query,
        hitCount: data.hitCount || 0,
        cachedAt: data.cachedAt,
        lastAccessed: data.lastAccessed
      }));

      return {
        success: true,
        metadata: cache.metadata,
        queries: queries.sort((a, b) => b.hitCount - a.hitCount), // Sort by hit count
        cacheFile: this.cacheFile
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear all cached queries
   */
  async invalidateCache() {
    try {
      const emptyCache = {
        queries: {},
        metadata: {
          maxSize: this.maxQueries,
          currentSize: 0,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        }
      };

      await this.saveCache(emptyCache);
      console.log('🗑️ RAG Cache invalidated');
      
      return {
        success: true,
        message: 'RAG query cache cleared successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Set TTL hours
   */
  setTTL(hours) {
    this.ttlHours = hours;
    console.log(`⏰ RAG Cache TTL set to ${hours} hours`);
  }

  /**
   * Set max queries
   */
  setMaxSize(maxQueries) {
    this.maxQueries = maxQueries;
    console.log(`📊 RAG Cache max size set to ${maxQueries} queries`);
  }
}

// Create singleton instance
const ragQueryCache = new RAGQueryCache();

module.exports = { RAGQueryCache, ragQueryCache }; 