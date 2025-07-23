import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logs.js';
import { db } from '../config/database.js';
import { automations, executions } from '../models/schema.js';
import { eq, and } from 'drizzle-orm';
import { workflowEngine } from './workflowEngine.js';
import crypto from 'crypto';

class SchedulerService {
  constructor() {
    this.scheduledJobs = new Map(); // scheduleId -> cron job
    this.webhookTokens = new Map(); // automationId -> webhook token
    this.triggers = new Map(); // triggerId -> trigger config
    this.isRunning = false;
  }

  // Start the scheduler service
  async start() {
    if (this.isRunning) {
      logger.warn('Scheduler service is already running');
      return;
    }

    try {
      logger.info('Starting scheduler service');
      
      // Load existing schedules from database
      await this.loadSchedulesFromDatabase();
      
      // Load existing triggers
      await this.loadTriggersFromDatabase();
      
      this.isRunning = true;
      
      logger.info('Scheduler service started successfully', {
        scheduledJobs: this.scheduledJobs.size,
        triggers: this.triggers.size
      });
      
    } catch (error) {
      logger.error('Failed to start scheduler service', { error: error.message });
      throw error;
    }
  }

  // Stop the scheduler service
  async stop() {
    if (!this.isRunning) {
      logger.warn('Scheduler service is not running');
      return;
    }

    try {
      logger.info('Stopping scheduler service');
      
      // Stop all cron jobs
      for (const [scheduleId, job] of this.scheduledJobs.entries()) {
        job.stop();
        logger.debug('Stopped scheduled job', { scheduleId });
      }
      
      this.scheduledJobs.clear();
      this.triggers.clear();
      this.webhookTokens.clear();
      this.isRunning = false;
      
      logger.info('Scheduler service stopped successfully');
      
    } catch (error) {
      logger.error('Failed to stop scheduler service', { error: error.message });
      throw error;
    }
  }

  // Load schedules from database
  async loadSchedulesFromDatabase() {
    try {
      const automationsWithSchedules = await db
        .select()
        .from(automations)
        .where(and(
          eq(automations.enabled, true),
          eq(automations.isActive, true)
        ));

      for (const automation of automationsWithSchedules) {
        if (automation.schedule) {
          await this.scheduleAutomation(automation.id, automation.schedule, automation);
        }

        // Generate webhook tokens for automations that support webhooks
        if (automation.triggers && automation.triggers.webhook) {
          this.generateWebhookToken(automation.id);
        }
      }
      
      logger.info('Loaded schedules from database', { 
        count: this.scheduledJobs.size 
      });
      
    } catch (error) {
      logger.error('Failed to load schedules from database', { error: error.message });
      throw error;
    }
  }

  // Load triggers from database
  async loadTriggersFromDatabase() {
    try {
      const automationsWithTriggers = await db
        .select()
        .from(automations)
        .where(and(
          eq(automations.enabled, true),
          eq(automations.isActive, true)
        ));

      for (const automation of automationsWithTriggers) {
        if (automation.triggers) {
          this.registerTriggers(automation.id, automation.triggers, automation);
        }
      }
      
      logger.info('Loaded triggers from database', { 
        count: this.triggers.size 
      });
      
    } catch (error) {
      logger.error('Failed to load triggers from database', { error: error.message });
      throw error;
    }
  }

  // Schedule an automation with cron expression
  async scheduleAutomation(automationId, schedule, automation = null) {
    try {
      // Validate cron expression
      if (!this.isValidCronExpression(schedule.cronExpression)) {
        throw new Error(`Invalid cron expression: ${schedule.cronExpression}`);
      }

      // Get automation if not provided
      if (!automation) {
        const results = await db
          .select()
          .from(automations)
          .where(eq(automations.id, automationId));
        
        if (results.length === 0) {
          throw new Error(`Automation not found: ${automationId}`);
        }
        
        automation = results[0];
      }

      const scheduleId = `${automationId}_${Date.now()}`;
      
      // Create cron job
      const job = cron.schedule(schedule.cronExpression, async () => {
        try {
          logger.info('Executing scheduled automation', { 
            automationId, 
            automationName: automation.name,
            scheduleId 
          });

          // Execute the automation
          const result = await workflowEngine.execute(automation, schedule.inputData || {}, 'scheduled');
          
          logger.info('Scheduled automation completed', { 
            automationId, 
            executionId: result.executionId,
            success: result.success,
            duration: result.duration
          });

        } catch (error) {
          logger.error('Scheduled automation failed', { 
            automationId, 
            scheduleId, 
            error: error.message 
          });
        }
      }, {
        scheduled: schedule.enabled !== false,
        timezone: schedule.timezone || 'America/Sao_Paulo'
      });

      this.scheduledJobs.set(scheduleId, job);
      
      logger.info('Automation scheduled successfully', { 
        automationId, 
        scheduleId,
        cronExpression: schedule.cronExpression,
        timezone: schedule.timezone,
        enabled: schedule.enabled
      });

      return scheduleId;
      
    } catch (error) {
      logger.error('Failed to schedule automation', { 
        automationId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Unschedule an automation
  async unscheduleAutomation(automationId) {
    try {
      const jobsToRemove = [];
      
      // Find all jobs for this automation
      for (const [scheduleId, job] of this.scheduledJobs.entries()) {
        if (scheduleId.startsWith(`${automationId}_`)) {
          job.stop();
          jobsToRemove.push(scheduleId);
        }
      }
      
      // Remove from map
      for (const scheduleId of jobsToRemove) {
        this.scheduledJobs.delete(scheduleId);
      }
      
      logger.info('Automation unscheduled', { 
        automationId, 
        removedJobs: jobsToRemove.length 
      });
      
      return jobsToRemove.length;
      
    } catch (error) {
      logger.error('Failed to unschedule automation', { 
        automationId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Register triggers for an automation
  registerTriggers(automationId, triggers, automation) {
    try {
      // Webhook triggers
      if (triggers.webhook) {
        this.registerWebhookTrigger(automationId, triggers.webhook, automation);
      }

      // File system triggers
      if (triggers.fileSystem) {
        this.registerFileSystemTrigger(automationId, triggers.fileSystem, automation);
      }

      // Database triggers
      if (triggers.database) {
        this.registerDatabaseTrigger(automationId, triggers.database, automation);
      }

      // API triggers
      if (triggers.api) {
        this.registerApiTrigger(automationId, triggers.api, automation);
      }
      
      logger.info('Triggers registered for automation', { 
        automationId, 
        triggerTypes: Object.keys(triggers) 
      });
      
    } catch (error) {
      logger.error('Failed to register triggers', { 
        automationId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Register webhook trigger
  registerWebhookTrigger(automationId, webhookConfig, automation) {
    const token = this.generateWebhookToken(automationId);
    
    const trigger = {
      id: `webhook_${automationId}`,
      type: 'webhook',
      automationId,
      automation,
      config: {
        ...webhookConfig,
        token,
        url: `/api/webhooks/${token}`
      }
    };
    
    this.triggers.set(trigger.id, trigger);
    
    logger.debug('Webhook trigger registered', { 
      automationId, 
      token, 
      url: trigger.config.url 
    });
  }

  // Generate webhook token for automation
  generateWebhookToken(automationId) {
    const token = crypto.randomBytes(32).toString('hex');
    this.webhookTokens.set(automationId, token);
    return token;
  }

  // Handle webhook trigger
  async handleWebhookTrigger(token, payload, headers = {}) {
    try {
      // Find automation by webhook token
      let automationId = null;
      for (const [id, t] of this.webhookTokens.entries()) {
        if (t === token) {
          automationId = id;
          break;
        }
      }

      if (!automationId) {
        logger.warn('Unknown webhook token', { token });
        return { success: false, error: 'Invalid webhook token' };
      }

      // Get automation
      const results = await db
        .select()
        .from(automations)
        .where(eq(automations.id, automationId));
      
      if (results.length === 0) {
        logger.warn('Automation not found for webhook', { automationId, token });
        return { success: false, error: 'Automation not found' };
      }

      const automation = results[0];

      // Check if automation is enabled
      if (!automation.enabled || !automation.isActive) {
        logger.warn('Webhook called for disabled automation', { automationId });
        return { success: false, error: 'Automation is disabled' };
      }

      logger.info('Processing webhook trigger', { 
        automationId, 
        automationName: automation.name,
        token 
      });

      // Prepare input data
      const inputData = {
        webhook: {
          payload,
          headers,
          timestamp: new Date().toISOString()
        }
      };

      // Execute the automation
      const result = await workflowEngine.execute(automation, inputData, 'webhook');
      
      logger.info('Webhook automation completed', { 
        automationId, 
        executionId: result.executionId,
        success: result.success,
        duration: result.duration
      });

      return result;
      
    } catch (error) {
      logger.error('Webhook trigger failed', { token, error: error.message });
      return { success: false, error: error.message };
    }
  }

  // Register file system trigger (placeholder for future implementation)
  registerFileSystemTrigger(automationId, fsConfig, automation) {
    // This would implement file system watching
    // For now, just log that it's registered
    logger.info('File system trigger registered (placeholder)', { 
      automationId, 
      config: fsConfig 
    });
  }

  // Register database trigger (placeholder for future implementation)
  registerDatabaseTrigger(automationId, dbConfig, automation) {
    // This would implement database change detection
    // For now, just log that it's registered
    logger.info('Database trigger registered (placeholder)', { 
      automationId, 
      config: dbConfig 
    });
  }

  // Register API trigger (placeholder for future implementation)
  registerApiTrigger(automationId, apiConfig, automation) {
    // This would implement API polling
    // For now, just log that it's registered
    logger.info('API trigger registered (placeholder)', { 
      automationId, 
      config: apiConfig 
    });
  }

  // Validate cron expression
  isValidCronExpression(expression) {
    try {
      return cron.validate(expression);
    } catch (error) {
      return false;
    }
  }

  // Get schedule status
  getScheduleStatus(automationId) {
    const jobs = [];
    
    for (const [scheduleId, job] of this.scheduledJobs.entries()) {
      if (scheduleId.startsWith(`${automationId}_`)) {
        jobs.push({
          scheduleId,
          running: job.running,
          scheduled: job.scheduled
        });
      }
    }
    
    return {
      automationId,
      scheduledJobs: jobs,
      hasSchedules: jobs.length > 0
    };
  }

  // Get all scheduled jobs status
  getAllSchedulesStatus() {
    const schedules = {};
    
    for (const [scheduleId, job] of this.scheduledJobs.entries()) {
      const automationId = scheduleId.split('_')[0];
      
      if (!schedules[automationId]) {
        schedules[automationId] = [];
      }
      
      schedules[automationId].push({
        scheduleId,
        running: job.running,
        scheduled: job.scheduled
      });
    }
    
    return {
      totalSchedules: this.scheduledJobs.size,
      schedules,
      triggers: this.triggers.size,
      webhookTokens: this.webhookTokens.size
    };
  }

  // Update automation schedule
  async updateAutomationSchedule(automationId, newSchedule) {
    try {
      // Remove existing schedules
      await this.unscheduleAutomation(automationId);
      
      // Add new schedule if provided
      if (newSchedule && newSchedule.cronExpression) {
        await this.scheduleAutomation(automationId, newSchedule);
      }
      
      logger.info('Automation schedule updated', { automationId });
      
    } catch (error) {
      logger.error('Failed to update automation schedule', { 
        automationId, 
        error: error.message 
      });
      throw error;
    }
  }

  // Test cron expression (get next execution times)
  getNextExecutions(cronExpression, count = 5) {
    try {
      if (!this.isValidCronExpression(cronExpression)) {
        throw new Error('Invalid cron expression');
      }

      const nextExecutions = [];
      let current = new Date();
      
      // This is a simplified implementation
      // In a production system, you'd use a proper cron parser
      for (let i = 0; i < count; i++) {
        // For now, just return approximate times
        current = new Date(current.getTime() + 60000); // Add 1 minute
        nextExecutions.push(current.toISOString());
      }
      
      return nextExecutions;
      
    } catch (error) {
      throw new Error(`Failed to calculate next executions: ${error.message}`);
    }
  }
}

export const schedulerService = new SchedulerService();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down scheduler service...');
  await schedulerService.stop();
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down scheduler service...');
  await schedulerService.stop();
});

export default schedulerService;