import express from 'express';
import {
  initiateOAuth,
  handleOAuthCallback,
  getConnectionStatus,
  disconnect,
  testConnection,
  refreshToken
} from '../controllers/microsoftController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// OAuth2 flow endpoints
router.get('/auth/initiate', verifyToken, initiateOAuth);
router.get('/auth/callback', handleOAuthCallback); // No auth required - this is the callback URL

// Connection management
router.get('/status', verifyToken, getConnectionStatus);
router.post('/disconnect', verifyToken, disconnect);
router.post('/test', verifyToken, testConnection);
router.post('/refresh-token', verifyToken, refreshToken);

export default router;