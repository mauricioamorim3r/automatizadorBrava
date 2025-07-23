import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import database connection
import { testConnection, connectRedis } from './config/database.js';
import authRoutes from './routes/auth.js';
import automationRoutes from './routes/automations.js';
import microsoftRoutes from './routes/microsoft.js';
import schedulerRoutes from './routes/scheduler.js';

// Import service manager and services
import { serviceManager } from './services/serviceManager.js';
import { logger } from './config/logs.js';

// Import services (with error handling for missing dependencies)
let schedulerService, performanceService, errorHandlingService;
try {
  const schedulerModule = await import('./services/schedulerService.js');
  schedulerService = schedulerModule.schedulerService;
} catch (error) {
  logger.warn('Scheduler service not available', { error: error.message });
}

try {
  const performanceModule = await import('./services/performanceService.js');
  performanceService = performanceModule.performanceService;
} catch (error) {
  logger.warn('Performance service not available', { error: error.message });
}

try {
  const errorModule = await import('./services/errorHandlingService.js');
  errorHandlingService = errorModule.errorHandlingService;
} catch (error) {
  logger.warn('Error handling service not available', { error: error.message });
}

// Initialize database connections
const initializeDatabase = async () => {
  try {
    await testConnection();
    await connectRedis();
    console.log('✅ All database connections established');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
};

// Initialize services
const initializeServices = async () => {
  try {
    // Register available services
    if (schedulerService) {
      serviceManager.registerService('scheduler', schedulerService);
    }
    
    if (performanceService) {
      serviceManager.registerService('performance', performanceService);
    }
    
    if (errorHandlingService) {
      serviceManager.registerService('error-handling', errorHandlingService);
    }

    // Start all registered services
    await serviceManager.startAllServices();
    
    logger.info('✅ Service initialization completed');
  } catch (error) {
    logger.error('❌ Service initialization failed', { error: error.message });
    console.error('❌ Service initialization failed:', error);
    // Don't exit - continue with available services
  }
};

// Initialize database and services on startup
(async () => {
  await initializeDatabase();
  await initializeServices();
})();

// Performance tracking middleware
app.use((req, res, next) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.requestId = requestId;
  
  // Only track if performance service is available
  if (performanceService) {
    try {
      performanceService.trackRequestStart(requestId, {
        method: req.method,
        url: req.url,
        userAgent: req.get('user-agent')
      });
      
      const originalSend = res.send;
      res.send = function(data) {
        performanceService.trackRequestEnd(requestId, res.statusCode);
        return originalSend.call(this, data);
      };
    } catch (error) {
      logger.debug('Performance tracking failed', { error: error.message });
    }
  }
  
  next();
});

// Enhanced health check with performance metrics
app.get('/health', (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'GAM Backend API',
    services: serviceManager.getAllServicesStatus()
  };

  // Add performance data if available
  if (performanceService) {
    try {
      health.performance = performanceService.getPerformanceSummary();
    } catch (error) {
      health.performance = { error: error.message };
    }
  }

  // Add scheduler data if available
  if (schedulerService) {
    try {
      health.scheduler = {
        running: schedulerService.isRunning,
        schedules: schedulerService.getAllSchedulesStatus()
      };
    } catch (error) {
      health.scheduler = { error: error.message };
    }
  }
  
  res.status(200).json(health);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/microsoft', microsoftRoutes);
app.use('/api/scheduler', schedulerRoutes);

// Performance metrics endpoint
app.get('/api/metrics', (req, res) => {
  try {
    const data = {};
    
    if (performanceService) {
      data.performance = performanceService.getMetrics();
    }
    
    if (errorHandlingService) {
      data.errors = errorHandlingService.getErrorStats();
    }
    
    data.services = serviceManager.getAllServicesStatus();
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Failed to get metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error report endpoint  
app.get('/api/errors/report', (req, res) => {
  try {
    if (!errorHandlingService) {
      return res.status(503).json({
        success: false,
        error: 'Error handling service not available'
      });
    }
    
    const timeRange = req.query.timeRange || '24h';
    const report = errorHandlingService.createErrorReport({ timeRange });
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Failed to generate error report', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.use('/api', (req, res) => {
  res.status(200).json({
    message: 'GAM API v1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      automations: '/api/automations',
      executions: '/api/executions',
      microsoft: '/api/microsoft'
    }
  });
});

// Error handling middleware with enhanced error analysis
app.use(async (err, req, res, next) => {
  try {
    let analysis = null;
    
    // Analyze error with error handling service if available
    if (errorHandlingService) {
      try {
        analysis = await errorHandlingService.handleError(err, {
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          userAgent: req.get('user-agent')
        });
      } catch (analysisError) {
        logger.debug('Error analysis failed', { error: analysisError.message });
      }
    }
    
    logger.error('Request error', {
      requestId: req.requestId,
      error: err.message,
      category: analysis?.category,
      severity: analysis?.severity
    });
    
    const errorResponse = {
      error: {
        message: err.message || 'Internal Server Error',
        status: err.status || 500
      }
    };

    // Add analysis data if available
    if (analysis) {
      errorResponse.error.category = analysis.category;
      if (analysis.severity === 'low') {
        errorResponse.error.suggestions = analysis.suggestions;
      }
    }
    
    res.status(err.status || 500).json(errorResponse);
  } catch (handlingError) {
    // Fallback error handling
    logger.error('Error handling failed', { 
      handlingError: handlingError.message,
      originalError: err.message 
    });
    
    res.status(err.status || 500).json({
      error: {
        message: err.message || 'Internal Server Error',
        status: err.status || 500
      }
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404
    }
  });
});

const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 GAM Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app;