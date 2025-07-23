import { StepExecutor } from './stepExecutor.js';
import { browserService } from './browserService.js';
import { logger } from '../config/logs.js';

// Browser Interface Automation Step Types
export const BROWSER_STEP_TYPES = {
  INTERFACE_NAVIGATE: 'interface_navigate',
  INTERFACE_CLICK: 'interface_click',
  INTERFACE_TYPE: 'interface_type',
  INTERFACE_SELECT: 'interface_select',
  INTERFACE_UPLOAD: 'interface_upload',
  INTERFACE_DOWNLOAD: 'interface_download',
  INTERFACE_SCROLL: 'interface_scroll',
  INTERFACE_HOVER: 'interface_hover',
  INTERFACE_DRAG_DROP: 'interface_drag_drop',
  INTERFACE_SCREENSHOT: 'interface_screenshot',
  INTERFACE_EXTRACT: 'interface_extract',
  INTERFACE_WAIT: 'interface_wait',
  INTERFACE_EXECUTE_JS: 'interface_execute_js',
  INTERFACE_MANAGE_COOKIES: 'interface_manage_cookies',
  INTERFACE_HANDLE_DIALOG: 'interface_handle_dialog'
};

// Base class for browser automation steps
class BrowserStepExecutor extends StepExecutor {
  constructor(type) {
    super(type);
  }

  // Get or create browser session for automation
  async getOrCreateSession(context, stepConfig) {
    const userId = context.automationId;
    const sessionKey = `browser_session:${userId}:${context.executionId}`;
    
    // Check if session already exists in context
    let sessionId = context.getVariable(sessionKey);
    
    if (!sessionId) {
      // Create new session
      const sessionOptions = {
        headless: stepConfig.headless !== false,
        width: stepConfig.viewportWidth || 1920,
        height: stepConfig.viewportHeight || 1080,
        timeout: stepConfig.timeout || 30000,
        userAgent: stepConfig.userAgent,
        blockImages: stepConfig.blockImages !== false,
        blockResources: stepConfig.blockResources !== false
      };
      
      sessionId = await browserService.createSession(userId, sessionOptions);
      context.setVariable(sessionKey, sessionId);
      
      context.log('info', 'Browser session created', { sessionId });
    }
    
    return sessionId;
  }

  // Common validation for browser steps
  validateBrowserConfig(stepConfig) {
    const errors = [];
    
    if (stepConfig.timeout && (stepConfig.timeout < 1000 || stepConfig.timeout > 300000)) {
      errors.push('Timeout must be between 1000ms and 300000ms');
    }
    
    return errors;
  }
}

// Navigate to URL
class InterfaceNavigateExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_NAVIGATE);
  }

  async execute(step, context, inputData) {
    const { url, waitUntil = 'networkidle2', waitTime } = step.config;
    
    context.log('info', `Navigating to URL: ${url}`, { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      const result = await browserService.navigate(sessionId, url, {
        waitUntil,
        waitTime,
        timeout: step.config.timeout
      });

      return {
        success: true,
        data: {
          url: result.url,
          title: result.title,
          sessionId
        },
        metadata: {
          operation: 'navigate',
          targetUrl: url,
          finalUrl: result.url,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `Navigation failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (!stepConfig.url) {
      errors.push('URL is required');
    }
    
    if (stepConfig.url && !this.isValidUrl(stepConfig.url)) {
      errors.push('Invalid URL format');
    }
    
    return { valid: errors.length === 0, errors };
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }
}

// Click element
class InterfaceClickExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_CLICK);
  }

  async execute(step, context, inputData) {
    const { selector, method = 'default', waitAfter, scroll = true } = step.config;
    
    context.log('info', `Clicking element: ${selector}`, { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      const result = await browserService.clickElement(sessionId, selector, {
        method,
        waitAfter,
        scroll,
        timeout: step.config.elementTimeout || 10000,
        delay: step.config.delay,
        button: step.config.button,
        clickCount: step.config.clickCount
      });

      return {
        success: true,
        data: result,
        metadata: {
          operation: 'click',
          selector,
          method,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `Click failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (!stepConfig.selector) {
      errors.push('Selector is required');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Type text
class InterfaceTypeExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_TYPE);
  }

  async execute(step, context, inputData) {
    const { selector, text, clear = true, pressEnter = false } = step.config;
    
    context.log('info', `Typing in element: ${selector}`, { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      // Support dynamic text from input data
      let finalText = text;
      if (step.config.useInputData && inputData) {
        finalText = typeof inputData === 'string' ? inputData : JSON.stringify(inputData);
      }
      
      const result = await browserService.typeText(sessionId, selector, finalText, {
        clear,
        pressEnter,
        delay: step.config.delay || 50,
        timeout: step.config.elementTimeout || 10000
      });

      return {
        success: true,
        data: {
          ...result,
          textEntered: finalText.length
        },
        metadata: {
          operation: 'type',
          selector,
          textLength: finalText.length,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `Type failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (!stepConfig.selector) {
      errors.push('Selector is required');
    }
    
    if (!stepConfig.text && !stepConfig.useInputData) {
      errors.push('Text or useInputData must be specified');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Extract data from page
class InterfaceExtractExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_EXTRACT);
  }

  async execute(step, context, inputData) {
    const { selector, extractType = 'text', multiple = false, attribute } = step.config;
    
    context.log('info', `Extracting data from: ${selector}`, { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      const result = await browserService.extractText(sessionId, selector, {
        multiple,
        timeout: step.config.elementTimeout || 10000,
        wait: step.config.waitForElement !== false
      });

      // Process extracted data based on type
      let processedData = result.data;
      
      if (extractType === 'attribute' && attribute) {
        if (multiple) {
          processedData = processedData.map(item => item.attributes?.[attribute] || '');
        } else {
          processedData = processedData.attributes?.[attribute] || '';
        }
      } else if (extractType === 'html') {
        if (multiple) {
          processedData = processedData.map(item => item.html);
        } else {
          processedData = processedData.html;
        }
      } else {
        // Default to text
        if (multiple) {
          processedData = processedData.map(item => item.text);
        } else {
          processedData = processedData.text;
        }
      }

      return {
        success: true,
        data: processedData,
        metadata: {
          operation: 'extract',
          selector,
          extractType,
          multiple,
          itemCount: multiple ? (Array.isArray(processedData) ? processedData.length : 0) : 1,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `Extract failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (!stepConfig.selector) {
      errors.push('Selector is required');
    }
    
    if (stepConfig.extractType === 'attribute' && !stepConfig.attribute) {
      errors.push('Attribute name is required when extracting attributes');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Wait for condition
class InterfaceWaitExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_WAIT);
  }

  async execute(step, context, inputData) {
    const { waitType, condition, timeout = 30000 } = step.config;
    
    context.log('info', `Waiting for condition: ${waitType}`, { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      let result;
      
      switch (waitType) {
        case 'selector':
          result = await browserService.waitFor(sessionId, condition, {
            visible: step.config.visible,
            hidden: step.config.hidden,
            timeout
          });
          break;
        
        case 'timeout':
          const waitTime = parseInt(condition);
          result = await browserService.waitFor(sessionId, waitTime);
          break;
        
        case 'function':
          // Wait for custom JavaScript function to return true
          result = await browserService.waitFor(sessionId, new Function('return ' + condition), {
            timeout,
            polling: step.config.polling
          });
          break;
        
        default:
          throw new Error(`Unknown wait type: ${waitType}`);
      }

      return {
        success: true,
        data: result,
        metadata: {
          operation: 'wait',
          waitType,
          condition: condition,
          timeout,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `Wait failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (!stepConfig.waitType) {
      errors.push('Wait type is required');
    }
    
    if (!stepConfig.condition) {
      errors.push('Condition is required');
    }
    
    if (stepConfig.waitType === 'timeout') {
      const waitTime = parseInt(stepConfig.condition);
      if (isNaN(waitTime) || waitTime < 0 || waitTime > 300000) {
        errors.push('Timeout must be a number between 0 and 300000ms');
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Take screenshot
class InterfaceScreenshotExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_SCREENSHOT);
  }

  async execute(step, context, inputData) {
    const { filename, fullPage = false, quality = 90 } = step.config;
    
    context.log('info', 'Taking screenshot', { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      const result = await browserService.takeScreenshot(sessionId, {
        filename,
        fullPage,
        quality,
        type: step.config.type || 'png'
      });

      return {
        success: true,
        data: {
          filename: result.filename,
          path: result.path,
          url: result.url
        },
        metadata: {
          operation: 'screenshot',
          filename: result.filename,
          fullPage,
          quality,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `Screenshot failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (stepConfig.quality && (stepConfig.quality < 1 || stepConfig.quality > 100)) {
      errors.push('Quality must be between 1 and 100');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Execute JavaScript
class InterfaceExecuteJSExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_EXECUTE_JS);
  }

  async execute(step, context, inputData) {
    const { script, args = [] } = step.config;
    
    context.log('info', 'Executing JavaScript', { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      // Process arguments, support input data
      const processedArgs = args.map(arg => {
        if (arg === '{{inputData}}') {
          return inputData;
        }
        return arg;
      });
      
      const result = await browserService.executeScript(sessionId, script, ...processedArgs);

      return {
        success: true,
        data: result.result,
        metadata: {
          operation: 'execute_js',
          scriptLength: script.length,
          argsCount: processedArgs.length,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `JavaScript execution failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (!stepConfig.script) {
      errors.push('JavaScript script is required');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Scroll page
class InterfaceScrollExecutor extends BrowserStepExecutor {
  constructor() {
    super(BROWSER_STEP_TYPES.INTERFACE_SCROLL);
  }

  async execute(step, context, inputData) {
    const { scrollType = 'to_element', target, x = 0, y = 0 } = step.config;
    
    context.log('info', `Scrolling: ${scrollType}`, { stepId: step.id });

    try {
      const sessionId = await this.getOrCreateSession(context, step.config);
      
      let script;
      
      switch (scrollType) {
        case 'to_element':
          if (!target) throw new Error('Target selector required for scrolling to element');
          script = `document.querySelector('${target}')?.scrollIntoView({behavior: 'smooth', block: 'center'})`;
          break;
        
        case 'to_position':
          script = `window.scrollTo({top: ${y}, left: ${x}, behavior: 'smooth'})`;
          break;
        
        case 'to_top':
          script = `window.scrollTo({top: 0, behavior: 'smooth'})`;
          break;
        
        case 'to_bottom':
          script = `window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})`;
          break;
        
        case 'by_amount':
          script = `window.scrollBy({top: ${y}, left: ${x}, behavior: 'smooth'})`;
          break;
        
        default:
          throw new Error(`Unknown scroll type: ${scrollType}`);
      }
      
      const result = await browserService.executeScript(sessionId, script);
      
      // Wait for scroll to complete
      await browserService.waitFor(sessionId, 500);

      return {
        success: true,
        data: result.result,
        metadata: {
          operation: 'scroll',
          scrollType,
          target,
          x,
          y,
          source: 'browser_automation'
        }
      };

    } catch (error) {
      context.log('error', `Scroll failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [...this.validateBrowserConfig(stepConfig)];
    
    if (stepConfig.scrollType === 'to_element' && !stepConfig.target) {
      errors.push('Target selector is required for scrolling to element');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Export browser step executors
export const browserStepExecutors = new Map([
  [BROWSER_STEP_TYPES.INTERFACE_NAVIGATE, new InterfaceNavigateExecutor()],
  [BROWSER_STEP_TYPES.INTERFACE_CLICK, new InterfaceClickExecutor()],
  [BROWSER_STEP_TYPES.INTERFACE_TYPE, new InterfaceTypeExecutor()],
  [BROWSER_STEP_TYPES.INTERFACE_EXTRACT, new InterfaceExtractExecutor()],
  [BROWSER_STEP_TYPES.INTERFACE_WAIT, new InterfaceWaitExecutor()],
  [BROWSER_STEP_TYPES.INTERFACE_SCREENSHOT, new InterfaceScreenshotExecutor()],
  [BROWSER_STEP_TYPES.INTERFACE_EXECUTE_JS, new InterfaceExecuteJSExecutor()],
  [BROWSER_STEP_TYPES.INTERFACE_SCROLL, new InterfaceScrollExecutor()]
]);

export default browserStepExecutors;