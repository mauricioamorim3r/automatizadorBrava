import puppeteer from 'puppeteer';
import { logger } from '../config/logs.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BrowserService {
  constructor() {
    this.browserPool = new Map(); // userId -> browser pool
    this.activeSessions = new Map(); // sessionId -> session data
    this.config = {
      maxConcurrentSessions: parseInt(process.env.MAX_BROWSER_SESSIONS) || 10,
      sessionTimeout: parseInt(process.env.BROWSER_SESSION_TIMEOUT) || 30 * 60 * 1000, // 30 minutes
      maxMemoryUsage: parseInt(process.env.MAX_BROWSER_MEMORY) || 512 * 1024 * 1024, // 512MB
      headless: process.env.BROWSER_HEADLESS !== 'false',
      screenshotPath: path.join(__dirname, '../../screenshots')
    };
    
    // Ensure screenshot directory exists
    fs.ensureDirSync(this.config.screenshotPath);
    
    // Start memory monitoring
    this.startMemoryMonitoring();
    
    // Start session cleanup
    this.startSessionCleanup();
  }

  // Create browser instance with optimized settings
  async createBrowser(userId, options = {}) {
    try {
      const browserOptions = {
        headless: options.headless ?? this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--memory-pressure-off',
          `--max_old_space_size=512`,
        ],
        defaultViewport: {
          width: options.width || 1920,
          height: options.height || 1080,
          deviceScaleFactor: 1
        },
        ignoreDefaultArgs: ['--disable-extensions'],
        timeout: 30000
      };

      logger.info('Creating browser instance', { userId, options: browserOptions });
      
      const browser = await puppeteer.launch(browserOptions);
      
      // Monitor browser process
      this.monitorBrowser(browser, userId);
      
      return browser;
      
    } catch (error) {
      logger.error('Failed to create browser instance', { userId, error: error.message });
      throw new Error(`Browser creation failed: ${error.message}`);
    }
  }

  // Create new browser session
  async createSession(userId, options = {}) {
    try {
      // Check concurrent session limit
      const userSessions = Array.from(this.activeSessions.values()).filter(s => s.userId === userId);
      if (userSessions.length >= this.config.maxConcurrentSessions) {
        throw new Error(`Maximum concurrent sessions reached: ${this.config.maxConcurrentSessions}`);
      }

      const browser = await this.createBrowser(userId, options);
      const page = await browser.newPage();
      
      // Configure page settings
      await this.configurePage(page, options);
      
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session = {
        id: sessionId,
        userId,
        browser,
        page,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        memoryUsage: 0,
        options
      };

      this.activeSessions.set(sessionId, session);
      
      logger.info('Browser session created', { userId, sessionId, totalSessions: this.activeSessions.size });
      
      return sessionId;
      
    } catch (error) {
      logger.error('Failed to create browser session', { userId, error: error.message });
      throw error;
    }
  }

  // Configure page with common settings
  async configurePage(page, options = {}) {
    // Set user agent
    await page.setUserAgent(
      options.userAgent || 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    if (options.viewport) {
      await page.setViewport(options.viewport);
    }

    // Set timeouts
    page.setDefaultTimeout(options.timeout || 30000);
    page.setDefaultNavigationTimeout(options.navigationTimeout || 30000);

    // Block unnecessary resources to save memory and speed up
    if (options.blockResources !== false) {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        const url = req.url();
        
        // Block images, fonts, and other non-essential resources
        if (options.blockImages && ['image', 'font'].includes(resourceType)) {
          req.abort();
        } 
        // Block ads and analytics
        else if (this.isBlockedResource(url)) {
          req.abort();
        } 
        else {
          req.continue();
        }
      });
    }

    // Add console logging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logger.debug('Browser console error', { message: msg.text() });
      }
    });

    // Handle page errors
    page.on('pageerror', error => {
      logger.warn('Browser page error', { error: error.message });
    });

    return page;
  }

  // Check if resource should be blocked
  isBlockedResource(url) {
    const blockedPatterns = [
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.com/tr',
      'doubleclick.net',
      'googlesyndication.com',
      'amazon-adsystem.com',
      'adsystem.amazon'
    ];
    
    return blockedPatterns.some(pattern => url.includes(pattern));
  }

  // Get browser session
  getSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    session.lastUsed = Date.now();
    return session;
  }

  // Navigate to URL
  async navigate(sessionId, url, options = {}) {
    try {
      const session = this.getSession(sessionId);
      
      logger.info('Navigating to URL', { sessionId, url });
      
      const navigationOptions = {
        waitUntil: options.waitUntil || 'networkidle2',
        timeout: options.timeout || 30000
      };

      await session.page.goto(url, navigationOptions);
      
      // Wait for additional load time if specified
      if (options.waitTime) {
        await session.page.waitForTimeout(options.waitTime);
      }

      return {
        success: true,
        url: session.page.url(),
        title: await session.page.title()
      };
      
    } catch (error) {
      logger.error('Navigation failed', { sessionId, url, error: error.message });
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  // Click element
  async clickElement(sessionId, selector, options = {}) {
    try {
      const session = this.getSession(sessionId);
      
      logger.debug('Clicking element', { sessionId, selector });
      
      // Wait for element to be visible and clickable
      await session.page.waitForSelector(selector, { 
        visible: true, 
        timeout: options.timeout || 10000 
      });
      
      if (options.scroll) {
        await session.page.evaluate((sel) => {
          document.querySelector(sel)?.scrollIntoView();
        }, selector);
      }

      // Handle different click methods
      if (options.method === 'js') {
        await session.page.evaluate((sel) => {
          document.querySelector(sel)?.click();
        }, selector);
      } else {
        await session.page.click(selector, {
          delay: options.delay || 0,
          button: options.button || 'left',
          clickCount: options.clickCount || 1
        });
      }

      // Wait after click if specified
      if (options.waitAfter) {
        await session.page.waitForTimeout(options.waitAfter);
      }

      return {
        success: true,
        selector,
        method: options.method || 'default'
      };
      
    } catch (error) {
      logger.error('Click failed', { sessionId, selector, error: error.message });
      throw new Error(`Click failed: ${error.message}`);
    }
  }

  // Type text in input
  async typeText(sessionId, selector, text, options = {}) {
    try {
      const session = this.getSession(sessionId);
      
      logger.debug('Typing text', { sessionId, selector, textLength: text.length });
      
      await session.page.waitForSelector(selector, { 
        visible: true, 
        timeout: options.timeout || 10000 
      });

      // Clear existing text if requested
      if (options.clear !== false) {
        await session.page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (element) {
            element.value = '';
            element.focus();
          }
        }, selector);
      }

      // Type text with delay
      await session.page.type(selector, text, {
        delay: options.delay || 50
      });

      // Press Enter if requested
      if (options.pressEnter) {
        await session.page.keyboard.press('Enter');
      }

      return {
        success: true,
        selector,
        textLength: text.length
      };
      
    } catch (error) {
      logger.error('Type text failed', { sessionId, selector, error: error.message });
      throw new Error(`Type text failed: ${error.message}`);
    }
  }

  // Extract text from elements
  async extractText(sessionId, selector, options = {}) {
    try {
      const session = this.getSession(sessionId);
      
      logger.debug('Extracting text', { sessionId, selector });
      
      // Wait for element if required
      if (options.wait !== false) {
        await session.page.waitForSelector(selector, { 
          timeout: options.timeout || 10000 
        });
      }

      let result;
      
      if (options.multiple) {
        // Extract from multiple elements
        result = await session.page.$$eval(selector, (elements) => {
          return elements.map(el => ({
            text: el.textContent?.trim() || '',
            html: el.innerHTML || '',
            tag: el.tagName.toLowerCase()
          }));
        });
      } else {
        // Extract from single element
        result = await session.page.$eval(selector, (element) => ({
          text: element.textContent?.trim() || '',
          html: element.innerHTML || '',
          tag: element.tagName.toLowerCase(),
          attributes: Array.from(element.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {})
        }));
      }

      return {
        success: true,
        selector,
        data: result
      };
      
    } catch (error) {
      logger.error('Text extraction failed', { sessionId, selector, error: error.message });
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  // Wait for element or condition
  async waitFor(sessionId, condition, options = {}) {
    try {
      const session = this.getSession(sessionId);
      
      logger.debug('Waiting for condition', { sessionId, condition: typeof condition });
      
      let result;
      
      if (typeof condition === 'string') {
        // Wait for selector
        result = await session.page.waitForSelector(condition, {
          visible: options.visible,
          hidden: options.hidden,
          timeout: options.timeout || 30000
        });
      } else if (typeof condition === 'function') {
        // Wait for function
        result = await session.page.waitForFunction(condition, {
          timeout: options.timeout || 30000,
          polling: options.polling || 'raf'
        });
      } else if (typeof condition === 'number') {
        // Wait for timeout
        await session.page.waitForTimeout(condition);
        result = true;
      }

      return {
        success: true,
        condition: typeof condition,
        result: !!result
      };
      
    } catch (error) {
      logger.error('Wait condition failed', { sessionId, error: error.message });
      throw new Error(`Wait condition failed: ${error.message}`);
    }
  }

  // Take screenshot
  async takeScreenshot(sessionId, options = {}) {
    try {
      const session = this.getSession(sessionId);
      
      const filename = options.filename || `screenshot_${sessionId}_${Date.now()}.png`;
      const fullPath = path.join(this.config.screenshotPath, filename);
      
      await session.page.screenshot({
        path: fullPath,
        fullPage: options.fullPage || false,
        quality: options.quality || 90,
        type: options.type || 'png'
      });

      logger.info('Screenshot taken', { sessionId, filename, fullPath });
      
      return {
        success: true,
        filename,
        path: fullPath,
        url: `/screenshots/${filename}`
      };
      
    } catch (error) {
      logger.error('Screenshot failed', { sessionId, error: error.message });
      throw new Error(`Screenshot failed: ${error.message}`);
    }
  }

  // Execute JavaScript
  async executeScript(sessionId, script, ...args) {
    try {
      const session = this.getSession(sessionId);
      
      logger.debug('Executing JavaScript', { sessionId, scriptLength: script.length });
      
      const result = await session.page.evaluate(script, ...args);
      
      return {
        success: true,
        result
      };
      
    } catch (error) {
      logger.error('Script execution failed', { sessionId, error: error.message });
      throw new Error(`Script execution failed: ${error.message}`);
    }
  }

  // Close session
  async closeSession(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        return { success: true, message: 'Session not found' };
      }

      // Close browser
      if (session.browser) {
        await session.browser.close();
      }

      this.activeSessions.delete(sessionId);
      
      logger.info('Browser session closed', { sessionId, userId: session.userId });
      
      return {
        success: true,
        message: 'Session closed successfully'
      };
      
    } catch (error) {
      logger.error('Failed to close session', { sessionId, error: error.message });
      throw error;
    }
  }

  // Get session statistics
  getSessionStats() {
    const stats = {
      totalSessions: this.activeSessions.size,
      sessionsByUser: {},
      memoryUsage: 0,
      oldestSession: null,
      newestSession: null
    };

    for (const session of this.activeSessions.values()) {
      // Count by user
      stats.sessionsByUser[session.userId] = (stats.sessionsByUser[session.userId] || 0) + 1;
      
      // Memory usage
      stats.memoryUsage += session.memoryUsage || 0;
      
      // Oldest/newest tracking
      if (!stats.oldestSession || session.createdAt < stats.oldestSession.createdAt) {
        stats.oldestSession = { id: session.id, createdAt: session.createdAt };
      }
      
      if (!stats.newestSession || session.createdAt > stats.newestSession.createdAt) {
        stats.newestSession = { id: session.id, createdAt: session.createdAt };
      }
    }

    return stats;
  }

  // Monitor browser memory usage
  monitorBrowser(browser, userId) {
    setInterval(async () => {
      try {
        const metrics = await browser.metrics();
        // Find session for this browser and update memory usage
        for (const session of this.activeSessions.values()) {
          if (session.browser === browser && session.userId === userId) {
            session.memoryUsage = metrics.JSHeapUsedSize || 0;
            break;
          }
        }
      } catch (error) {
        // Browser might be closed
      }
    }, 10000); // Check every 10 seconds
  }

  // Start memory monitoring for all sessions
  startMemoryMonitoring() {
    setInterval(() => {
      const stats = this.getSessionStats();
      
      if (stats.memoryUsage > this.config.maxMemoryUsage) {
        logger.warn('High memory usage detected', { 
          currentUsage: stats.memoryUsage, 
          maxUsage: this.config.maxMemoryUsage,
          totalSessions: stats.totalSessions
        });
        
        // Close oldest sessions to free memory
        this.cleanupOldSessions(Math.ceil(stats.totalSessions * 0.3)); // Close 30% of sessions
      }
    }, 30000); // Check every 30 seconds
  }

  // Start session cleanup for idle sessions
  startSessionCleanup() {
    setInterval(() => {
      const now = Date.now();
      const sessionsToClose = [];
      
      for (const [sessionId, session] of this.activeSessions.entries()) {
        if (now - session.lastUsed > this.config.sessionTimeout) {
          sessionsToClose.push(sessionId);
        }
      }
      
      for (const sessionId of sessionsToClose) {
        logger.info('Closing idle session', { sessionId });
        this.closeSession(sessionId).catch(error => {
          logger.error('Failed to close idle session', { sessionId, error: error.message });
        });
      }
    }, 60000); // Check every minute
  }

  // Cleanup oldest sessions
  cleanupOldSessions(count) {
    const sortedSessions = Array.from(this.activeSessions.entries())
      .sort(([, a], [, b]) => a.createdAt - b.createdAt)
      .slice(0, count);
    
    for (const [sessionId] of sortedSessions) {
      logger.info('Cleaning up old session', { sessionId });
      this.closeSession(sessionId).catch(error => {
        logger.error('Failed to cleanup old session', { sessionId, error: error.message });
      });
    }
  }

  // Close all sessions (cleanup)
  async closeAllSessions() {
    const sessionIds = Array.from(this.activeSessions.keys());
    
    for (const sessionId of sessionIds) {
      try {
        await this.closeSession(sessionId);
      } catch (error) {
        logger.error('Failed to close session during cleanup', { sessionId, error: error.message });
      }
    }
    
    return {
      success: true,
      closedSessions: sessionIds.length
    };
  }
}

export const browserService = new BrowserService();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Closing all browser sessions...');
  await browserService.closeAllSessions();
});

process.on('SIGTERM', async () => {
  logger.info('Closing all browser sessions...');
  await browserService.closeAllSessions();
});

export default browserService;