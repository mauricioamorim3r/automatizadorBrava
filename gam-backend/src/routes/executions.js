import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { db } from '../config/database.js';
import { executions, automations } from '../models/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { logger } from '../config/logs.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Get all executions for user
router.get('/', 
  rateLimiter({ windowMs: 60000, maxRequests: 50 }),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const status = req.query.status;
      const automationId = req.query.automationId;

      // Build where conditions
      let whereConditions = [eq(automations.userId, userId)];
      
      if (status) {
        whereConditions.push(eq(executions.status, status));
      }
      
      if (automationId) {
        whereConditions.push(eq(executions.automationId, automationId));
      }

      // Get executions with automation details
      const results = await db
        .select({
          id: executions.id,
          automationId: executions.automationId,
          automationName: automations.name,
          status: executions.status,
          triggeredBy: executions.triggeredBy,
          startedAt: executions.startedAt,
          completedAt: executions.completedAt,
          durationMs: executions.durationMs,
          errorDetails: executions.errorDetails,
          retryInfo: executions.retryInfo
        })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(...whereConditions))
        .orderBy(desc(executions.startedAt))
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ count }] = await db
        .select({ count: sql`count(*)` })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(...whereConditions));

      res.json({
        success: true,
        data: {
          executions: results,
          pagination: {
            page,
            limit,
            total: parseInt(count),
            totalPages: Math.ceil(parseInt(count) / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Failed to get executions', { 
        userId: req.user.id, 
        error: error.message 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve executions',
        error: error.message
      });
    }
  }
);

// Get specific execution details
router.get('/:id',
  rateLimiter({ windowMs: 60000, maxRequests: 30 }),
  async (req, res) => {
    try {
      const executionId = req.params.id;
      const userId = req.user.id;

      const [execution] = await db
        .select({
          id: executions.id,
          automationId: executions.automationId,
          automationName: automations.name,
          status: executions.status,
          inputData: executions.inputData,
          outputData: executions.outputData,
          logs: executions.logs,
          errorDetails: executions.errorDetails,
          retryInfo: executions.retryInfo,
          triggeredBy: executions.triggeredBy,
          startedAt: executions.startedAt,
          completedAt: executions.completedAt,
          durationMs: executions.durationMs
        })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(
          eq(executions.id, executionId),
          eq(automations.userId, userId)
        ));

      if (!execution) {
        return res.status(404).json({
          success: false,
          message: 'Execution not found'
        });
      }

      res.json({
        success: true,
        data: execution
      });

    } catch (error) {
      logger.error('Failed to get execution details', { 
        executionId: req.params.id,
        userId: req.user.id, 
        error: error.message 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve execution details',
        error: error.message
      });
    }
  }
);

// Get execution logs
router.get('/:id/logs',
  rateLimiter({ windowMs: 60000, maxRequests: 30 }),
  async (req, res) => {
    try {
      const executionId = req.params.id;
      const userId = req.user.id;
      const level = req.query.level; // Filter by log level

      const [execution] = await db
        .select({
          logs: executions.logs,
          status: executions.status
        })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(
          eq(executions.id, executionId),
          eq(automations.userId, userId)
        ));

      if (!execution) {
        return res.status(404).json({
          success: false,
          message: 'Execution not found'
        });
      }

      let logs = execution.logs || [];

      // Filter by log level if specified
      if (level) {
        logs = logs.filter(log => log.level === level);
      }

      res.json({
        success: true,
        data: {
          executionId,
          status: execution.status,
          logs,
          totalLogs: logs.length,
          availableLevels: [...new Set(logs.map(log => log.level))]
        }
      });

    } catch (error) {
      logger.error('Failed to get execution logs', { 
        executionId: req.params.id,
        userId: req.user.id, 
        error: error.message 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve execution logs',
        error: error.message
      });
    }
  }
);

// Cancel running execution
router.post('/:id/cancel',
  rateLimiter({ windowMs: 60000, maxRequests: 10 }),
  async (req, res) => {
    try {
      const executionId = req.params.id;
      const userId = req.user.id;

      // Check if execution exists and belongs to user
      const [execution] = await db
        .select({
          id: executions.id,
          status: executions.status,
          automationId: executions.automationId
        })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(
          eq(executions.id, executionId),
          eq(automations.userId, userId)
        ));

      if (!execution) {
        return res.status(404).json({
          success: false,
          message: 'Execution not found'
        });
      }

      if (execution.status !== 'running') {
        return res.status(400).json({
          success: false,
          message: `Cannot cancel execution with status: ${execution.status}`
        });
      }

      // Update execution status to cancelled
      const [updatedExecution] = await db
        .update(executions)
        .set({
          status: 'cancelled',
          completedAt: new Date(),
          errorDetails: {
            message: 'Execution cancelled by user',
            cancelledBy: userId,
            cancelledAt: new Date().toISOString()
          }
        })
        .where(eq(executions.id, executionId))
        .returning({
          id: executions.id,
          status: executions.status,
          completedAt: executions.completedAt
        });

      logger.info('Execution cancelled', { 
        executionId, 
        userId,
        automationId: execution.automationId
      });

      res.json({
        success: true,
        message: 'Execution cancelled successfully',
        data: updatedExecution
      });

    } catch (error) {
      logger.error('Failed to cancel execution', { 
        executionId: req.params.id,
        userId: req.user.id, 
        error: error.message 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to cancel execution',
        error: error.message
      });
    }
  }
);

// Get execution statistics
router.get('/stats/summary',
  rateLimiter({ windowMs: 60000, maxRequests: 20 }),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const days = parseInt(req.query.days) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get execution statistics
      const stats = await db
        .select({
          status: executions.status,
          count: sql`count(*)`
        })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(
          eq(automations.userId, userId),
          sql`${executions.startedAt} >= ${startDate}`
        ))
        .groupBy(executions.status);

      // Get average duration
      const [avgDuration] = await db
        .select({
          avg: sql`avg(${executions.durationMs})`
        })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(
          eq(automations.userId, userId),
          eq(executions.status, 'completed'),
          sql`${executions.startedAt} >= ${startDate}`
        ));

      // Get most active automations
      const topAutomations = await db
        .select({
          automationId: executions.automationId,
          automationName: automations.name,
          executions: sql`count(*)`
        })
        .from(executions)
        .innerJoin(automations, eq(executions.automationId, automations.id))
        .where(and(
          eq(automations.userId, userId),
          sql`${executions.startedAt} >= ${startDate}`
        ))
        .groupBy(executions.automationId, automations.name)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      // Format statistics
      const statusStats = stats.reduce((acc, stat) => {
        acc[stat.status] = parseInt(stat.count);
        return acc;
      }, {});

      const summary = {
        period: `${days} days`,
        totalExecutions: stats.reduce((sum, stat) => sum + parseInt(stat.count), 0),
        statusBreakdown: statusStats,
        averageDuration: avgDuration.avg ? Math.round(parseFloat(avgDuration.avg)) : 0,
        topAutomations,
        successRate: statusStats.completed && statusStats.completed > 0 
          ? ((statusStats.completed / (statusStats.completed + (statusStats.failed || 0))) * 100).toFixed(1)
          : '0.0'
      };

      res.json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('Failed to get execution statistics', { 
        userId: req.user.id, 
        error: error.message 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve execution statistics',
        error: error.message
      });
    }
  }
);

export default router;