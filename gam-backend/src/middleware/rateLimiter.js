// Simple rate limiter implementation that works without redis
class SimpleRateLimiter {
  constructor() {
    this.requests = new Map(); // ip -> array of timestamps
    this.cleanup(); // Start cleanup interval
  }

  // Rate limit middleware factory
  rateLimiter(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      maxRequests = 100,
      message = 'Too many requests from this IP, please try again later.'
    } = options;

    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get or create request history for this IP
      if (!this.requests.has(ip)) {
        this.requests.set(ip, []);
      }

      const requestHistory = this.requests.get(ip);

      // Remove old requests outside the window
      const validRequests = requestHistory.filter(timestamp => timestamp > windowStart);
      
      // Check if limit exceeded
      if (validRequests.length >= maxRequests) {
        return res.status(429).json({
          error: {
            message: message,
            status: 429,
            retryAfter: Math.ceil(windowMs / 1000)
          }
        });
      }

      // Add current request
      validRequests.push(now);
      this.requests.set(ip, validRequests);

      next();
    };
  }

  // Cleanup old entries periodically
  cleanup() {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const [ip, requests] of this.requests.entries()) {
        const validRequests = requests.filter(timestamp => now - timestamp < maxAge);
        
        if (validRequests.length === 0) {
          this.requests.delete(ip);
        } else {
          this.requests.set(ip, validRequests);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  // Get current stats
  getStats() {
    return {
      totalIPs: this.requests.size,
      totalRequests: Array.from(this.requests.values()).reduce((sum, reqs) => sum + reqs.length, 0)
    };
  }
}

// Create global instance
const rateLimiterInstance = new SimpleRateLimiter();

// Export the middleware factory
export const rateLimiter = rateLimiterInstance.rateLimiter.bind(rateLimiterInstance);

// Export stats function
export const getRateLimitStats = () => rateLimiterInstance.getStats();

export default rateLimiter;