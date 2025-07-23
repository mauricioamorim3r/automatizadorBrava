import { logger } from '../config/logs.js';
import { db } from '../config/database.js';
import { systemLogs } from '../models/schema.js';
import os from 'os';
import process from 'process';

class PerformanceService {
  constructor() {
    this.metrics = {
      system: {
        memory: {},
        cpu: {},
        uptime: 0
      },
      application: {
        requests: {
          total: 0,
          perMinute: 0,
          avgResponseTime: 0,
          slowRequests: []
        },
        executions: {
          total: 0,
          successful: 0,
          failed: 0,
          avgDuration: 0,
          slowExecutions: []
        },
        errors: {
          total: 0,
          rate: 0
        }
      },
      resources: {
        browserSessions: 0,
        activeConnections: 0,
        queuedJobs: 0
      },
      thresholds: {
        memoryWarning: 0.8, // 80% memory usage
        memoryAlert: 0.9,   // 90% memory usage
        cpuWarning: 0.7,    // 70% CPU usage
        cpuAlert: 0.85,     // 85% CPU usage
        responseTimeWarning: 1000, // 1 second
        responseTimeAlert: 5000,   // 5 seconds
        executionTimeWarning: 30000,  // 30 seconds
        executionTimeAlert: 120000    // 2 minutes
      }
    };

    this.startTime = Date.now();
    this.isMonitoring = false;
    this.monitoringInterval = null;
    
    // Request tracking
    this.activeRequests = new Map(); // requestId -> start time
    this.requestHistory = []; // Recent requests for rate calculation
    
    // Execution tracking  
    this.activeExecutions = new Map(); // executionId -> start time
    this.executionHistory = []; // Recent executions
  }

  // Start performance monitoring
  start(intervalMs = 30000) { // Default 30 seconds
    if (this.isMonitoring) {
      logger.warn('Performance monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    
    logger.info('Starting performance monitoring', { intervalMs });
    
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    // Initial metrics collection
    this.collectMetrics();
  }

  // Stop performance monitoring
  stop() {
    if (!this.isMonitoring) {
      logger.warn('Performance monitoring is not running');
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    logger.info('Performance monitoring stopped');
  }

  // Collect system and application metrics
  collectMetrics() {
    try {
      // System metrics
      this.collectSystemMetrics();
      
      // Application metrics
      this.collectApplicationMetrics();
      
      // Resource metrics
      this.collectResourceMetrics();
      
      // Check thresholds and alert if necessary
      this.checkThresholds();
      
      // Clean up old data
      this.cleanupOldData();
      
    } catch (error) {
      logger.error('Failed to collect performance metrics', { error: error.message });
    }
  }

  // Collect system-level metrics
  collectSystemMetrics() {
    // Memory metrics
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    this.metrics.system.memory = {
      heap: {
        used: memoryUsage.heapUsed,
        total: memoryUsage.heapTotal,
        percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
      },
      system: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
        percentage: ((totalMemory - freeMemory) / totalMemory) * 100
      },
      process: {
        rss: memoryUsage.rss,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers
      }
    };

    // CPU metrics (approximation using load average)
    const loadAverage = os.loadavg();
    const cpuCount = os.cpus().length;
    
    this.metrics.system.cpu = {
      loadAverage: loadAverage,
      usage: (loadAverage[0] / cpuCount) * 100,
      cores: cpuCount
    };

    // Uptime
    this.metrics.system.uptime = Date.now() - this.startTime;
  }

  // Collect application-specific metrics
  collectApplicationMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Request metrics
    const recentRequests = this.requestHistory.filter(req => req.timestamp > oneMinuteAgo);
    this.metrics.application.requests.perMinute = recentRequests.length;
    
    if (recentRequests.length > 0) {
      const totalResponseTime = recentRequests.reduce((sum, req) => sum + req.duration, 0);
      this.metrics.application.requests.avgResponseTime = totalResponseTime / recentRequests.length;
      
      // Find slow requests
      this.metrics.application.requests.slowRequests = recentRequests
        .filter(req => req.duration > this.metrics.thresholds.responseTimeWarning)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10);
    }

    // Execution metrics
    const recentExecutions = this.executionHistory.filter(exec => exec.timestamp > oneMinuteAgo);
    
    if (recentExecutions.length > 0) {
      const totalDuration = recentExecutions.reduce((sum, exec) => sum + exec.duration, 0);
      this.metrics.application.executions.avgDuration = totalDuration / recentExecutions.length;
      
      const successful = recentExecutions.filter(exec => exec.success).length;
      this.metrics.application.executions.successful = successful;
      this.metrics.application.executions.failed = recentExecutions.length - successful;
      
      // Find slow executions
      this.metrics.application.executions.slowExecutions = recentExecutions
        .filter(exec => exec.duration > this.metrics.thresholds.executionTimeWarning)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10);
    }
  }

  // Collect resource metrics
  collectResourceMetrics() {
    // These would be populated by other services
    // For now, we'll track what we can estimate
    
    this.metrics.resources.activeConnections = this.activeRequests.size;
    this.metrics.resources.queuedJobs = this.activeExecutions.size;
  }

  // Check performance thresholds and alert
  checkThresholds() {
    const alerts = [];
    const warnings = [];

    // Memory checks
    const memoryPercentage = this.metrics.system.memory.system.percentage;
    if (memoryPercentage > this.metrics.thresholds.memoryAlert * 100) {
      alerts.push({
        type: 'memory',
        level: 'alert',
        message: `System memory usage is critical: ${memoryPercentage.toFixed(1)}%`,
        value: memoryPercentage
      });
    } else if (memoryPercentage > this.metrics.thresholds.memoryWarning * 100) {
      warnings.push({
        type: 'memory',
        level: 'warning',
        message: `System memory usage is high: ${memoryPercentage.toFixed(1)}%`,
        value: memoryPercentage
      });
    }

    // CPU checks
    const cpuUsage = this.metrics.system.cpu.usage;
    if (cpuUsage > this.metrics.thresholds.cpuAlert * 100) {
      alerts.push({
        type: 'cpu',
        level: 'alert',
        message: `CPU usage is critical: ${cpuUsage.toFixed(1)}%`,
        value: cpuUsage
      });
    } else if (cpuUsage > this.metrics.thresholds.cpuWarning * 100) {
      warnings.push({
        type: 'cpu',
        level: 'warning',
        message: `CPU usage is high: ${cpuUsage.toFixed(1)}%`,
        value: cpuUsage
      });
    }

    // Response time checks
    const avgResponseTime = this.metrics.application.requests.avgResponseTime;
    if (avgResponseTime > this.metrics.thresholds.responseTimeAlert) {
      alerts.push({
        type: 'response_time',
        level: 'alert',
        message: `Average response time is critical: ${avgResponseTime}ms`,
        value: avgResponseTime
      });
    } else if (avgResponseTime > this.metrics.thresholds.responseTimeWarning) {
      warnings.push({
        type: 'response_time',
        level: 'warning',
        message: `Average response time is high: ${avgResponseTime}ms`,
        value: avgResponseTime
      });
    }

    // Log alerts and warnings
    if (alerts.length > 0) {
      for (const alert of alerts) {
        logger.error('Performance alert', alert);
        this.logPerformanceIssue(alert);
      }
    }

    if (warnings.length > 0) {
      for (const warning of warnings) {
        logger.warn('Performance warning', warning);
      }
    }
  }

  // Log performance issue to database
  async logPerformanceIssue(issue) {
    try {
      await db.insert(systemLogs).values({
        level: issue.level === 'alert' ? 'error' : 'warn',
        message: issue.message,
        metadata: {
          type: 'performance',
          performanceType: issue.type,
          value: issue.value,
          metrics: this.metrics
        },
        createdAt: new Date()
      });
    } catch (error) {
      logger.error('Failed to log performance issue', { error: error.message });
    }
  }

  // Clean up old tracking data
  cleanupOldData() {
    const now = Date.now();
    const fiveMinutesAgo = now - 300000; // 5 minutes
    
    // Clean request history
    this.requestHistory = this.requestHistory.filter(req => req.timestamp > fiveMinutesAgo);
    
    // Clean execution history
    this.executionHistory = this.executionHistory.filter(exec => exec.timestamp > fiveMinutesAgo);
  }

  // Track request start
  trackRequestStart(requestId, metadata = {}) {
    this.activeRequests.set(requestId, {
      startTime: Date.now(),
      metadata
    });
  }

  // Track request end
  trackRequestEnd(requestId, statusCode = 200) {
    const requestData = this.activeRequests.get(requestId);
    
    if (requestData) {
      const endTime = Date.now();
      const duration = endTime - requestData.startTime;
      
      this.requestHistory.push({
        requestId,
        duration,
        statusCode,
        timestamp: endTime,
        metadata: requestData.metadata
      });
      
      this.metrics.application.requests.total++;
      this.activeRequests.delete(requestId);
    }
  }

  // Track execution start
  trackExecutionStart(executionId, automationId, metadata = {}) {
    this.activeExecutions.set(executionId, {
      startTime: Date.now(),
      automationId,
      metadata
    });
  }

  // Track execution end
  trackExecutionEnd(executionId, success = true, errorMessage = null) {
    const executionData = this.activeExecutions.get(executionId);
    
    if (executionData) {
      const endTime = Date.now();
      const duration = endTime - executionData.startTime;
      
      this.executionHistory.push({
        executionId,
        automationId: executionData.automationId,
        duration,
        success,
        errorMessage,
        timestamp: endTime,
        metadata: executionData.metadata
      });
      
      this.metrics.application.executions.total++;
      
      if (!success) {
        this.metrics.application.errors.total++;
      }
      
      this.activeExecutions.delete(executionId);
    }
  }

  // Get current performance metrics
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
      monitoring: this.isMonitoring
    };
  }

  // Get performance summary
  getPerformanceSummary() {
    const summary = {
      system: {
        memoryUsage: this.metrics.system.memory.system.percentage.toFixed(1) + '%',
        cpuUsage: this.metrics.system.cpu.usage.toFixed(1) + '%',
        uptime: Math.floor(this.metrics.system.uptime / 1000) + ' seconds'
      },
      application: {
        requestsPerMinute: this.metrics.application.requests.perMinute,
        avgResponseTime: Math.round(this.metrics.application.requests.avgResponseTime) + 'ms',
        totalExecutions: this.metrics.application.executions.total,
        successRate: this.calculateSuccessRate() + '%',
        totalErrors: this.metrics.application.errors.total
      },
      resources: {
        activeRequests: this.activeRequests.size,
        activeExecutions: this.activeExecutions.size
      },
      status: this.getHealthStatus()
    };
    
    return summary;
  }

  // Calculate success rate
  calculateSuccessRate() {
    const total = this.metrics.application.executions.total;
    const failed = this.metrics.application.executions.failed;
    
    if (total === 0) return 100;
    
    return ((total - failed) / total * 100).toFixed(1);
  }

  // Get health status based on metrics
  getHealthStatus() {
    const memoryUsage = this.metrics.system.memory.system.percentage / 100;
    const cpuUsage = this.metrics.system.cpu.usage / 100;
    
    if (memoryUsage > this.metrics.thresholds.memoryAlert || 
        cpuUsage > this.metrics.thresholds.cpuAlert) {
      return 'critical';
    } else if (memoryUsage > this.metrics.thresholds.memoryWarning || 
               cpuUsage > this.metrics.thresholds.cpuWarning) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  // Update performance thresholds
  updateThresholds(newThresholds) {
    this.metrics.thresholds = {
      ...this.metrics.thresholds,
      ...newThresholds
    };
    
    logger.info('Performance thresholds updated', { thresholds: this.metrics.thresholds });
  }

  // Get slow operations report
  getSlowOperationsReport() {
    return {
      slowRequests: this.metrics.application.requests.slowRequests,
      slowExecutions: this.metrics.application.executions.slowExecutions,
      thresholds: {
        responseTime: this.metrics.thresholds.responseTimeWarning,
        executionTime: this.metrics.thresholds.executionTimeWarning
      }
    };
  }

  // Force metrics collection (for testing or manual triggers)
  forceCollection() {
    this.collectMetrics();
    logger.info('Manual metrics collection triggered');
  }
}

export const performanceService = new PerformanceService();

// Graceful shutdown
process.on('SIGINT', () => {
  performanceService.stop();
});

process.on('SIGTERM', () => {
  performanceService.stop();
});

export default performanceService;