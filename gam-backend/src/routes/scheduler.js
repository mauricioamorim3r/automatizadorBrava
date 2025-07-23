import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import schedulerController from '../controllers/schedulerController.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Apply authentication to all routes except webhooks
router.use(/^(?!\/webhooks)/, authenticateToken);

// Get schedule status for specific automation
router.get('/automations/:automationId/schedule', 
  rateLimiter({ windowMs: 60000, maxRequests: 30 }),
  schedulerController.getScheduleStatus
);

// Get all schedules for user
router.get('/schedules',
  rateLimiter({ windowMs: 60000, maxRequests: 20 }),
  schedulerController.getAllSchedules
);

// Update automation schedule
router.put('/automations/:automationId/schedule',
  rateLimiter({ windowMs: 60000, maxRequests: 10 }),
  schedulerController.updateSchedule
);

// Enable/disable automation schedule
router.patch('/automations/:automationId/schedule/toggle',
  rateLimiter({ windowMs: 60000, maxRequests: 15 }),
  schedulerController.toggleSchedule
);

// Test cron expression
router.post('/test-cron',
  rateLimiter({ windowMs: 60000, maxRequests: 20 }),
  schedulerController.testCronExpression
);

// Get webhook URL for automation
router.get('/automations/:automationId/webhook',
  rateLimiter({ windowMs: 60000, maxRequests: 10 }),
  schedulerController.getWebhookUrl
);

// Webhook endpoint (no authentication required)
router.post('/webhooks/:token',
  rateLimiter({ windowMs: 60000, maxRequests: 100 }),
  schedulerController.handleWebhook
);

export default router;