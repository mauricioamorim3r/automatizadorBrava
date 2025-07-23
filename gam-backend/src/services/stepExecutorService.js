import { logger } from '../config/logs.js';
import { browserService } from './browserService.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StepExecutorService {
  constructor() {
    this.executionResults = new Map(); // stepId -> execution result
  }

  // Execute a single step
  async executeStep(step, inputData = null, context = {}) {
    const startTime = Date.now();
    
    try {
      logger.info('Executing step', { 
        stepId: step.id, 
        type: step.type, 
        name: step.name 
      });

      let result;
      
      switch (step.type) {
        case 'SOURCE_MANUAL_INPUT':
          result = await this.executeManualInput(step, inputData, context);
          break;
          
        case 'SOURCE_FILE':
          result = await this.executeFileInput(step, inputData, context);
          break;
          
        case 'SOURCE_API':
          result = await this.executeApiInput(step, inputData, context);
          break;
          
        case 'FILTER_SIMPLE':
          result = await this.executeSimpleFilter(step, inputData, context);
          break;
          
        case 'FILTER_ADVANCED':
          result = await this.executeAdvancedFilter(step, inputData, context);
          break;
          
        case 'ACTION_TRANSFORM':
          result = await this.executeTransform(step, inputData, context);
          break;
          
        case 'ACTION_BROWSER':
          result = await this.executeBrowserAction(step, inputData, context);
          break;
          
        case 'DESTINATION_FILE':
          result = await this.executeFileOutput(step, inputData, context);
          break;
          
        case 'DESTINATION_EMAIL':
          result = await this.executeEmailOutput(step, inputData, context);
          break;
          
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      const executionTime = Date.now() - startTime;
      
      const executionResult = {
        stepId: step.id,
        success: true,
        data: result,
        executionTime,
        timestamp: new Date().toISOString(),
        logs: [],
        error: null
      };

      this.executionResults.set(step.id, executionResult);
      
      logger.info('Step executed successfully', {
        stepId: step.id,
        executionTime,
        dataSize: JSON.stringify(result).length
      });

      return executionResult;
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      const executionResult = {
        stepId: step.id,
        success: false,
        data: null,
        executionTime,
        timestamp: new Date().toISOString(),
        logs: [],
        error: {
          message: error.message,
          stack: error.stack,
          type: error.constructor.name
        }
      };

      this.executionResults.set(step.id, executionResult);
      
      logger.error('Step execution failed', {
        stepId: step.id,
        error: error.message,
        executionTime
      });

      throw error;
    }
  }

  // Manual input step
  async executeManualInput(step, inputData, context) {
    const config = step.config || {};
    
    if (config.data) {
      return typeof config.data === 'string' 
        ? JSON.parse(config.data) 
        : config.data;
    }
    
    return inputData || {};
  }

  // File input step
  async executeFileInput(step, inputData, context) {
    const config = step.config || {};
    const filePath = config.path;
    
    if (!filePath) {
      throw new Error('File path is required');
    }

    try {
      const data = await fs.readFile(filePath, config.encoding || 'utf8');
      
      // Parse based on file extension or format
      const ext = path.extname(filePath).toLowerCase();
      switch (ext) {
        case '.json':
          return JSON.parse(data);
        case '.csv':
          // Simple CSV parsing (for production, use a proper CSV library)
          const lines = data.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',');
          return lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, index) => {
              obj[header.trim()] = values[index]?.trim() || '';
              return obj;
            }, {});
          });
        default:
          return { content: data, type: 'text' };
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  // API input step
  async executeApiInput(step, inputData, context) {
    const config = step.config || {};
    const { url, method = 'GET', headers = {}, body, timeout = 30000 } = config;
    
    if (!url) {
      throw new Error('API URL is required');
    }

    try {
      const fetchOptions = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        timeout
      };

      if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        return await response.json();
      } else {
        return { content: await response.text(), type: 'text' };
      }
    } catch (error) {
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  // Simple filter step
  async executeSimpleFilter(step, inputData, context) {
    const config = step.config || {};
    const { condition, operator = 'equals', value, caseSensitive = false } = config;
    
    if (!condition || value === undefined) {
      throw new Error('Filter condition and value are required');
    }

    if (!inputData) {
      return null;
    }

    // Handle array input
    if (Array.isArray(inputData)) {
      return inputData.filter(item => this.evaluateCondition(item, condition, operator, value, caseSensitive));
    }
    
    // Handle single object
    if (this.evaluateCondition(inputData, condition, operator, value, caseSensitive)) {
      return inputData;
    }
    
    return null;
  }

  // Advanced filter step
  async executeAdvancedFilter(step, inputData, context) {
    const config = step.config || {};
    const { script, language = 'javascript' } = config;
    
    if (!script) {
      throw new Error('Filter script is required');
    }

    if (language !== 'javascript') {
      throw new Error('Only JavaScript is supported for advanced filters');
    }

    try {
      // Create a safe execution context
      const filterFunction = new Function('data', 'context', script);
      return filterFunction(inputData, context);
    } catch (error) {
      throw new Error(`Script execution failed: ${error.message}`);
    }
  }

  // Transform step
  async executeTransform(step, inputData, context) {
    const config = step.config || {};
    const { mapping, removeEmpty = false, flatten = false } = config;
    
    if (!mapping) {
      throw new Error('Field mapping is required');
    }

    let result = inputData;

    // Apply field mapping
    if (typeof mapping === 'object') {
      result = this.applyFieldMapping(result, mapping);
    }

    // Remove empty fields
    if (removeEmpty) {
      result = this.removeEmptyFields(result);
    }

    // Flatten nested objects
    if (flatten) {
      result = this.flattenObject(result);
    }

    return result;
  }

  // Browser action step
  async executeBrowserAction(step, inputData, context) {
    const config = step.config || {};
    const { action, url, selector, text, waitFor, timeout = 30000 } = config;
    
    if (!action) {
      throw new Error('Browser action is required');
    }

    // Get or create browser session
    let sessionId = context.browserSessionId;
    if (!sessionId) {
      sessionId = await browserService.createSession(context.userId || 'system');
      context.browserSessionId = sessionId;
    }

    try {
      switch (action) {
        case 'navigate':
          if (!url) throw new Error('URL is required for navigate action');
          return await browserService.navigate(sessionId, url, { timeout });
          
        case 'click':
          if (!selector) throw new Error('Selector is required for click action');
          return await browserService.clickElement(sessionId, selector, { timeout });
          
        case 'type':
          if (!selector || !text) throw new Error('Selector and text are required for type action');
          return await browserService.typeText(sessionId, selector, text, { timeout });
          
        case 'extract':
          if (!selector) throw new Error('Selector is required for extract action');
          return await browserService.extractText(sessionId, selector, { timeout });
          
        case 'screenshot':
          return await browserService.takeScreenshot(sessionId);
          
        default:
          throw new Error(`Unknown browser action: ${action}`);
      }
    } catch (error) {
      throw new Error(`Browser action failed: ${error.message}`);
    }
  }

  // File output step
  async executeFileOutput(step, inputData, context) {
    const config = step.config || {};
    const { path: outputPath, format = 'json', overwrite = true, append = false } = config;
    
    if (!outputPath) {
      throw new Error('Output path is required');
    }

    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      let content;
      
      switch (format) {
        case 'json':
          content = JSON.stringify(inputData, null, 2);
          break;
        case 'csv':
          content = this.convertToCSV(inputData);
          break;
        case 'txt':
          content = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      if (append) {
        await fs.appendFile(outputPath, content + '\n');
      } else {
        await fs.writeFile(outputPath, content);
      }

      return {
        success: true,
        path: outputPath,
        size: content.length,
        format
      };
    } catch (error) {
      throw new Error(`File write failed: ${error.message}`);
    }
  }

  // Email output step (placeholder - would need email service)
  async executeEmailOutput(step, inputData, context) {
    const config = step.config || {};
    const { to, subject, body, attachData = false, format = 'json' } = config;
    
    if (!to || !subject) {
      throw new Error('Email recipient and subject are required');
    }

    // This is a placeholder - in production, integrate with an email service
    logger.info('Email would be sent', {
      to,
      subject,
      bodyLength: body?.length || 0,
      attachData,
      dataSize: JSON.stringify(inputData).length
    });

    return {
      success: true,
      message: 'Email sending simulated (not implemented)',
      to,
      subject,
      attachData
    };
  }

  // Helper methods
  evaluateCondition(data, condition, operator, value, caseSensitive) {
    let dataValue = this.getValueByPath(data, condition);
    let compareValue = value;

    if (!caseSensitive && typeof dataValue === 'string' && typeof compareValue === 'string') {
      dataValue = dataValue.toLowerCase();
      compareValue = compareValue.toLowerCase();
    }

    switch (operator) {
      case 'equals':
        return dataValue === compareValue;
      case 'contains':
        return String(dataValue).includes(String(compareValue));
      case 'greater_than':
        return Number(dataValue) > Number(compareValue);
      case 'less_than':
        return Number(dataValue) < Number(compareValue);
      case 'regex':
        const regex = new RegExp(compareValue, caseSensitive ? 'g' : 'gi');
        return regex.test(String(dataValue));
      default:
        return false;
    }
  }

  getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  applyFieldMapping(data, mapping) {
    if (Array.isArray(data)) {
      return data.map(item => this.applyFieldMapping(item, mapping));
    }

    const result = {};
    for (const [targetKey, sourceKey] of Object.entries(mapping)) {
      result[targetKey] = this.getValueByPath(data, sourceKey);
    }
    return result;
  }

  removeEmptyFields(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeEmptyFields(item));
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && value !== '') {
        result[key] = typeof value === 'object' ? this.removeEmptyFields(value) : value;
      }
    }
    return result;
  }

  flattenObject(obj, prefix = '') {
    const result = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, newPrefix));
      } else {
        result[newPrefix] = value;
      }
    }
    
    return result;
  }

  convertToCSV(data) {
    if (!Array.isArray(data)) {
      data = [data];
    }

    if (data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          return typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : String(value || '');
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  }

  // Get execution result for a step
  getExecutionResult(stepId) {
    return this.executionResults.get(stepId);
  }

  // Clear execution results
  clearResults() {
    this.executionResults.clear();
  }
}

export const stepExecutorService = new StepExecutorService();
export default stepExecutorService;