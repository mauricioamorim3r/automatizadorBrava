import { logger } from '../config/logs.js';
import { db } from '../config/database.js';
import { executions } from '../models/schema.js';
import { eq } from 'drizzle-orm';

// Retry configuration
export const RETRY_STRATEGIES = {
  IMMEDIATE: 'immediate',
  FIXED_DELAY: 'fixed_delay',
  EXPONENTIAL_BACKOFF: 'exponential_backoff',
  LINEAR_BACKOFF: 'linear_backoff'
};

export const ERROR_TYPES = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  AUTHENTICATION: 'authentication',
  VALIDATION: 'validation',
  RESOURCE_LIMIT: 'resource_limit',
  UNKNOWN: 'unknown'
};

class RetryService {
  constructor() {
    this.retryQueue = new Map(); // executionId -> retry info
    this.config = {
      maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
      maxRetryDelay: parseInt(process.env.MAX_RETRY_DELAY) || 300000, // 5 minutes
      baseDelay: parseInt(process.env.BASE_RETRY_DELAY) || 1000, // 1 second
      jitterRange: parseFloat(process.env.RETRY_JITTER) || 0.1 // 10% jitter
    };
  }

  // Determine if error is retryable
  isRetryableError(error, errorType = null) {
    // Auto-detect error type if not provided
    if (!errorType) {
      errorType = this.classifyError(error);
    }

    const retryableTypes = [
      ERROR_TYPES.NETWORK,
      ERROR_TYPES.TIMEOUT,
      ERROR_TYPES.RESOURCE_LIMIT
    ];

    const nonRetryableTypes = [
      ERROR_TYPES.AUTHENTICATION,
      ERROR_TYPES.VALIDATION
    ];

    if (nonRetryableTypes.includes(errorType)) {
      return false;
    }

    if (retryableTypes.includes(errorType)) {
      return true;
    }

    // Check specific error messages
    const retryablePatterns = [
      /network timeout/i,
      /connection reset/i,
      /connection refused/i,
      /service unavailable/i,
      /rate limit/i,
      /too many requests/i,
      /temporary failure/i,
      /econnreset/i,
      /enotfound/i,
      /etimedout/i
    ];

    const nonRetryablePatterns = [
      /invalid.*credentials/i,
      /unauthorized/i,
      /forbidden/i,
      /not found/i,
      /invalid.*token/i,
      /validation.*failed/i,
      /invalid.*input/i
    ];

    const errorMessage = error.message || error.toString();

    // Check non-retryable patterns first
    for (const pattern of nonRetryablePatterns) {
      if (pattern.test(errorMessage)) {
        return false;
      }
    }

    // Check retryable patterns
    for (const pattern of retryablePatterns) {
      if (pattern.test(errorMessage)) {
        return true;
      }
    }

    // Default to not retryable for unknown errors
    return false;
  }

  // Classify error type based on error object
  classifyError(error) {
    const errorMessage = (error.message || error.toString()).toLowerCase();

    if (errorMessage.includes('network') || errorMessage.includes('connection') || 
        errorMessage.includes('econnreset') || errorMessage.includes('enotfound')) {
      return ERROR_TYPES.NETWORK;
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
      return ERROR_TYPES.TIMEOUT;
    }

    if (errorMessage.includes('unauthorized') || errorMessage.includes('forbidden') ||
        errorMessage.includes('invalid') && errorMessage.includes('credential')) {
      return ERROR_TYPES.AUTHENTICATION;
    }

    if (errorMessage.includes('validation') || errorMessage.includes('invalid input')) {
      return ERROR_TYPES.VALIDATION;
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests') ||
        errorMessage.includes('quota exceeded')) {
      return ERROR_TYPES.RESOURCE_LIMIT;
    }

    return ERROR_TYPES.UNKNOWN;
  }

  // Calculate retry delay based on strategy
  calculateRetryDelay(attempt, strategy = RETRY_STRATEGIES.EXPONENTIAL_BACKOFF, baseDelay = null) {
    const base = baseDelay || this.config.baseDelay;
    let delay;

    switch (strategy) {
      case RETRY_STRATEGIES.IMMEDIATE:
        delay = 0;
        break;

      case RETRY_STRATEGIES.FIXED_DELAY:
        delay = base;
        break;

      case RETRY_STRATEGIES.LINEAR_BACKOFF:
        delay = base * attempt;
        break;

      case RETRY_STRATEGIES.EXPONENTIAL_BACKOFF:
      default:
        delay = base * Math.pow(2, attempt - 1);
        break;
    }

    // Apply jitter to prevent thundering herd
    const jitter = delay * this.config.jitterRange * (Math.random() - 0.5) * 2;
    delay += jitter;

    // Cap at maximum delay
    delay = Math.min(delay, this.config.maxRetryDelay);

    return Math.max(0, Math.round(delay));
  }

  // Create retry context for an execution
  createRetryContext(executionId, automation, originalInputData, retryConfig = {}) {
    const context = {
      executionId,
      automationId: automation.id,
      automation,
      originalInputData,
      attempts: 0,
      maxRetries: retryConfig.maxRetries || this.config.maxRetries,
      strategy: retryConfig.strategy || RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
      baseDelay: retryConfig.baseDelay || this.config.baseDelay,
      lastError: null,
      lastAttempt: Date.now(),
      nextAttempt: null,
      retryHistory: [],
      createdAt: Date.now()
    };

    this.retryQueue.set(executionId, context);
    return context;
  }

  // Execute with retry logic
  async executeWithRetry(executorFunction, executionId, automation, inputData, retryConfig = {}) {
    const context = this.createRetryContext(executionId, automation, inputData, retryConfig);

    logger.info('Starting execution with retry logic', {
      executionId,
      automationId: automation.id,
      maxRetries: context.maxRetries,
      strategy: context.strategy
    });

    while (context.attempts <= context.maxRetries) {
      context.attempts++;
      context.lastAttempt = Date.now();

      try {
        logger.info('Attempting execution', {
          executionId,
          attempt: context.attempts,
          maxRetries: context.maxRetries
        });

        // Execute the function
        const result = await executorFunction(automation, inputData, `retry_${context.attempts}`);

        // Success - clean up and return
        this.retryQueue.delete(executionId);

        logger.info('Execution succeeded', {
          executionId,
          attempt: context.attempts,
          duration: Date.now() - context.createdAt
        });

        return result;

      } catch (error) {
        context.lastError = error;
        const errorType = this.classifyError(error);
        const isRetryable = this.isRetryableError(error, errorType);

        // Add to retry history
        context.retryHistory.push({
          attempt: context.attempts,
          error: error.message,
          errorType,
          timestamp: Date.now(),
          isRetryable
        });

        logger.warn('Execution attempt failed', {
          executionId,
          attempt: context.attempts,
          error: error.message,
          errorType,
          isRetryable
        });

        // Update execution record with retry info
        await this.updateExecutionWithRetryInfo(executionId, context);

        // Check if we should retry
        if (!isRetryable || context.attempts >= context.maxRetries) {
          // No more retries - clean up and throw
          this.retryQueue.delete(executionId);

          logger.error('Execution failed after all retries', {
            executionId,
            totalAttempts: context.attempts,
            finalError: error.message,
            duration: Date.now() - context.createdAt
          });

          // Enhance error with retry information
          const enhancedError = new Error(
            `Execution failed after ${context.attempts} attempts. Last error: ${error.message}`
          );
          enhancedError.originalError = error;
          enhancedError.retryContext = context;
          throw enhancedError;
        }

        // Calculate delay and schedule next attempt
        const delay = this.calculateRetryDelay(context.attempts, context.strategy, context.baseDelay);
        context.nextAttempt = Date.now() + delay;

        logger.info('Scheduling retry attempt', {
          executionId,
          nextAttempt: context.attempts + 1,
          delay: `${delay}ms`,
          retryAt: new Date(context.nextAttempt).toISOString()
        });

        // Wait for retry delay
        if (delay > 0) {
          await this.sleep(delay);
        }
      }
    }
  }

  // Update execution record with retry information
  async updateExecutionWithRetryInfo(executionId, context) {
    try {
      const retryInfo = {
        attempts: context.attempts,
        maxRetries: context.maxRetries,
        strategy: context.strategy,
        retryHistory: context.retryHistory,
        lastError: context.lastError?.message,
        nextAttempt: context.nextAttempt ? new Date(context.nextAttempt).toISOString() : null
      };

      await db
        .update(executions)
        .set({
          retryInfo,
          updatedAt: new Date()
        })
        .where(eq(executions.id, executionId));

    } catch (error) {
      logger.error('Failed to update execution with retry info', {
        executionId,
        error: error.message
      });
    }
  }

  // Sleep utility
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get retry status for execution
  getRetryStatus(executionId) {
    const context = this.retryQueue.get(executionId);
    
    if (!context) {
      return null;
    }

    return {
      executionId,
      attempts: context.attempts,
      maxRetries: context.maxRetries,
      strategy: context.strategy,
      lastError: context.lastError?.message,
      nextAttempt: context.nextAttempt ? new Date(context.nextAttempt).toISOString() : null,
      retryHistory: context.retryHistory,
      isRetrying: context.attempts < context.maxRetries
    };
  }

  // Get all active retries
  getActiveRetries() {
    const active = [];
    
    for (const [executionId, context] of this.retryQueue.entries()) {
      active.push({
        executionId,
        automationId: context.automationId,
        attempts: context.attempts,
        maxRetries: context.maxRetries,
        lastError: context.lastError?.message,
        nextAttempt: context.nextAttempt ? new Date(context.nextAttempt).toISOString() : null,
        createdAt: new Date(context.createdAt).toISOString()
      });
    }

    return active;
  }

  // Cancel retry for execution
  cancelRetry(executionId) {
    const context = this.retryQueue.get(executionId);
    
    if (context) {
      this.retryQueue.delete(executionId);
      
      logger.info('Retry cancelled', {
        executionId,
        attempts: context.attempts
      });
      
      return true;
    }
    
    return false;
  }

  // Clean up old retry contexts
  cleanupOldRetries(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    const toDelete = [];

    for (const [executionId, context] of this.retryQueue.entries()) {
      if (now - context.createdAt > maxAge) {
        toDelete.push(executionId);
      }
    }

    for (const executionId of toDelete) {
      this.retryQueue.delete(executionId);
    }

    if (toDelete.length > 0) {
      logger.info('Cleaned up old retry contexts', { 
        count: toDelete.length 
      });
    }

    return toDelete.length;
  }

  // Get retry statistics
  getRetryStats() {
    const stats = {
      activeRetries: this.retryQueue.size,
      retryStrategies: {},
      errorTypes: {},
      averageAttempts: 0
    };

    let totalAttempts = 0;

    for (const context of this.retryQueue.values()) {
      // Count strategies
      stats.retryStrategies[context.strategy] = (stats.retryStrategies[context.strategy] || 0) + 1;
      
      // Count error types
      for (const retry of context.retryHistory) {
        stats.errorTypes[retry.errorType] = (stats.errorTypes[retry.errorType] || 0) + 1;
      }
      
      totalAttempts += context.attempts;
    }

    if (this.retryQueue.size > 0) {
      stats.averageAttempts = totalAttempts / this.retryQueue.size;
    }

    return stats;
  }
}

export const retryService = new RetryService();

// Start cleanup interval
setInterval(() => {
  retryService.cleanupOldRetries();
}, 60 * 60 * 1000); // Clean up every hour

export default retryService;