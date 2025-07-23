import dotenv from 'dotenv';

dotenv.config();

// In-memory database simulation for demonstration
class MemoryDatabase {
  constructor() {
    this.tables = {
      users: [],
      automations: [],
      executions: [],
      automation_shares: [],
      templates: []
    };
    this.nextId = 1;
    console.log('✅ In-memory database initialized');
  }

  async query(sql, params = []) {
    // Basic SQL simulation for testing
    if (sql.includes('SELECT NOW()')) {
      return [{ now: new Date() }];
    }
    
    if (sql.includes('SELECT') && sql.includes('users')) {
      return this.tables.users;
    }
    
    if (sql.includes('INSERT INTO users')) {
      const user = {
        id: this.nextId++,
        created_at: new Date(),
        ...params[0] // Simplified parameter handling
      };
      this.tables.users.push(user);
      return [user];
    }

    if (sql.includes('SELECT') && sql.includes('automations')) {
      return this.tables.automations;
    }

    // Default response
    return [];
  }

  async end() {
    console.log('🔄 Memory database connection closed');
  }
}

// Create database instance
export const db = new MemoryDatabase();

// Mock Redis client
let redisClient = {
  connected: true,
  async connect() { 
    console.log('✅ Connected to Redis (Mock)');
    return this;
  },
  async ping() { return 'PONG'; },
  async quit() { 
    console.log('🔄 Redis connection closed (Mock)');
  },
  on() { /* Mock event listener */ }
};

export const connectRedis = async () => {
  return redisClient;
};

export const getRedisHealth = async () => {
  return { status: 'connected', type: 'Redis (Mock)' };
};

export const redis = () => redisClient;

// Test database connection
export const testConnection = async () => {
  try {
    const result = await db.query('SELECT NOW()');
    console.log('✅ Connected to Memory Database:', result[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await db.end();
    if (redisClient) {
      await redisClient.quit();
    }
    console.log('🔄 Database connections closed');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);