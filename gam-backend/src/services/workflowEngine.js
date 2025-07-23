import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database.js';
import { executions, automations } from '../models/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../config/logs.js';
// Import services with fallback for missing dependencies
let retryService, errorHandlingService, performanceService;
try {
  const retryModule = await import('./retryService.js');
  retryService = retryModule.retryService;
} catch (error) {
  console.warn('Retry service not available');
}

try {
  const errorModule = await import('./errorHandlingService.js');
  errorHandlingService = errorModule.errorHandlingService;
} catch (error) {
  console.warn('Error handling service not available');
}

try {
  const performanceModule = await import('./performanceService.js');
  performanceService = performanceModule.performanceService;
} catch (error) {
  console.warn('Performance service not available');
}

// Step types and their execution handlers
export const STEP_TYPES = {
  // Source steps
  SOURCE_FILE_LOCAL: 'source_file_local',
  SOURCE_API_REST: 'source_api_rest',
  SOURCE_DATABASE: 'source_database',
  SOURCE_SHAREPOINT: 'source_sharepoint',
  SOURCE_ONEDRIVE: 'source_onedrive',
  SOURCE_SMB_SHARE: 'source_smb_share',
  SOURCE_MANUAL_INPUT: 'source_manual_input',
  
  // Filter steps
  FILTER_SIMPLE: 'filter_simple',
  FILTER_COMPLEX: 'filter_complex',
  FILTER_REGEX: 'filter_regex',
  FILTER_DATE: 'filter_date',
  FILTER_DEDUP: 'filter_dedup',
  FILTER_VALIDATION: 'filter_validation',
  
  // Action steps
  ACTION_TRANSFORM: 'action_transform',
  ACTION_CALCULATE: 'action_calculate',
  ACTION_FORMAT_TEXT: 'action_format_text',
  ACTION_MERGE_DATA: 'action_merge_data',
  ACTION_FILE_OPERATION: 'action_file_operation',
  ACTION_CUSTOM_JS: 'action_custom_js',
  
  // Interface automation steps
  INTERFACE_NAVIGATE: 'interface_navigate',
  INTERFACE_CLICK: 'interface_click',
  INTERFACE_TYPE: 'interface_type',
  INTERFACE_EXTRACT: 'interface_extract',
  INTERFACE_WAIT: 'interface_wait',
  
  // Destination steps
  DESTINATION_FILE: 'destination_file',
  DESTINATION_API: 'destination_api',
  DESTINATION_DATABASE: 'destination_database',
  DESTINATION_EMAIL: 'destination_email',
  DESTINATION_CLOUD: 'destination_cloud'
};

// Workflow execution context
class WorkflowContext {
  constructor(executionId, automationId, inputData = {}) {
    this.executionId = executionId;
    this.automationId = automationId;
    this.data = inputData;
    this.variables = {};
    this.stepResults = new Map();
    this.logs = [];
    this.startTime = Date.now();
  }

  log(level, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata: {
        ...metadata,
        executionId: this.executionId,
        automationId: this.automationId
      }
    };
    
    this.logs.push(logEntry);
    logger.log(level, message, logEntry.metadata);
  }

  setStepResult(stepId, result) {
    this.stepResults.set(stepId, result);
  }

  getStepResult(stepId) {
    return this.stepResults.get(stepId);
  }

  setVariable(key, value) {
    this.variables[key] = value;
  }

  getVariable(key) {
    return this.variables[key];
  }

  getDuration() {
    return Date.now() - this.startTime;
  }
}

// Import base step executor
import { StepExecutor } from './stepExecutor.js';
export { StepExecutor };

// Source step executors
class SourceManualInputExecutor extends StepExecutor {
  constructor() {
    super(STEP_TYPES.SOURCE_MANUAL_INPUT);
  }

  async execute(step, context, inputData) {
    const { defaultValue, prompt, dataType = 'string' } = step.config;
    
    context.log('info', `Executing manual input step: ${step.name}`, { stepId: step.id });
    
    // In a real implementation, this would prompt user for input
    // For now, return default value or input data
    const result = inputData?.manualInput?.[step.id] || defaultValue || '';
    
    context.log('info', `Manual input collected`, { stepId: step.id, hasData: !!result });
    
    return {
      success: true,
      data: result,
      metadata: {
        dataType,
        prompt,
        source: 'manual_input'
      }
    };
  }

  async validate(stepConfig) {
    const errors = [];
    if (!stepConfig.prompt) {
      errors.push('Prompt is required for manual input');
    }
    return { valid: errors.length === 0, errors };
  }
}

// Filter step executors
class FilterSimpleExecutor extends StepExecutor {
  constructor() {
    super(STEP_TYPES.FILTER_SIMPLE);
  }

  async execute(step, context, inputData) {
    const { field, operator, value, caseSensitive = false } = step.config;
    
    context.log('info', `Executing simple filter: ${field} ${operator} ${value}`, { stepId: step.id });
    
    if (!Array.isArray(inputData)) {
      return {
        success: false,
        error: 'Filter expects array input',
        data: []
      };
    }

    const filtered = inputData.filter(item => {
      const fieldValue = this.getFieldValue(item, field);
      return this.applyOperator(fieldValue, operator, value, caseSensitive);
    });

    context.log('info', `Filter applied`, { 
      stepId: step.id, 
      inputCount: inputData.length, 
      outputCount: filtered.length 
    });

    return {
      success: true,
      data: filtered,
      metadata: {
        inputCount: inputData.length,
        outputCount: filtered.length,
        filteredCount: inputData.length - filtered.length
      }
    };
  }

  getFieldValue(obj, field) {
    return field.split('.').reduce((value, key) => value?.[key], obj);
  }

  applyOperator(fieldValue, operator, value, caseSensitive) {
    if (!caseSensitive && typeof fieldValue === 'string' && typeof value === 'string') {
      fieldValue = fieldValue.toLowerCase();
      value = value.toLowerCase();
    }

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return typeof fieldValue === 'string' && fieldValue.includes(value);
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      case 'greater_equal':
        return Number(fieldValue) >= Number(value);
      case 'less_equal':
        return Number(fieldValue) <= Number(value);
      default:
        return false;
    }
  }
}

// Action step executors
class ActionTransformExecutor extends StepExecutor {
  constructor() {
    super(STEP_TYPES.ACTION_TRANSFORM);
  }

  async execute(step, context, inputData) {
    const { transformType, config } = step.config;
    
    context.log('info', `Executing transform: ${transformType}`, { stepId: step.id });

    let result;
    
    switch (transformType) {
      case 'map':
        result = this.mapTransform(inputData, config);
        break;
      case 'flatten':
        result = this.flattenTransform(inputData);
        break;
      case 'group':
        result = this.groupTransform(inputData, config);
        break;
      case 'sort':
        result = this.sortTransform(inputData, config);
        break;
      default:
        throw new Error(`Unknown transform type: ${transformType}`);
    }

    context.log('info', `Transform completed`, { 
      stepId: step.id, 
      transformType,
      inputSize: Array.isArray(inputData) ? inputData.length : 'not-array',
      outputSize: Array.isArray(result) ? result.length : 'not-array'
    });

    return {
      success: true,
      data: result,
      metadata: {
        transformType,
        inputSize: Array.isArray(inputData) ? inputData.length : 1,
        outputSize: Array.isArray(result) ? result.length : 1
      }
    };
  }

  mapTransform(data, config) {
    if (!Array.isArray(data)) return data;
    
    const { mapping } = config;
    return data.map(item => {
      const mapped = {};
      for (const [newKey, oldKey] of Object.entries(mapping)) {
        mapped[newKey] = this.getFieldValue(item, oldKey);
      }
      return mapped;
    });
  }

  flattenTransform(data) {
    if (!Array.isArray(data)) return [data];
    return data.flat(Infinity);
  }

  groupTransform(data, config) {
    if (!Array.isArray(data)) return data;
    
    const { groupBy } = config;
    const groups = {};
    
    data.forEach(item => {
      const key = this.getFieldValue(item, groupBy);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    
    return groups;
  }

  sortTransform(data, config) {
    if (!Array.isArray(data)) return data;
    
    const { sortBy, order = 'asc' } = config;
    return [...data].sort((a, b) => {
      const aVal = this.getFieldValue(a, sortBy);
      const bVal = this.getFieldValue(b, sortBy);
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }

  getFieldValue(obj, field) {
    return field.split('.').reduce((value, key) => value?.[key], obj);
  }
}

// Import integration executors
import { integrationExecutors } from './integrationSteps.js';
import { browserStepExecutors } from './browserSteps.js';

// Step executor registry
const stepExecutors = new Map([
  [STEP_TYPES.SOURCE_MANUAL_INPUT, new SourceManualInputExecutor()],
  [STEP_TYPES.FILTER_SIMPLE, new FilterSimpleExecutor()],
  [STEP_TYPES.ACTION_TRANSFORM, new ActionTransformExecutor()],
  // Add integration executors
  ...integrationExecutors,
  // Add browser automation executors
  ...browserStepExecutors
]);

// Main workflow engine
export class WorkflowEngine {
  constructor() {
    this.executors = stepExecutors;
  }

  async execute(automation, inputData = {}, triggeredBy = 'manual') {
    const executionId = uuidv4();
    const context = new WorkflowContext(executionId, automation.id, inputData);
    
    // Start performance tracking
    performanceService.trackExecutionStart(executionId, automation.id, {
      automationName: automation.name,
      stepCount: automation.steps?.length || 0,
      triggeredBy
    });
    
    try {
      // Create execution record
      await db.insert(executions).values({
        id: executionId,
        automationId: automation.id,
        status: 'running',
        inputData,
        triggeredBy,
        startedAt: new Date()
      });

      context.log('info', `Starting workflow execution`, { 
        automationName: automation.name,
        stepCount: automation.steps?.length || 0,
        triggeredBy
      });

      // Execute with retry logic if automation has retry configuration
      let results;
      if (automation.retryConfig && automation.retryConfig.enabled) {
        results = await retryService.executeWithRetry(
          async (automation, inputData, triggeredBy) => {
            return await this.executeSteps(automation.steps, context);
          },
          executionId,
          automation,
          inputData,
          automation.retryConfig
        );
      } else {
        // Execute steps in order without retry
        results = await this.executeSteps(automation.steps, context);
      }
      
      // Update execution record with success
      await db.update(executions)
        .set({
          status: 'completed',
          outputData: results,
          logs: context.logs,
          completedAt: new Date(),
          durationMs: context.getDuration()
        })
        .where(eq(executions.id, executionId));

      context.log('info', `Workflow execution completed successfully`, {
        duration: context.getDuration()
      });

      // Track successful execution
      performanceService.trackExecutionEnd(executionId, true);

      return {
        success: true,
        executionId,
        results,
        logs: context.logs,
        duration: context.getDuration()
      };

    } catch (error) {
      // Handle error with error analysis
      const errorAnalysis = await errorHandlingService.handleError(error, {
        executionId,
        automationId: automation.id,
        automationName: automation.name,
        triggeredBy,
        stepCount: automation.steps?.length || 0
      });

      context.log('error', `Workflow execution failed: ${error.message}`, { 
        error: error.stack,
        category: errorAnalysis.category,
        severity: errorAnalysis.severity,
        retryable: errorAnalysis.retryable
      });
      
      // Update execution record with failure
      await db.update(executions)
        .set({
          status: 'failed',
          errorDetails: {
            message: error.message,
            stack: error.stack,
            category: errorAnalysis.category,
            severity: errorAnalysis.severity,
            suggestions: errorAnalysis.suggestions
          },
          logs: context.logs,
          completedAt: new Date(),
          durationMs: context.getDuration()
        })
        .where(eq(executions.id, executionId));

      // Track failed execution
      performanceService.trackExecutionEnd(executionId, false, error.message);

      return {
        success: false,
        executionId,
        error: error.message,
        errorAnalysis,
        logs: context.logs,
        duration: context.getDuration()
      };
    }
  }

  async executeSteps(steps, context) {
    let currentData = context.data;
    const stepResults = [];

    for (const step of steps) {
      try {
        context.log('info', `Executing step: ${step.name}`, { 
          stepId: step.id, 
          stepType: step.type 
        });

        const executor = this.executors.get(step.type);
        if (!executor) {
          throw new Error(`No executor found for step type: ${step.type}`);
        }

        const result = await executor.execute(step, context, currentData);
        
        if (!result.success) {
          throw new Error(result.error || 'Step execution failed');
        }

        context.setStepResult(step.id, result);
        stepResults.push({
          stepId: step.id,
          stepName: step.name,
          stepType: step.type,
          result: result.data,
          metadata: result.metadata
        });

        // Pass result as input to next step
        currentData = result.data;

      } catch (error) {
        context.log('error', `Step execution failed: ${error.message}`, { 
          stepId: step.id, 
          error: error.stack 
        });
        throw error;
      }
    }

    return {
      finalData: currentData,
      stepResults
    };
  }

  async validateAutomation(automation) {
    const errors = [];
    const warnings = [];

    // Validate steps exist
    if (!automation.steps || automation.steps.length === 0) {
      errors.push('Automation must have at least one step');
      return { valid: false, errors, warnings };
    }

    // Validate each step
    for (const step of automation.steps) {
      const executor = this.executors.get(step.type);
      if (!executor) {
        errors.push(`Unknown step type: ${step.type} in step ${step.id}`);
        continue;
      }

      const validation = await executor.validate(step.config);
      if (!validation.valid) {
        errors.push(...validation.errors.map(err => `Step ${step.id}: ${err}`));
      }
    }

    // Validate step connections (basic check)
    const stepIds = new Set(automation.steps.map(s => s.id));
    for (const step of automation.steps) {
      if (step.connections) {
        for (const connection of step.connections) {
          if (!stepIds.has(connection.targetId)) {
            errors.push(`Step ${step.id} connects to non-existent step ${connection.targetId}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  registerExecutor(stepType, executor) {
    this.executors.set(stepType, executor);
  }

  getAvailableStepTypes() {
    return Array.from(this.executors.keys());
  }
}

export const workflowEngine = new WorkflowEngine();