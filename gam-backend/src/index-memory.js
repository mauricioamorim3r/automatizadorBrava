import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from './config/logs.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'gam_jwt_secret_change_in_production';

console.log('🚀 Starting GAM Backend (Memory Database Mode)');
console.log('===============================================');

// Basic middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
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

// In-memory storage for users, automations, etc.
const memoryStore = {
  users: [
    {
      id: 1,
      name: 'Admin User',
      email: 'admin@gam.com',
      password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
      role: 'admin',
      created_at: new Date(),
      updated_at: new Date()
    }
  ],
  automations: [
    {
      id: 1,
      name: 'Example Automation',
      description: 'A sample automation for demonstration',
      config: { steps: [] },
      is_active: true,
      user_id: 1,
      created_at: new Date(),
      updated_at: new Date()
    }
  ],
  executions: [],
  templates: []
};

let nextId = 2;

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: {
        message: 'Access token is required',
        status: 401
      }
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        error: {
          message: 'Invalid or expired token',
          status: 403
        }
      });
    }
    req.user = user;
    next();
  });
};

// Basic health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'GAM Backend API (Memory Database Mode)',
    version: '1.0.0',
    node: process.version,
    uptime: process.uptime(),
    database: 'In-Memory',
    users_count: memoryStore.users.length,
    automations_count: memoryStore.automations.length
  });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  res.json({
    success: true,
    message: 'Memory database connection successful',
    data: {
      users: memoryStore.users.length,
      automations: memoryStore.automations.length,
      executions: memoryStore.executions.length
    }
  });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
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

    // Check if user already exists
    const existingUser = memoryStore.users.find(user => user.email === email);
    if (existingUser) {
      return res.status(409).json({
        error: {
          message: 'User with this email already exists',
          status: 409
        }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = {
      id: nextId++,
      name,
      email,
      password: hashedPassword,
      role: 'user',
      created_at: new Date(),
      updated_at: new Date()
    };

    memoryStore.users.push(newUser);

    // Generate token
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role
        },
        token
      }
    });
  } catch (error) {
    logger.error('Registration error', { error: error.message });
    res.status(500).json({
      error: {
        message: 'Registration failed',
        status: 500
      }
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
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

    // Find user
    const user = memoryStore.users.find(u => u.email === email);
    if (!user) {
      return res.status(401).json({
        error: {
          message: 'Invalid credentials',
          status: 401
        }
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: {
          message: 'Invalid credentials',
          status: 401
        }
      });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({
      error: {
        message: 'Login failed',
        status: 500
      }
    });
  }
});

app.get('/api/auth/profile', authenticateToken, (req, res) => {
  const user = memoryStore.users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({
      error: {
        message: 'User not found',
        status: 404
      }
    });
  }

  res.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    }
  });
});

// Automations routes
app.get('/api/automations', authenticateToken, (req, res) => {
  const userAutomations = memoryStore.automations.filter(automation => 
    automation.user_id === req.user.id || req.user.role === 'admin'
  );

  res.json({
    success: true,
    data: userAutomations
  });
});

app.post('/api/automations', authenticateToken, (req, res) => {
  try {
    const { name, description, config } = req.body;

    if (!name) {
      return res.status(400).json({
        error: {
          message: 'Name is required',
          status: 400
        }
      });
    }

    const newAutomation = {
      id: nextId++,
      name,
      description: description || '',
      config: config || { steps: [] },
      is_active: true,
      user_id: req.user.id,
      created_at: new Date(),
      updated_at: new Date()
    };

    memoryStore.automations.push(newAutomation);

    res.status(201).json({
      success: true,
      data: newAutomation
    });
  } catch (error) {
    logger.error('Create automation error', { error: error.message });
    res.status(500).json({
      error: {
        message: 'Failed to create automation',
        status: 500
      }
    });
  }
});

// Step execution routes
app.post('/api/steps/execute-step', authenticateToken, async (req, res) => {
  try {
    const { step, inputData = null } = req.body;
    
    if (!step || !step.id || !step.type) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Step object with id and type is required',
          status: 400
        }
      });
    }

    // Simulate step execution
    const result = {
      stepId: step.id,
      success: true,
      data: {
        message: `Step ${step.name} executed successfully (simulated)`,
        type: step.type,
        config: step.config,
        inputData,
        outputData: { result: 'Success', timestamp: new Date().toISOString() }
      },
      executionTime: Math.floor(Math.random() * 2000) + 500, // Random 500-2500ms
      timestamp: new Date().toISOString(),
      logs: [
        `Starting execution of step: ${step.name}`,
        `Step type: ${step.type}`,
        `Execution completed successfully`
      ],
      error: null
    };

    logger.info('Step executed (simulated)', {
      stepId: step.id,
      stepType: step.type,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Step execution failed', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        status: 500
      }
    });
  }
});

// API info endpoint
app.get('/api', (req, res) => {
  res.status(200).json({
    message: 'GAM API v1.0.0 (Memory Database Mode)',
    status: 'operational',
    endpoints: {
      health: '/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        profile: 'GET /api/auth/profile'
      },
      automations: {
        list: 'GET /api/automations',
        create: 'POST /api/automations'
      },
      testDb: '/api/test-db'
    },
    sample_user: {
      email: 'admin@gam.com',
      password: 'password'
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
    // Start server
    const server = createServer(app);
    
    server.listen(PORT, () => {
      console.log('\n🎉 GAM Backend Started Successfully!');
      console.log('===============================================');
      console.log(`🌐 Server: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`📊 API Info: http://localhost:${PORT}/api`);
      console.log(`🔍 Test DB: http://localhost:${PORT}/api/test-db`);
      console.log('===============================================');
      console.log('📝 Sample Login:');
      console.log('   Email: admin@gam.com');
      console.log('   Password: password');
      console.log('===============================================\n');
      
      logger.info('GAM Backend started successfully', {
        port: PORT,
        mode: 'memory-database',
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