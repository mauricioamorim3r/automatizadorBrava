import { schedulerService } from '../services/schedulerService.js';
import { db } from '../config/database.js';
import { automations } from '../models/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../config/logs.js';

// Get automation schedule status
export const getScheduleStatus = async (req, res) => {
  try {
    const { automationId } = req.params;
    
    // Verify automation exists and user has access
    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId));
    
    if (automation.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Automation not found' 
      });
    }

    // Check user access (basic check - in production you'd have more sophisticated access control)
    if (automation[0].userId !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    
    const status = schedulerService.getScheduleStatus(automationId);
    
    res.json({
      success: true,
      data: {
        ...status,
        automation: {
          id: automation[0].id,
          name: automation[0].name,
          enabled: automation[0].enabled,
          isActive: automation[0].isActive,
          schedule: automation[0].schedule
        }
      }
    });
    
  } catch (error) {
    logger.error('Failed to get schedule status', { 
      automationId: req.params.automationId, 
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get schedule status',
      error: error.message
    });
  }
};

// Get all schedules for user
export const getAllSchedules = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's automations with schedules
    const userAutomations = await db
      .select()
      .from(automations)
      .where(eq(automations.userId, userId));
    
    const allStatus = schedulerService.getAllSchedulesStatus();
    
    // Filter to only include user's automations
    const userSchedules = {};
    for (const automation of userAutomations) {
      if (allStatus.schedules[automation.id]) {
        userSchedules[automation.id] = {
          automation: {
            id: automation.id,
            name: automation.name,
            enabled: automation.enabled,
            schedule: automation.schedule
          },
          schedules: allStatus.schedules[automation.id]
        };
      }
    }
    
    res.json({
      success: true,
      data: {
        schedules: userSchedules,
        totalSchedules: Object.keys(userSchedules).length
      }
    });
    
  } catch (error) {
    logger.error('Failed to get all schedules', { 
      userId: req.user.id, 
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get schedules',
      error: error.message
    });
  }
};

// Update automation schedule
export const updateSchedule = async (req, res) => {
  try {
    const { automationId } = req.params;
    const { schedule } = req.body;
    
    // Verify automation exists and user has access
    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId));
    
    if (automation.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Automation not found' 
      });
    }

    if (automation[0].userId !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    
    // Validate schedule if provided
    if (schedule && schedule.cronExpression) {
      if (!schedulerService.isValidCronExpression(schedule.cronExpression)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid cron expression',
          error: `Invalid cron expression: ${schedule.cronExpression}`
        });
      }
    }
    
    // Update database
    await db
      .update(automations)
      .set({ 
        schedule,
        updatedAt: new Date()
      })
      .where(eq(automations.id, automationId));
    
    // Update scheduler
    await schedulerService.updateAutomationSchedule(automationId, schedule);
    
    // Get updated status
    const status = schedulerService.getScheduleStatus(automationId);
    
    logger.info('Automation schedule updated', { 
      automationId, 
      userId: req.user.id,
      hasSchedule: !!schedule?.cronExpression
    });
    
    res.json({
      success: true,
      message: 'Schedule updated successfully',
      data: status
    });
    
  } catch (error) {
    logger.error('Failed to update schedule', { 
      automationId: req.params.automationId, 
      userId: req.user.id,
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to update schedule',
      error: error.message
    });
  }
};

// Enable/disable automation schedule
export const toggleSchedule = async (req, res) => {
  try {
    const { automationId } = req.params;
    const { enabled } = req.body;
    
    // Verify automation exists and user has access
    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId));
    
    if (automation.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Automation not found' 
      });
    }

    if (automation[0].userId !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    
    const currentSchedule = automation[0].schedule || {};
    const newSchedule = {
      ...currentSchedule,
      enabled: enabled
    };
    
    // Update database
    await db
      .update(automations)
      .set({ 
        schedule: newSchedule,
        updatedAt: new Date()
      })
      .where(eq(automations.id, automationId));
    
    // Update scheduler
    await schedulerService.updateAutomationSchedule(automationId, newSchedule);
    
    logger.info('Automation schedule toggled', { 
      automationId, 
      userId: req.user.id,
      enabled
    });
    
    res.json({
      success: true,
      message: `Schedule ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        automationId,
        enabled
      }
    });
    
  } catch (error) {
    logger.error('Failed to toggle schedule', { 
      automationId: req.params.automationId, 
      userId: req.user.id,
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to toggle schedule',
      error: error.message
    });
  }
};

// Test cron expression
export const testCronExpression = async (req, res) => {
  try {
    const { cronExpression, count = 5 } = req.body;
    
    if (!cronExpression) {
      return res.status(400).json({
        success: false,
        message: 'Cron expression is required'
      });
    }
    
    if (!schedulerService.isValidCronExpression(cronExpression)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid cron expression',
        error: `Invalid cron expression: ${cronExpression}`
      });
    }
    
    const nextExecutions = schedulerService.getNextExecutions(cronExpression, count);
    
    res.json({
      success: true,
      data: {
        cronExpression,
        valid: true,
        nextExecutions
      }
    });
    
  } catch (error) {
    logger.error('Failed to test cron expression', { 
      cronExpression: req.body.cronExpression,
      error: error.message 
    });
    
    res.status(400).json({
      success: false,
      message: 'Invalid cron expression',
      error: error.message
    });
  }
};

// Handle webhook triggers
export const handleWebhook = async (req, res) => {
  try {
    const { token } = req.params;
    const payload = req.body;
    const headers = req.headers;
    
    logger.info('Webhook received', { 
      token: token.substring(0, 8) + '...', // Log partial token for security
      payloadSize: JSON.stringify(payload).length
    });
    
    const result = await schedulerService.handleWebhookTrigger(token, payload, headers);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Webhook processed successfully',
        executionId: result.executionId
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error || 'Webhook processing failed'
      });
    }
    
  } catch (error) {
    logger.error('Webhook processing failed', { 
      token: req.params.token?.substring(0, 8) + '...',
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

// Get webhook URL for automation
export const getWebhookUrl = async (req, res) => {
  try {
    const { automationId } = req.params;
    
    // Verify automation exists and user has access
    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId));
    
    if (automation.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Automation not found' 
      });
    }

    if (automation[0].userId !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied' 
      });
    }
    
    // Generate or get existing webhook token
    const token = schedulerService.generateWebhookToken(automationId);
    const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/${token}`;
    
    res.json({
      success: true,
      data: {
        automationId,
        webhookUrl,
        token: token.substring(0, 8) + '...' // Return partial token for display
      }
    });
    
  } catch (error) {
    logger.error('Failed to get webhook URL', { 
      automationId: req.params.automationId,
      error: error.message 
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get webhook URL',
      error: error.message
    });
  }
};

export default {
  getScheduleStatus,
  getAllSchedules,
  updateSchedule,
  toggleSchedule,
  testCronExpression,
  handleWebhook,
  getWebhookUrl
};