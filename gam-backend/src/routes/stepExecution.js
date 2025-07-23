import express from 'express';
import { stepExecutorService } from '../services/stepExecutorService.js';
import { logger } from '../config/logs.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Execute a single step for testing
router.post('/execute-step', authenticateToken, async (req, res) => {
  try {
    const { step, inputData = null } = req.body;
    
    if (!step || !step.id || !step.type) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Step object with id and type is required',
          status: 400
        }
      });
    }

    const context = {
      userId: req.user.id,
      executionMode: 'test',
      timestamp: new Date().toISOString()
    };

    logger.info('Executing single step', {
      stepId: step.id,
      stepType: step.type,
      userId: req.user.id
    });

    const result = await stepExecutorService.executeStep(step, inputData, context);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Step execution failed', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        status: 500
      }
    });
  }
});

// Get execution result for a step
router.get('/execution-result/:stepId', authenticateToken, async (req, res) => {
  try {
    const { stepId } = req.params;
    
    const result = stepExecutorService.getExecutionResult(stepId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Execution result not found',
          status: 404
        }
      });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Failed to get execution result', {
      error: error.message,
      stepId: req.params.stepId
    });

    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        status: 500
      }
    });
  }
});

// Clear execution results
router.delete('/execution-results', authenticateToken, async (req, res) => {
  try {
    stepExecutorService.clearResults();
    
    res.json({
      success: true,
      message: 'Execution results cleared'
    });

  } catch (error) {
    logger.error('Failed to clear execution results', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        status: 500
      }
    });
  }
});

// Execute workflow (multiple connected steps)
router.post('/execute-workflow', authenticateToken, async (req, res) => {
  try {
    const { steps, inputData = null } = req.body;
    
    if (!Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Steps array is required',
          status: 400
        }
      });
    }

    const context = {
      userId: req.user.id,
      executionMode: 'workflow',
      timestamp: new Date().toISOString()
    };

    logger.info('Executing workflow', {
      stepCount: steps.length,
      userId: req.user.id
    });

    const results = [];
    let currentData = inputData;

    // Execute steps in sequence
    for (const step of steps) {
      try {
        const result = await stepExecutorService.executeStep(step, currentData, context);
        results.push(result);
        
        // Pass successful step result as input to next step
        if (result.success) {
          currentData = result.data;
        } else {
          // Stop execution on step failure
          logger.warn('Workflow stopped due to step failure', {
            failedStepId: step.id,
            userId: req.user.id
          });
          break;
        }
      } catch (error) {
        // Record the failed step
        results.push({
          stepId: step.id,
          success: false,
          error: {
            message: error.message,
            type: error.constructor.name
          },
          timestamp: new Date().toISOString()
        });
        
        logger.error('Step failed in workflow', {
          stepId: step.id,
          error: error.message,
          userId: req.user.id
        });
        
        break; // Stop workflow on error
      }
    }

    res.json({
      success: true,
      data: {
        results,
        totalSteps: steps.length,
        completedSteps: results.length,
        finalData: currentData
      }
    });

  } catch (error) {
    logger.error('Workflow execution failed', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        status: 500
      }
    });
  }
});

export default router;