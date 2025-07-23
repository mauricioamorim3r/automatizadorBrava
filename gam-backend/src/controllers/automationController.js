import { db } from '../config/database.js';
import { automations, users, executions } from '../models/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import { workflowEngine } from '../services/workflowEngine.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Validation schemas
const stepSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  config: z.object({}).passthrough(),
  position: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  connections: z.array(z.object({
    targetId: z.string(),
    targetPort: z.string().optional(),
    sourcePort: z.string().optional()
  })).optional()
});

const automationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().optional(),
  steps: z.array(stepSchema).default([]),
  config: z.object({}).passthrough().default({}),
  status: z.enum(['draft', 'active', 'paused']).default('draft'),
  schedule: z.object({}).passthrough().optional()
});

const updateAutomationSchema = automationSchema.partial();

// Create new automation
export const createAutomation = async (req, res) => {
  try {
    const validatedData = automationSchema.parse(req.body);
    const userId = req.user.id;

    // Validate automation if it has steps
    if (validatedData.steps.length > 0) {
      const mockAutomation = { steps: validatedData.steps };
      const validation = await workflowEngine.validateAutomation(mockAutomation);
      
      if (!validation.valid) {
        return res.status(400).json({
          error: {
            message: 'Automation validation failed',
            details: validation.errors,
            status: 400
          }
        });
      }
    }

    const [newAutomation] = await db
      .insert(automations)
      .values({
        ...validatedData,
        ownerId: userId,
        version: 1
      })
      .returning();

    res.status(201).json({
      success: true,
      data: newAutomation
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors,
          status: 400
        }
      });
    }

    console.error('Create automation error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to create automation',
        status: 500
      }
    });
  }
};

// Get all automations for user
export const getAutomations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, search, page = 1, limit = 20, sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let query = db
      .select({
        id: automations.id,
        name: automations.name,
        description: automations.description,
        status: automations.status,
        stepCount: automations.steps,
        schedule: automations.schedule,
        createdAt: automations.createdAt,
        updatedAt: automations.updatedAt,
        version: automations.version,
        owner: {
          id: users.id,
          name: users.name,
          email: users.email
        }
      })
      .from(automations)
      .leftJoin(users, eq(automations.ownerId, users.id))
      .where(eq(automations.ownerId, userId));

    // Apply filters
    if (status) {
      query = query.where(and(
        eq(automations.ownerId, userId),
        eq(automations.status, status)
      ));
    }

    // Apply sorting
    const sortField = automations[sortBy] || automations.updatedAt;
    query = query.orderBy(sortOrder === 'desc' ? desc(sortField) : asc(sortField));

    // Apply pagination
    query = query.limit(limitNum).offset(offset);

    const results = await query;

    // Transform step count
    const transformedResults = results.map(automation => ({
      ...automation,
      stepCount: Array.isArray(automation.stepCount) ? automation.stepCount.length : 0
    }));

    // Get total count
    const [{ count }] = await db
      .select({ count: automations.id })
      .from(automations)
      .where(eq(automations.ownerId, userId));

    res.status(200).json({
      success: true,
      data: transformedResults,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(count),
        pages: Math.ceil(count / limitNum)
      }
    });

  } catch (error) {
    console.error('Get automations error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to get automations',
        status: 500
      }
    });
  }
};

// Get single automation
export const getAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [automation] = await db
      .select()
      .from(automations)
      .where(and(
        eq(automations.id, id),
        eq(automations.ownerId, userId)
      ));

    if (!automation) {
      return res.status(404).json({
        error: {
          message: 'Automation not found',
          status: 404
        }
      });
    }

    res.status(200).json({
      success: true,
      data: automation
    });

  } catch (error) {
    console.error('Get automation error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to get automation',
        status: 500
      }
    });
  }
};

// Update automation
export const updateAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const validatedData = updateAutomationSchema.parse(req.body);

    // Check if automation exists and user owns it
    const [existingAutomation] = await db
      .select()
      .from(automations)
      .where(and(
        eq(automations.id, id),
        eq(automations.ownerId, userId)
      ));

    if (!existingAutomation) {
      return res.status(404).json({
        error: {
          message: 'Automation not found',
          status: 404
        }
      });
    }

    // Validate automation if steps are being updated
    if (validatedData.steps && validatedData.steps.length > 0) {
      const mockAutomation = { steps: validatedData.steps };
      const validation = await workflowEngine.validateAutomation(mockAutomation);
      
      if (!validation.valid) {
        return res.status(400).json({
          error: {
            message: 'Automation validation failed',
            details: validation.errors,
            status: 400
          }
        });
      }
    }

    const [updatedAutomation] = await db
      .update(automations)
      .set({
        ...validatedData,
        updatedAt: new Date(),
        version: existingAutomation.version + 1
      })
      .where(eq(automations.id, id))
      .returning();

    res.status(200).json({
      success: true,
      data: updatedAutomation
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          message: 'Validation error',
          details: error.errors,
          status: 400
        }
      });
    }

    console.error('Update automation error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to update automation',
        status: 500
      }
    });
  }
};

// Delete automation
export const deleteAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if automation exists and user owns it
    const [existingAutomation] = await db
      .select()
      .from(automations)
      .where(and(
        eq(automations.id, id),
        eq(automations.ownerId, userId)
      ));

    if (!existingAutomation) {
      return res.status(404).json({
        error: {
          message: 'Automation not found',
          status: 404
        }
      });
    }

    // Delete the automation
    await db
      .delete(automations)
      .where(eq(automations.id, id));

    res.status(200).json({
      success: true,
      message: 'Automation deleted successfully'
    });

  } catch (error) {
    console.error('Delete automation error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to delete automation',
        status: 500
      }
    });
  }
};

// Duplicate automation
export const duplicateAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get original automation
    const [originalAutomation] = await db
      .select()
      .from(automations)
      .where(and(
        eq(automations.id, id),
        eq(automations.ownerId, userId)
      ));

    if (!originalAutomation) {
      return res.status(404).json({
        error: {
          message: 'Automation not found',
          status: 404
        }
      });
    }

    // Create duplicate with new name
    const [duplicatedAutomation] = await db
      .insert(automations)
      .values({
        name: `${originalAutomation.name} (Copy)`,
        description: originalAutomation.description,
        steps: originalAutomation.steps,
        config: originalAutomation.config,
        status: 'draft',
        ownerId: userId,
        version: 1
      })
      .returning();

    res.status(201).json({
      success: true,
      data: duplicatedAutomation
    });

  } catch (error) {
    console.error('Duplicate automation error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to duplicate automation',
        status: 500
      }
    });
  }
};

// Execute automation
export const executeAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { inputData = {} } = req.body;

    // Get automation
    const [automation] = await db
      .select()
      .from(automations)
      .where(and(
        eq(automations.id, id),
        eq(automations.ownerId, userId)
      ));

    if (!automation) {
      return res.status(404).json({
        error: {
          message: 'Automation not found',
          status: 404
        }
      });
    }

    if (automation.status === 'paused') {
      return res.status(400).json({
        error: {
          message: 'Cannot execute paused automation',
          status: 400
        }
      });
    }

    // Execute automation
    const result = await workflowEngine.execute(automation, inputData, 'manual');

    res.status(200).json({
      success: result.success,
      data: {
        executionId: result.executionId,
        results: result.results,
        duration: result.duration,
        logs: result.logs
      },
      error: result.error || undefined
    });

  } catch (error) {
    console.error('Execute automation error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to execute automation',
        status: 500
      }
    });
  }
};

// Validate automation
export const validateAutomation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Get automation
    const [automation] = await db
      .select()
      .from(automations)
      .where(and(
        eq(automations.id, id),
        eq(automations.ownerId, userId)
      ));

    if (!automation) {
      return res.status(404).json({
        error: {
          message: 'Automation not found',
          status: 404
        }
      });
    }

    // Validate automation
    const validation = await workflowEngine.validateAutomation(automation);

    res.status(200).json({
      success: true,
      data: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      }
    });

  } catch (error) {
    console.error('Validate automation error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to validate automation',
        status: 500
      }
    });
  }
};

// Get automation execution history
export const getExecutionHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Check if user owns the automation
    const [automation] = await db
      .select({ id: automations.id })
      .from(automations)
      .where(and(
        eq(automations.id, id),
        eq(automations.ownerId, userId)
      ));

    if (!automation) {
      return res.status(404).json({
        error: {
          message: 'Automation not found',
          status: 404
        }
      });
    }

    // Get execution history
    const executionHistory = await db
      .select({
        id: executions.id,
        status: executions.status,
        triggeredBy: executions.triggeredBy,
        startedAt: executions.startedAt,
        completedAt: executions.completedAt,
        durationMs: executions.durationMs,
        errorDetails: executions.errorDetails
      })
      .from(executions)
      .where(eq(executions.automationId, id))
      .orderBy(desc(executions.startedAt))
      .limit(limitNum)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: executions.id })
      .from(executions)
      .where(eq(executions.automationId, id));

    res.status(200).json({
      success: true,
      data: executionHistory,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(count),
        pages: Math.ceil(count / limitNum)
      }
    });

  } catch (error) {
    console.error('Get execution history error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to get execution history',
        status: 500
      }
    });
  }
};