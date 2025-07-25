const fs = require('fs').promises;
const path = require('path');
const { globalTimer } = require('./timer');

class RAGQueryCache {
  constructor() {
    this.cacheFile = path.join(__dirname, '../../data/rag-query-cache.json');
    this.ttlHours = 24; // Cache expires after 24 hours
    this.maxQueries = 10; // Maximum number of cached queries (LRU eviction)
  }

  /**
   * Get cached vector search results for a query
   * @param {string} cleanedQuery - The preprocessed query string
   * @returns {Object|null} Cached vector results or null if not found/expired
   */
  async getCachedResults(cleanedQuery) {
    try {
      const timerLabel = `RAG-Cache-Lookup-${Date.now()}`;
      globalTimer.start(timerLabel);

      const cache = await this.loadCache();
      const queryData = cache.queries[cleanedQuery];

      if (!queryData) {
        console.log(`🔍 RAG Cache Miss: "${cleanedQuery}"`);
        globalTimer.end(timerLabel);
        return null;
      }

      // Check if expired
      const now = new Date();
      const expiresAt = new Date(queryData.expiresAt);
      
      if (now > expiresAt) {
        console.log(`⏰ RAG Cache Expired: "${cleanedQuery}"`);
        await this.removeQuery(cleanedQuery);
        globalTimer.end(timerLabel);
        return null;
      }

      // Update access time for LRU
      queryData.lastAccessed = now.toISOString();
      queryData.hitCount = (queryData.hitCount || 0) + 1;
      await this.saveCache(cache);

      console.log(`🎯 RAG Cache Hit: "${cleanedQuery}" (hits: ${queryData.hitCount})`);
      globalTimer.end(timerLabel);
      
      return queryData.vectorResults;

    } catch (error) {
      console.error('❌ Error reading RAG cache:', error.message);
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