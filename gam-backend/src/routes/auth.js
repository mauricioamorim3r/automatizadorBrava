import express from 'express';
import { register, login, getProfile, updateProfile } from '../controllers/authController.js';
import { verifyToken, rateLimitAuth } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', rateLimitAuth, register);
router.post('/login', rateLimitAuth, login);

// Protected routes
router.get('/profile', verifyToken, getProfile);
router.put('/profile', verifyToken, updateProfile);
router.post('/logout', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// Verify token endpoint
router.get('/verify', verifyToken, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      valid: true
    }
  });
});

export default router;