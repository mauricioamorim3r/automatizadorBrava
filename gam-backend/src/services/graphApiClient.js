import { Client } from '@microsoft/microsoft-graph-client';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { redis } from '../config/database.js';
import { logger } from '../config/logs.js';
import { microsoftAuth } from './microsoftAuth.js';

// Rate limiter configuration based on September 2025 Graph API limits
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'graph_api',
  points: 4, // 4 requests per second (reduced from 20 due to new limits)
  duration: 1,
  blockDuration: 60, // Block for 1 minute if rate limit exceeded
});

// Circuit breaker pattern for handling API failures
class CircuitBreaker {
  constructor(failureThreshold = 5, recoveryTimeout = 30000) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}

class GraphApiClient {
  constructor() {
    this.circuitBreaker = new CircuitBreaker();
    this.cache = redis;
  }

  // Create authenticated Graph client for user
  async createClient(userId) {
    const accessToken = await microsoftAuth.getValidAccessToken(userId);
    
    const authProvider = {
      getAccessToken: async () => accessToken
    };

    return Client.initWithMiddleware({ 
      authProvider,
      middleware: {
        // Add custom middleware for logging and rate limiting
        before: async (context) => {
          // Rate limiting
          await rateLimiter.consume(userId);
          
          // Logging
          logger.info('Graph API request', {
            userId,
            url: context.request.url,
            method: context.request.method
          });
        },
        after: async (context) => {
          // Log response
          logger.info('Graph API response', {
            userId,
            url: context.request.url,
            status: context.response?.status,
            duration: context.response?.headers?.get('request-id')
          });
        }
      }
    });
  }

  // Execute Graph API request with rate limiting, caching, and circuit breaker
  async executeRequest(userId, requestFn, cacheKey = null, cacheTtl = 300) {
    // Check cache first
    if (cacheKey) {
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        logger.debug('Cache hit', { cacheKey, userId });
        return cached;
      }
    }

    // Execute with circuit breaker and rate limiting
    return await this.circuitBreaker.execute(async () => {
      // Rate limiting
      await rateLimiter.consume(userId);
      
      // Execute the actual request
      const client = await this.createClient(userId);
      const result = await requestFn(client);
      
      // Cache result if cache key provided
      if (cacheKey && result) {
        await this.setCache(cacheKey, result, cacheTtl);
      }
      
      return result;
    });
  }

  // Cache operations
  async getFromCache(key) {
    try {
      const cached = await this.cache.get(`graph_cache:${key}`);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Cache get failed', { key, error: error.message });
      return null;
    }
  }

  async setCache(key, value, ttl = 300) {
    try {
      await this.cache.setEx(`graph_cache:${key}`, ttl, JSON.stringify(value));
    } catch (error) {
      logger.warn('Cache set failed', { key, error: error.message });
    }
  }

  async deleteFromCache(key) {
    try {
      await this.cache.del(`graph_cache:${key}`);
    } catch (error) {
      logger.warn('Cache delete failed', { key, error: error.message });
    }
  }

  // User profile operations
  async getUserProfile(userId) {
    const cacheKey = `user_profile:${userId}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        return await client.api('/me').select('displayName,mail,id,userPrincipalName').get();
      },
      cacheKey,
      3600 // Cache for 1 hour
    );
  }

  // Drive operations
  async getUserDrives(userId) {
    const cacheKey = `user_drives:${userId}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        return await client.api('/me/drives').get();
      },
      cacheKey,
      1800 // Cache for 30 minutes
    );
  }

  async getDriveItems(userId, driveId, itemPath = 'root', pageSize = 200) {
    const cacheKey = `drive_items:${userId}:${driveId}:${itemPath}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        const endpoint = driveId === 'default' 
          ? `/me/drive/${itemPath}:/children`
          : `/drives/${driveId}/items/${itemPath}/children`;
          
        return await client
          .api(endpoint)
          .top(pageSize)
          .select('id,name,size,lastModifiedDateTime,file,folder,webUrl')
          .get();
      },
      cacheKey,
      300 // Cache for 5 minutes
    );
  }

  async downloadFile(userId, driveId, itemId) {
    // No caching for file downloads
    return await this.executeRequest(
      userId,
      async (client) => {
        const endpoint = driveId === 'default' 
          ? `/me/drive/items/${itemId}/content`
          : `/drives/${driveId}/items/${itemId}/content`;
          
        return await client.api(endpoint).getStream();
      }
    );
  }

  async uploadFile(userId, driveId, parentPath, fileName, fileStream, conflictBehavior = 'replace') {
    // Clear cache after upload
    const cacheKey = `drive_items:${userId}:${driveId}:${parentPath}`;
    
    const result = await this.executeRequest(
      userId,
      async (client) => {
        const endpoint = driveId === 'default' 
          ? `/me/drive/${parentPath}:/${fileName}:/content`
          : `/drives/${driveId}/items/${parentPath}:/${fileName}:/content`;
          
        return await client
          .api(endpoint)
          .header('Content-Type', 'application/octet-stream')
          .put(fileStream);
      }
    );
    
    // Clear cache
    await this.deleteFromCache(cacheKey);
    
    return result;
  }

  // SharePoint sites operations
  async getUserSites(userId, search = '') {
    const cacheKey = `user_sites:${userId}:${search}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        let endpoint = '/sites';
        if (search) {
          endpoint += `?search=${encodeURIComponent(search)}`;
        }
        
        return await client
          .api(endpoint)
          .select('id,name,displayName,webUrl,description')
          .get();
      },
      cacheKey,
      1800 // Cache for 30 minutes
    );
  }

  async getSiteById(userId, siteId) {
    const cacheKey = `site:${userId}:${siteId}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        return await client
          .api(`/sites/${siteId}`)
          .select('id,name,displayName,webUrl,description')
          .get();
      },
      cacheKey,
      3600 // Cache for 1 hour
    );
  }

  async getSiteDrives(userId, siteId) {
    const cacheKey = `site_drives:${userId}:${siteId}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        return await client.api(`/sites/${siteId}/drives`).get();
      },
      cacheKey,
      1800 // Cache for 30 minutes
    );
  }

  async getSiteLists(userId, siteId) {
    const cacheKey = `site_lists:${userId}:${siteId}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        return await client
          .api(`/sites/${siteId}/lists`)
          .select('id,name,displayName,description,webUrl')
          .get();
      },
      cacheKey,
      1800 // Cache for 30 minutes
    );
  }

  async getListItems(userId, siteId, listId, pageSize = 200) {
    const cacheKey = `list_items:${userId}:${siteId}:${listId}`;
    
    return await this.executeRequest(
      userId,
      async (client) => {
        return await client
          .api(`/sites/${siteId}/lists/${listId}/items`)
          .expand('fields')
          .top(pageSize)
          .get();
      },
      cacheKey,
      300 // Cache for 5 minutes
    );
  }

  // Batch operations for efficiency
  async batchRequest(userId, requests) {
    return await this.executeRequest(
      userId,
      async (client) => {
        const batch = client.createBatch();
        
        requests.forEach((request, index) => {
          batch.get(request.id || index.toString(), client.api(request.url), request.callback);
        });
        
        return await batch.execute();
      }
    );
  }

  // Health check
  async healthCheck(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return {
        healthy: true,
        userProfile: {
          displayName: profile.displayName,
          email: profile.mail
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  // Get rate limit status
  async getRateLimitStatus(userId) {
    try {
      const res = await rateLimiter.get(userId);
      return {
        remaining: res ? res.remainingHits : 4,
        reset: res ? new Date(Date.now() + res.msBeforeNext) : null,
        limit: 4
      };
    } catch (error) {
      return {
        remaining: 4,
        reset: null,
        limit: 4
      };
    }
  }
}

export const graphApiClient = new GraphApiClient();
export default graphApiClient;