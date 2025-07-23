import { logger } from '../config/logs.js';
import { db } from '../config/database.js';
import { systemLogs } from '../models/schema.js';

// Error severity levels
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Error categories
export const ERROR_CATEGORIES = {
  SYSTEM: 'system',
  USER: 'user',
  AUTOMATION: 'automation',
  INTEGRATION: 'integration',
  PERFORMANCE: 'performance',
  SECURITY: 'security'
};

class ErrorHandlingService {
  constructor() {
    this.errorPatterns = new Map();
    this.errorStats = {
      total: 0,
      bySeverity: {},
      byCategory: {},
      byType: {},
      recentErrors: []
    };
    
    this.initializeErrorPatterns();
  }

  // Initialize common error patterns and their handling strategies
  initializeErrorPatterns() {
    // Network errors
    this.errorPatterns.set(/network timeout|connection.*timeout/i, {
      category: ERROR_CATEGORIES.INTEGRATION,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: true,
      suggestions: ['Check network connectivity', 'Increase timeout values', 'Verify endpoint availability']
    });

    this.errorPatterns.set(/connection refused|econnrefused/i, {
      category: ERROR_CATEGORIES.INTEGRATION,
      severity: ERROR_SEVERITY.HIGH,
      retryable: true,
      suggestions: ['Verify service is running', 'Check firewall settings', 'Confirm correct port/host']
    });

    // Authentication errors
    this.errorPatterns.set(/unauthorized|invalid.*credentials/i, {
      category: ERROR_CATEGORIES.SECURITY,
      severity: ERROR_SEVERITY.HIGH,
      retryable: false,
      suggestions: ['Verify credentials', 'Check token expiration', 'Confirm user permissions']
    });

    this.errorPatterns.set(/token.*expired|access.*denied/i, {
      category: ERROR_CATEGORIES.SECURITY,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: false,
      suggestions: ['Refresh authentication tokens', 'Re-authenticate user', 'Check permission levels']
    });

    // Validation errors
    this.errorPatterns.set(/validation.*failed|invalid.*input/i, {
      category: ERROR_CATEGORIES.USER,
      severity: ERROR_SEVERITY.LOW,
      retryable: false,
      suggestions: ['Review input data format', 'Check required fields', 'Validate data types']
    });

    // Rate limiting
    this.errorPatterns.set(/rate limit|too many requests/i, {
      category: ERROR_CATEGORIES.INTEGRATION,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: true,
      suggestions: ['Implement backoff strategy', 'Reduce request frequency', 'Check API limits']
    });

    // Resource errors
    this.errorPatterns.set(/memory|heap.*out.*space|enomem/i, {
      category: ERROR_CATEGORIES.PERFORMANCE,
      severity: ERROR_SEVERITY.CRITICAL,
      retryable: false,
      suggestions: ['Increase memory allocation', 'Optimize data processing', 'Check for memory leaks']
    });

    this.errorPatterns.set(/disk.*full|enospc/i, {
      category: ERROR_CATEGORIES.SYSTEM,
      severity: ERROR_SEVERITY.CRITICAL,
      retryable: false,
      suggestions: ['Free up disk space', 'Archive old logs', 'Increase storage capacity']
    });

    // Database errors
    this.errorPatterns.set(/database.*connection|connection.*database/i, {
      category: ERROR_CATEGORIES.SYSTEM,
      severity: ERROR_SEVERITY.HIGH,
      retryable: true,
      suggestions: ['Check database connectivity', 'Verify connection string', 'Restart database service']
    });

    this.errorPatterns.set(/syntax.*error|invalid.*query/i, {
      category: ERROR_CATEGORIES.AUTOMATION,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: false,
      suggestions: ['Review query syntax', 'Check database schema', 'Validate field names']
    });

    // Browser automation errors
    this.errorPatterns.set(/element.*not.*found|selector.*not.*found/i, {
      category: ERROR_CATEGORIES.AUTOMATION,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: true,
      suggestions: ['Update element selector', 'Wait for page load', 'Check DOM structure changes']
    });

    this.errorPatterns.set(/page.*crash|browser.*crash/i, {
      category: ERROR_CATEGORIES.SYSTEM,
      severity: ERROR_SEVERITY.HIGH,
      retryable: true,
      suggestions: ['Restart browser session', 'Reduce memory usage', 'Update browser version']
    });
  }

  // Analyze error and classify it
  analyzeError(error, context = {}) {
    const errorMessage = error.message || error.toString();
    let analysis = {
      originalError: error,
      message: errorMessage,
      category: ERROR_CATEGORIES.SYSTEM,
      severity: ERROR_SEVERITY.MEDIUM,
      retryable: false,
      suggestions: [],
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      pattern: null
    };

    // Find matching pattern
    for (const [pattern, config] of this.errorPatterns.entries()) {
      if (pattern.test(errorMessage)) {
        analysis = {
          ...analysis,
          category: config.category,
          severity: config.severity,
          retryable: config.retryable,
          suggestions: [...config.suggestions],
          pattern: pattern.toString()
        };
        break;
      }
    }

    // Additional context-based analysis
    if (context.stepType) {
      analysis.stepType = context.stepType;
      analysis.suggestions.push(`Review ${context.stepType} step configuration`);
    }

    if (context.automationId) {
      analysis.automationId = context.automationId;
    }

    if (context.executionId) {
      analysis.executionId = context.executionId;
    }

    return analysis;
  }

  // Handle error with comprehensive logging and recovery strategies
  async handleError(error, context = {}) {
    try {
      const analysis = this.analyzeError(error, context);
      
      // Update statistics
      this.updateErrorStats(analysis);

      // Log error with analysis
      logger.error('Error handled with analysis', {
        errorId: this.generateErrorId(),
        message: analysis.message,
        category: analysis.category,
        severity: analysis.severity,
        retryable: analysis.retryable,
        context: analysis.context,
        suggestions: analysis.suggestions,
        stack: analysis.stack
      });

      // Save to database if it's a significant error
      if (analysis.severity === ERROR_SEVERITY.HIGH || analysis.severity === ERROR_SEVERITY.CRITICAL) {
        await this.logToDatabase(analysis);
      }

      // Handle critical errors
      if (analysis.severity === ERROR_SEVERITY.CRITICAL) {
        await this.handleCriticalError(analysis);
      }

      // Return analysis for potential retry logic
      return analysis;

    } catch (handlingError) {
      logger.error('Error occurred while handling error', {
        originalError: error.message,
        handlingError: handlingError.message
      });
      throw handlingError;
    }
  }

  // Update error statistics
  updateErrorStats(analysis) {
    this.errorStats.total++;
    
    // Update by severity
    this.errorStats.bySeverity[analysis.severity] = 
      (this.errorStats.bySeverity[analysis.severity] || 0) + 1;
    
    // Update by category
    this.errorStats.byCategory[analysis.category] = 
      (this.errorStats.byCategory[analysis.category] || 0) + 1;
    
    // Update by error type (first word of message)
    const errorType = analysis.message.split(' ')[0].toLowerCase();
    this.errorStats.byType[errorType] = 
      (this.errorStats.byType[errorType] || 0) + 1;
    
    // Add to recent errors (keep last 100)
    this.errorStats.recentErrors.unshift({
      message: analysis.message,
      category: analysis.category,
      severity: analysis.severity,
      timestamp: analysis.timestamp,
      context: analysis.context
    });
    
    if (this.errorStats.recentErrors.length > 100) {
      this.errorStats.recentErrors = this.errorStats.recentErrors.slice(0, 100);
    }
  }

  // Save error to database
  async logToDatabase(analysis) {
    try {
      await db.insert(systemLogs).values({
        id: this.generateErrorId(),
        level: 'error',
        message: analysis.message,
        metadata: {
          category: analysis.category,
          severity: analysis.severity,
          retryable: analysis.retryable,
          suggestions: analysis.suggestions,
          context: analysis.context,
          pattern: analysis.pattern,
          stack: analysis.stack
        },
        createdAt: new Date()
      });
    } catch (dbError) {
      logger.error('Failed to log error to database', {
        originalError: analysis.message,
        dbError: dbError.message
      });
    }
  }

  // Handle critical errors with immediate attention
  async handleCriticalError(analysis) {
    logger.error('CRITICAL ERROR DETECTED', {
      message: analysis.message,
      category: analysis.category,
      context: analysis.context,
      suggestions: analysis.suggestions
    });

    // In a production environment, you might:
    // - Send alerts to monitoring systems
    // - Notify administrators
    // - Trigger automated recovery procedures
    // - Scale down non-essential services

    // For now, just log the critical nature
    if (analysis.category === ERROR_CATEGORIES.PERFORMANCE) {
      logger.warn('Performance critical error - consider resource scaling');
    } else if (analysis.category === ERROR_CATEGORIES.SYSTEM) {
      logger.warn('System critical error - investigate infrastructure');
    }
  }

  // Generate unique error ID
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get error suggestions for a specific error
  getErrorSuggestions(error, context = {}) {
    const analysis = this.analyzeError(error, context);
    return {
      category: analysis.category,
      severity: analysis.severity,
      retryable: analysis.retryable,
      suggestions: analysis.suggestions
    };
  }

  // Get error statistics
  getErrorStats() {
    return {
      ...this.errorStats,
      patterns: this.errorPatterns.size
    };
  }

  // Get recent errors with optional filtering
  getRecentErrors(options = {}) {
    let errors = [...this.errorStats.recentErrors];

    if (options.category) {
      errors = errors.filter(err => err.category === options.category);
    }

    if (options.severity) {
      errors = errors.filter(err => err.severity === options.severity);
    }

    if (options.limit) {
      errors = errors.slice(0, options.limit);
    }

    return errors;
  }

  // Add custom error pattern
  addErrorPattern(pattern, config) {
    this.errorPatterns.set(pattern, {
      category: config.category || ERROR_CATEGORIES.SYSTEM,
      severity: config.severity || ERROR_SEVERITY.MEDIUM,
      retryable: config.retryable || false,
      suggestions: config.suggestions || []
    });

    logger.info('Custom error pattern added', {
      pattern: pattern.toString(),
      category: config.category
    });
  }

  // Remove error pattern
  removeErrorPattern(pattern) {
    const removed = this.errorPatterns.delete(pattern);
    
    if (removed) {
      logger.info('Error pattern removed', {
        pattern: pattern.toString()
      });
    }
    
    return removed;
  }

  // Create error report
  createErrorReport(options = {}) {
    const timeRange = options.timeRange || '24h';
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.parseTimeRange(timeRange));

    const recentErrors = this.errorStats.recentErrors
      .filter(err => new Date(err.timestamp) >= cutoff);

    const report = {
      timeRange,
      generatedAt: now.toISOString(),
      summary: {
        totalErrors: recentErrors.length,
        bySeverity: {},
        byCategory: {},
        topErrors: {}
      },
      errors: recentErrors
    };

    // Calculate summary statistics
    for (const error of recentErrors) {
      // By severity
      report.summary.bySeverity[error.severity] = 
        (report.summary.bySeverity[error.severity] || 0) + 1;
      
      // By category
      report.summary.byCategory[error.category] = 
        (report.summary.byCategory[error.category] || 0) + 1;
      
      // Top error messages
      const key = error.message.substring(0, 50);
      report.summary.topErrors[key] = 
        (report.summary.topErrors[key] || 0) + 1;
    }

    return report;
  }

  // Parse time range string to milliseconds
  parseTimeRange(timeRange) {
    const units = {
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = timeRange.match(/^(\d+)([mhd])$/);
    if (!match) {
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }

    const [, value, unit] = match;
    return parseInt(value) * units[unit];
  }

  // Reset error statistics
  resetStats() {
    this.errorStats = {
      total: 0,
      bySeverity: {},
      byCategory: {},
      byType: {},
      recentErrors: []
    };

    logger.info('Error statistics reset');
  }
}

export const errorHandlingService = new ErrorHandlingService();
export default errorHandlingService;