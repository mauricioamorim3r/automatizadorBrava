import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';
import { users } from '../models/schema.js';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Hash password
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

// Compare password
export const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// Simple token extraction and verification
export const authenticateToken = async (req, res, next) => {
  return verifyToken(req, res, next);
};

// Verify JWT middleware
export const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: {
          message: 'Access token required',
          status: 401
        }
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from database
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        settings: users.settings
      })
      .from(users)
      .where(eq(users.id, decoded.id));

    if (!user) {
      return res.status(401).json({
        error: {
          message: 'User not found',
          status: 401
        }
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          message: 'Token expired',
          status: 401
        }
      });
    }
    
    return res.status(401).json({
      error: {
        message: 'Invalid token',
        status: 401
      }
    });
  }
};

// Role-based authorization
export const authorize = (roles = []) => {
  return (req, res, next) => {
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          message: 'Insufficient permissions',
          status: 403
        }
      });
    }
    next();
  };
};

// Rate limiting middleware
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'auth',
  points: 5, // Number of requests
  duration: 60, // Per 60 seconds
});

export const rateLimitAuth = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({
      error: {
        message: 'Too many authentication attempts',
        status: 429,
        retryAfter: Math.round(rejRes.msBeforeNext / 1000)
      }
    });
  }
};