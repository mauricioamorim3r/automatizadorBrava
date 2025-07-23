import { logger } from '../config/logs.js';

class ServiceManager {
  constructor() {
    this.services = new Map();
    this.initialized = false;
  }

  // Register a service
  registerService(name, service) {
    this.services.set(name, {
      instance: service,
      started: false,
      error: null
    });
    logger.info(`Service registered: ${name}`);
  }

  // Start all services with error handling
  async startAllServices() {
    if (this.initialized) {
      logger.warn('Services already initialized');
      return;
    }

    const startPromises = [];
    
    for (const [name, serviceData] of this.services.entries()) {
      startPromises.push(this.startService(name, serviceData));
    }

    await Promise.allSettled(startPromises);
    this.initialized = true;
    
    // Log summary
    const started = Array.from(this.services.values()).filter(s => s.started).length;
    const total = this.services.size;
    
    logger.info(`Services initialization complete: ${started}/${total} services started`);
    
    if (started < total) {
      logger.warn('Some services failed to start - check individual service logs');
    }
  }

  // Start individual service with error handling
  async startService(name, serviceData) {
    try {
      logger.info(`Starting service: ${name}`);
      
      if (serviceData.instance && typeof serviceData.instance.start === 'function') {
        await serviceData.instance.start();
        serviceData.started = true;
        logger.info(`Service started successfully: ${name}`);
      } else {
        // Service doesn't have a start method, consider it started
        serviceData.started = true;
        logger.info(`Service ready (no start method): ${name}`);
      }
    } catch (error) {
      serviceData.error = error;
      serviceData.started = false;
      logger.error(`Failed to start service: ${name}`, { 
        error: error.message,
        stack: error.stack 
      });
    }
  }

  // Stop all services
  async stopAllServices() {
    const stopPromises = [];
    
    for (const [name, serviceData] of this.services.entries()) {
      if (serviceData.started) {
        stopPromises.push(this.stopService(name, serviceData));
      }
    }

    await Promise.allSettled(stopPromises);
    this.initialized = false;
    
    logger.info('All services stopped');
  }

  // Stop individual service
  async stopService(name, serviceData) {
    try {
      logger.info(`Stopping service: ${name}`);
      
      if (serviceData.instance && typeof serviceData.instance.stop === 'function') {
        await serviceData.instance.stop();
      }
      
      serviceData.started = false;
      logger.info(`Service stopped: ${name}`);
    } catch (error) {
      logger.error(`Failed to stop service: ${name}`, { error: error.message });
    }
  }

  // Get service status
  getServiceStatus(name) {
    const service = this.services.get(name);
    if (!service) {
      return { exists: false };
    }

    return {
      exists: true,
      started: service.started,
      error: service.error?.message
    };
  }

  // Get all services status
  getAllServicesStatus() {
    const status = {};
    
    for (const [name, serviceData] of this.services.entries()) {
      status[name] = {
        started: serviceData.started,
        error: serviceData.error?.message || null
      };
    }
    
    return {
      initialized: this.initialized,
      services: status,
      summary: {
        total: this.services.size,
        started: Array.from(this.services.values()).filter(s => s.started).length,
        failed: Array.from(this.services.values()).filter(s => s.error).length
      }
    };
  }

  // Check if all services are healthy
  isHealthy() {
    const allStarted = Array.from(this.services.values()).every(s => s.started);
    const noErrors = Array.from(this.services.values()).every(s => !s.error);
    
    return this.initialized && allStarted && noErrors;
  }
}

// Create global service manager instance
export const serviceManager = new ServiceManager();

// Graceful shutdown handling
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, stopping services...');
  await serviceManager.stopAllServices();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, stopping services...');
  await serviceManager.stopAllServices();
  process.exit(0);
});

export default serviceManager;