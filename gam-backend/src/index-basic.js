import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { logger } from './config/logs.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🚀 Starting GAM Backend (Basic Mode)');
console.log('====================================');

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request tracking middleware
app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  logger.info(`${req.method} ${req.url}`, { requestId: req.requestId });
  next();
});

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'GAM Backend API (Basic Mode)',
    version: '1.0.0',
    node: process.version,
    uptime: process.uptime()
  });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    // Import database connection dynamically
    const { testConnection } = await import('./config/database.js');
    await testConnection();
    
    res.json({
      success: true,
      message: 'Database connection successful'
    });
  } catch (error) {
    logger.error('Database test failed', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Auth routes (inline for testing)
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        error: {
          message: 'Name, email and password are required',
          status: 400
        }
      });
    }

    // Mock response
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: '1',
          name,
          email,
          role: 'user'
        },
        token: 'mock-token-123'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: 'Registration failed',
        status: 500
      }
    });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: {
          message: 'Email and password are required',
          status: 400
        }
      });
    }

    // Mock login - accept any credentials for testing
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: '1',
          name: 'Test User',
          email,
          role: 'user'
        },
        token: 'mock-token-123'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: 'Login failed',
        status: 500
      }
    });
  }
});

// Import and use routes with error handling
const setupRoutes = async () => {
  try {
    // Automation routes
    const automationRoutes = await import('./routes/automations.js');
    app.use('/api/automations', automationRoutes.default);
    logger.info('Automation routes loaded');
  } catch (error) {
    logger.warn('Automation routes failed to load', { error: error.message });
  }

  try {
    // Microsoft routes
    const microsoftRoutes = await import('./routes/microsoft.js');
    app.use('/api/microsoft', microsoftRoutes.default);
    logger.info('Microsoft routes loaded');
  } catch (error) {
    logger.warn('Microsoft routes failed to load', { error: error.message });
  }

  try {
    // Scheduler routes
    const schedulerRoutes = await import('./routes/scheduler.js');
    app.use('/api/scheduler', schedulerRoutes.default);
    logger.info('Scheduler routes loaded');
  } catch (error) {
    logger.warn('Scheduler routes failed to load', { error: error.message });
  }
};

// API info endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'GAM API v1.0.0 (Basic Mode)',
    status: 'operational',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      automations: '/api/automations',
      microsoft: '/api/microsoft',
      scheduler: '/api/scheduler',
      testDb: '/api/test-db'
    },
    documentation: 'https://github.com/gam-project/gam-backend'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Request error', {
    requestId: req.requestId,
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500,
      requestId: req.requestId
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      status: 404,
      path: req.originalUrl
    }
  });
});

// Initialize server
const startServer = async () => {
  try {
    // Test database connection
    try {
      const { testConnection } = await import('./config/database.js');
      await testConnection();
      logger.info('✅ Database connection successful');
    } catch (dbError) {
      logger.warn('❌ Database connection failed, continuing without DB', { 
        error: dbError.message 
      });
    }

    // Setup routes
    await setupRoutes();

    // Start server
    const server = createServer(app);
    
    server.listen(PORT, () => {
      console.log('\n🎉 GAM Backend Started Successfully!');
      console.log('====================================');
      console.log(`🌐 Server: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`📊 API Info: http://localhost:${PORT}/api`);
      console.log(`🔍 Test DB: http://localhost:${PORT}/api/test-db`);
      console.log('====================================\n');
      
      logger.info('GAM Backend started successfully', {
        port: PORT,
        mode: 'basic',
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Graceful shutdown
    const gracefulShutdown = () => {
      console.log('\n🛑 Shutting down GAM Backend...');
      server.close(() => {
        logger.info('GAM Backend shut down gracefully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer().catch(error => {
  console.error('❌ Startup failed:', error);
  process.exit(1);
});

export default app;