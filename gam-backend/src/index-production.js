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

// Import configuration
import { logger } from './config/logs.js';
import { testConnection, connectRedis } from './config/database.js';
import { serviceManager } from './services/serviceManager.js';

console.log('🚀 Starting GAM Backend (Production Mode)');
console.log('==========================================');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
app.use(morgan('combined', { 
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID and performance tracking
app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.startTime = Date.now();
  
  // Log request
  logger.info(`${req.method} ${req.url}`, { 
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Track response time
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.info(`Request completed`, {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'GAM Backend API (Production)',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: serviceManager.getAllServicesStatus()
    };

    // Test database connection
    try {
      await testConnection();
      health.database = { status: 'connected', type: 'PostgreSQL' };
    } catch (error) {
      health.database = { status: 'disconnected', error: error.message };
    }

    // Test Redis connection
    try {
      const { getRedisHealth } = await import('./config/database.js');
      health.redis = await getRedisHealth();
    } catch (error) {
      health.redis = { status: 'disconnected', error: error.message };
    }

    res.status(200).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Database connection test endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    await testConnection();
    res.json({
      success: true,
      message: 'Database connection successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Database test failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Initialize services
const initializeServices = async () => {
  try {
    // Import and register all services
    logger.info('Initializing production services...');

    // Performance service
    try {
      const { performanceService } = await import('./services/performanceService.js');
      serviceManager.registerService('performance', performanceService);
      logger.info('Performance service registered');
    } catch (error) {
      logger.warn('Performance service unavailable', { error: error.message });
    }

    // Error handling service
    try {
      const { errorHandlingService } = await import('./services/errorHandlingService.js');
      serviceManager.registerService('error-handling', errorHandlingService);
      logger.info('Error handling service registered');
    } catch (error) {
      logger.warn('Error handling service unavailable', { error: error.message });
    }

    // Scheduler service
    try {
      const { schedulerService } = await import('./services/schedulerService.js');
      serviceManager.registerService('scheduler', schedulerService);
      logger.info('Scheduler service registered');
    } catch (error) {
      logger.warn('Scheduler service unavailable', { error: error.message });
    }

    // Browser service
    try {
      const { browserService } = await import('./services/browserService.js');
      serviceManager.registerService('browser', browserService);
      logger.info('Browser service registered');
    } catch (error) {
      logger.warn('Browser service unavailable', { error: error.message });
    }

    // Start all services
    await serviceManager.startAllServices();
    logger.info('All services initialized successfully');

  } catch (error) {
    logger.error('Service initialization failed', { error: error.message });
    // Continue without failing - services have fallbacks
  }
};

// Setup routes
const setupRoutes = async () => {
  try {
    logger.info('Loading production routes...');

    // Authentication routes
    try {
      const authRoutes = await import('./routes/auth.js');
      app.use('/api/auth', authRoutes.default);
      logger.info('✅ Authentication routes loaded');
    } catch (error) {
      logger.error('❌ Failed to load auth routes', { error: error.message });
    }

    // Automation routes
    try {
      const automationRoutes = await import('./routes/automations.js');
      app.use('/api/automations', automationRoutes.default);
      logger.info('✅ Automation routes loaded');
    } catch (error) {
      logger.error('❌ Failed to load automation routes', { error: error.message });
    }

    // Microsoft integration routes
    try {
      const microsoftRoutes = await import('./routes/microsoft.js');
      app.use('/api/microsoft', microsoftRoutes.default);
      logger.info('✅ Microsoft integration routes loaded');
    } catch (error) {
      logger.error('❌ Failed to load Microsoft routes', { error: error.message });
    }

    // Scheduler routes
    try {
      const schedulerRoutes = await import('./routes/scheduler.js');
      app.use('/api/scheduler', schedulerRoutes.default);
      logger.info('✅ Scheduler routes loaded');
    } catch (error) {
      logger.error('❌ Failed to load scheduler routes', { error: error.message });
    }

    // Execution routes
    try {
      const executionRoutes = await import('./routes/executions.js');
      app.use('/api/executions', executionRoutes.default);
      logger.info('✅ Execution routes loaded');
    } catch (error) {
      logger.warn('Execution routes not available yet', { error: error.message });
    }

    logger.info('Route loading completed');
  } catch (error) {
    logger.error('Failed to setup routes', { error: error.message });
  }
};

// API info endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'GAM API v1.0.0 (Production)',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      testDb: '/api/test-db',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile',
        logout: 'POST /api/auth/logout'
      },
      automations: {
        list: 'GET /api/automations',
        create: 'POST /api/automations',
        get: 'GET /api/automations/:id',
        update: 'PUT /api/automations/:id',
        delete: 'DELETE /api/automations/:id',
        execute: 'POST /api/automations/:id/execute'
      },
      executions: {
        list: 'GET /api/executions',
        get: 'GET /api/executions/:id',
        logs: 'GET /api/executions/:id/logs'
      },
      scheduler: {
        schedules: 'GET /api/scheduler/schedules',
        webhook: 'POST /api/scheduler/webhooks/:token'
      },
      microsoft: {
        auth: 'GET /api/microsoft/auth',
        callback: 'GET /api/microsoft/auth/callback',
        sharepoint: 'GET /api/microsoft/sharepoint/*',
        onedrive: 'GET /api/microsoft/onedrive/*'
      },
      monitoring: {
        metrics: 'GET /api/metrics',
        errors: 'GET /api/errors/report'
      }
    },
    documentation: 'https://github.com/gam-project/gam-backend'
  });
});

// Metrics endpoint
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      services: serviceManager.getAllServicesStatus()
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    logger.error('Failed to get metrics', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  res.status(err.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error' 
        : err.message,
      status: err.status || 500,
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', { 
    url: req.originalUrl, 
    method: req.method,
    ip: req.ip 
  });
  
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      path: req.originalUrl,
      timestamp: new Date().toISOString()
    }
  });
});

// Database initialization
const initializeDatabase = async () => {
  try {
    logger.info('Initializing database connections...');
    
    // Test PostgreSQL connection
    await testConnection();
    logger.info('✅ PostgreSQL connected');
    
    // Connect to Redis
    try {
      await connectRedis();
      logger.info('✅ Redis connected');
    } catch (error) {
      logger.warn('Redis connection failed, continuing without cache', { 
        error: error.message 
      });
    }
    
    logger.info('Database initialization completed');
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    throw error;
  }
};

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Initialize services
    await initializeServices();
    
    // Setup routes
    await setupRoutes();
    
    // Create HTTP server
    const server = createServer(app);
    
    // Start listening
    server.listen(PORT, () => {
      console.log('\n🎉 GAM Backend Started Successfully (Production Mode)!');
      console.log('=====================================================');
      console.log(`🌐 Server: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`📊 API Info: http://localhost:${PORT}/api`);
      console.log(`📈 Metrics: http://localhost:${PORT}/api/metrics`);
      console.log(`🔍 Test DB: http://localhost:${PORT}/api/test-db`);
      console.log(`🔐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('=====================================================\n');
      
      logger.info('GAM Backend started successfully', {
        port: PORT,
        mode: 'production',
        environment: process.env.NODE_ENV || 'development',
        features: {
          database: true,
          redis: true,
          authentication: true,
          automation: true,
          scheduling: true,
          monitoring: true
        }
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down GAM Backend gracefully...`);
      
      server.close(async () => {
        try {
          // Stop all services
          await serviceManager.stopAllServices();
          logger.info('All services stopped');
          
          // Close database connections
          // Database connections will be closed automatically
          
          logger.info('GAM Backend shut down gracefully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error: error.message });
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Start the application
startServer().catch(error => {
  console.error('❌ Startup failed:', error);
  process.exit(1);
});

export default app;