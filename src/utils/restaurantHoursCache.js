const fs = require('fs').promises;
const path = require('path');
const { globalTimer } = require('./timer');

class RestaurantHoursCache {
  constructor() {
    this.cacheFile = path.join(__dirname, '../../data/restaurant-hours-cache.json');
    this.ttlHours = 24; // Cache expires after 24 hours
  }

  /**
   * Get restaurant hours from cache or fetch from source
   * @param {Function} fetchFunction - Function to fetch hours from RAG if cache miss
   * @returns {Promise<Object>} Restaurant hours data
   */
  async getHours(fetchFunction) {
    try {
      // Try to get from cache first
      const cachedHours = await this.getCachedHours();
      if (cachedHours) {
        console.log('📋 Restaurant hours loaded from cache');
        return cachedHours;
      }

      // Cache miss or expired - fetch from source
      console.log('🔄 Cache miss/expired - fetching restaurant hours from RAG...');
      const freshHours = await globalTimer.timeAsync('Fetch-Restaurant-Hours-RAG', async () => {
        return await fetchFunction();
      });

      // Save to cache
      await this.saveToCache(freshHours);
      console.log('💾 Restaurant hours cached successfully');
      
      return freshHours;

    } catch (error) {
      console.error('❌ Error in restaurant hours cache:', error);
      
      // Try to use stale cache as fallback
      const staleHours = await this.getStaleCache();
      if (staleHours) {
        console.log('⚠️ Using stale cache as fallback');
        return staleHours;
      }

      // If all else fails, try the fetch function directly
      console.log('🆘 Cache completely failed - attempting direct fetch...');
      return await fetchFunction();
    }
  }

  /**
   * Get hours from cache if valid
   * @returns {Promise<Object|null>} Cached hours or null if invalid/missing
   */
  async getCachedHours() {
    try {
      const cacheData = await fs.readFile(this.cacheFile, 'utf8');
      const cache = JSON.parse(cacheData);

      // Check if cache is still valid
      const now = new Date();
      const expiresAt = new Date(cache.expiresAt);

      if (now < expiresAt) {
        console.log(`📅 Cache valid until: ${expiresAt.toISOString()}`);
        return {
          ...cache.hours,
          source: 'Cache',
          lastUpdated: cache.lastUpdated,
          cacheExpiresAt: cache.expiresAt
        };
      } else {
        console.log(`⏰ Cache expired at: ${expiresAt.toISOString()}`);
        return null;
      }

    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📂 No cache file found');
      } else {
        console.error('❌ Error reading cache file:', error);
      }
      return null;
    }
  }

  /**
   * Get stale cache data (ignoring expiration) for fallback
   * @returns {Promise<Object|null>} Stale cache data or null
   */
  async getStaleCache() {
    try {
      const cacheData = await fs.readFile(this.cacheFile, 'utf8');
      const cache = JSON.parse(cacheData);
      
      console.log('📜 Retrieved stale cache data');
      return {
        ...cache.hours,
        source: 'Stale Cache',
        lastUpdated: cache.lastUpdated,
        cacheExpiresAt: cache.expiresAt
      };

    } catch (error) {
      console.error('❌ Error reading stale cache:', error);
      return null;
    }
  }

  /**
   * Save restaurant hours to cache file
   * @param {Object} hours - Restaurant hours data
   */
  async saveToCache(hours) {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.cacheFile);
      await fs.mkdir(dataDir, { recursive: true });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + (this.ttlHours * 60 * 60 * 1000));

      const cacheData = {
        hours: hours,
        lastUpdated: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttlHours: this.ttlHours
      };

      await fs.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
      console.log(`💾 Cache saved, expires at: ${expiresAt.toISOString()}`);

    } catch (error) {
      console.error('❌ Error saving to cache:', error);
      // Don't throw - caching failure shouldn't break the app
    }
  }

  /**
   * Manually invalidate the cache
   */
  async invalidateCache() {
    try {
      await fs.unlink(this.cacheFile);
      console.log('🗑️ Cache invalidated successfully');
      return { success: true, message: 'Cache invalidated' };
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📂 No cache file to invalidate');
        return { success: true, message: 'No cache file found' };
      } else {
        console.error('❌ Error invalidating cache:', error);
        return { success: false, error: error.message };
      }
    }
  }

  /**
   * Get cache status for debugging
   */
  async getCacheStatus() {
    try {
      const cacheData = await fs.readFile(this.cacheFile, 'utf8');
      const cache = JSON.parse(cacheData);
      
      const now = new Date();
      const expiresAt = new Date(cache.expiresAt);
      const isValid = now < expiresAt;

      return {
        exists: true,
        valid: isValid,
        lastUpdated: cache.lastUpdated,
        expiresAt: cache.expiresAt,
        ttlHours: cache.ttlHours,
        timeUntilExpiry: isValid ? expiresAt.getTime() - now.getTime() : 0
      };

    } catch (error) {
      return {
        exists: false,
        valid: false,
        error: error.code === 'ENOENT' ? 'File not found' : error.message
      };
    }
  }

  /**
   * Set custom TTL (useful for testing or special circumstances)
   * @param {number} hours - Hours until cache expires
   */
  setTTL(hours) {
    this.ttlHours = hours;
    console.log(`⏰ Cache TTL set to ${hours} hours`);
  }
}

// Export singleton instance
const restaurantHoursCache = new RestaurantHoursCache();

module.exports = {
  RestaurantHoursCache,
  restaurantHoursCache
}; 