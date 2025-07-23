import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL connection
const connectionString = process.env.DATABASE_URL || 'postgresql://gam_user:gam_password@localhost:5432/gam_db';
const sql = postgres(connectionString);
export const db = drizzle(sql);

// Redis connection (optional)
let redisClient = null;

export const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await redisClient.connect();
    console.log('✅ Connected to Redis');
    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
};

export const getRedisHealth = async () => {
  try {
    if (!redisClient) {
      return { status: 'disconnected', message: 'Redis client not initialized' };
    }
    
    await redisClient.ping();
    return { status: 'connected', type: 'Redis' };
  } catch (error) {
    return { status: 'error', error: error.message };
  }
};

export const redis = () => redisClient;

// Test database connection
export const testConnection = async () => {
  try {
    const result = await sql`SELECT NOW()`;
    console.log('✅ Connected to PostgreSQL:', result[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await sql.end();
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