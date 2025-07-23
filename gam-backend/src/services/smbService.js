// SMB2 import with fallback for missing package
let SMB2;
try {
  SMB2 = await import('smb2');
  SMB2 = SMB2.default || SMB2;
} catch (error) {
  console.warn('SMB2 package not available, SMB functionality will be limited');
}

import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../config/logs.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SMBService {
  constructor() {
    this.activeConnections = new Map(); // userId -> connection pool
    this.connectionConfig = new Map(); // userId -> config
  }

  // Connection strategies enum
  static STRATEGIES = {
    SMB2_DIRECT: 'smb2_direct',
    SAMBA_CLIENT: 'samba_client',
    MOUNT_SHARE: 'mount_share',
    UI_AUTOMATION: 'ui_automation'
  };

  // Test SMB connection with multiple fallback strategies
  async testConnection(userId, config) {
    logger.info('Testing SMB connection', { userId, server: config.server, share: config.share });

    const strategies = [
      SMBService.STRATEGIES.SMB2_DIRECT,
      SMBService.STRATEGIES.SAMBA_CLIENT,
      SMBService.STRATEGIES.MOUNT_SHARE
    ];

    let lastError = null;
    
    for (const strategy of strategies) {
      try {
        const result = await this.testConnectionStrategy(strategy, config);
        if (result.success) {
          logger.info('SMB connection successful', { userId, strategy, server: config.server });
          return {
            success: true,
            strategy: strategy,
            data: result.data,
            message: `Connection successful using ${strategy}`
          };
        }
      } catch (error) {
        lastError = error;
        logger.warn('SMB connection strategy failed', { 
          userId, 
          strategy, 
          server: config.server, 
          error: error.message 
        });
      }
    }

    // All strategies failed
    logger.error('All SMB connection strategies failed', { userId, error: lastError?.message });
    throw new Error(`SMB connection failed: ${lastError?.message || 'All strategies failed'}`);
  }

  // Test individual connection strategy
  async testConnectionStrategy(strategy, config) {
    switch (strategy) {
      case SMBService.STRATEGIES.SMB2_DIRECT:
        return await this.testSMB2Direct(config);
      
      case SMBService.STRATEGIES.SAMBA_CLIENT:
        return await this.testSambaClient(config);
      
      case SMBService.STRATEGIES.MOUNT_SHARE:
        return await this.testMountShare(config);
      
      default:
        throw new Error(`Unknown SMB strategy: ${strategy}`);
    }
  }

  // Strategy 1: Direct SMB2 connection using marsaud-smb2
  async testSMB2Direct(config) {
    return new Promise((resolve, reject) => {
      const smb2Client = new SMB2({
        share: `\\\\${config.server}\\${config.share}`,
        domain: config.domain || 'WORKGROUP',
        username: config.username,
        password: config.password,
        autoCloseTimeout: 10000,
        packetConcurrency: 20
      });

      // Test connection by listing root directory
      smb2Client.readdir('', (err, files) => {
        if (err) {
          smb2Client.disconnect();
          reject(new Error(`SMB2 connection failed: ${err.message}`));
          return;
        }

        smb2Client.disconnect();
        resolve({
          success: true,
          data: {
            filesCount: files?.length || 0,
            connectionTime: Date.now()
          }
        });
      });

      // Set timeout for connection attempt
      setTimeout(() => {
        smb2Client.disconnect();
        reject(new Error('SMB2 connection timeout'));
      }, 30000);
    });
  }

  // Strategy 2: Samba client wrapper
  async testSambaClient(config) {
    return new Promise((resolve, reject) => {
      const smbclientArgs = [
        '-L', config.server,
        '-U', `${config.domain || 'WORKGROUP'}\\${config.username}%${config.password}`,
        '-W', config.domain || 'WORKGROUP'
      ];

      const smbclient = spawn('smbclient', smbclientArgs);
      let output = '';
      let errorOutput = '';

      smbclient.stdout.on('data', (data) => {
        output += data.toString();
      });

      smbclient.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      smbclient.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            data: {
              output: output,
              connectionTime: Date.now()
            }
          });
        } else {
          reject(new Error(`Samba client failed: ${errorOutput || 'Unknown error'}`));
        }
      });

      smbclient.on('error', (error) => {
        reject(new Error(`Samba client error: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        smbclient.kill();
        reject(new Error('Samba client timeout'));
      }, 30000);
    });
  }

  // Strategy 3: Mount share (Linux/Mac only)
  async testMountShare(config) {
    if (process.platform === 'win32') {
      throw new Error('Mount share not supported on Windows');
    }

    return new Promise((resolve, reject) => {
      const mountPoint = `/tmp/smb_test_${Date.now()}`;
      const shareUrl = `smb://${config.server}/${config.share}`;
      
      // Create mount point
      fs.ensureDirSync(mountPoint);

      const mountArgs = [
        '-t', 'cifs',
        shareUrl,
        mountPoint,
        '-o', `username=${config.username},password=${config.password},domain=${config.domain || 'WORKGROUP'}`
      ];

      const mount = spawn('mount', mountArgs, { stdio: 'inherit' });
      
      mount.on('close', (code) => {
        if (code === 0) {
          // Test if mount is accessible
          fs.readdir(mountPoint)
            .then(files => {
              // Unmount
              spawn('umount', [mountPoint]);
              fs.removeSync(mountPoint);
              
              resolve({
                success: true,
                data: {
                  filesCount: files.length,
                  connectionTime: Date.now()
                }
              });
            })
            .catch(error => {
              // Cleanup
              spawn('umount', [mountPoint]);
              fs.removeSync(mountPoint);
              reject(new Error(`Mount test failed: ${error.message}`));
            });
        } else {
          fs.removeSync(mountPoint);
          reject(new Error('Mount command failed'));
        }
      });

      mount.on('error', (error) => {
        fs.removeSync(mountPoint);
        reject(new Error(`Mount error: ${error.message}`));
      });
    });
  }

  // Create SMB connection for user
  async createConnection(userId, config, strategy = null) {
    try {
      logger.info('Creating SMB connection', { userId, server: config.server });

      // If no strategy specified, test and find the best one
      if (!strategy) {
        const testResult = await this.testConnection(userId, config);
        strategy = testResult.strategy;
      }

      // Store config for this user
      this.connectionConfig.set(userId, { ...config, strategy });

      // Create connection based on strategy
      let connection;
      switch (strategy) {
        case SMBService.STRATEGIES.SMB2_DIRECT:
          connection = await this.createSMB2Connection(config);
          break;
        
        case SMBService.STRATEGIES.SAMBA_CLIENT:
          connection = await this.createSambaClientConnection(config);
          break;
        
        default:
          throw new Error(`Unsupported connection strategy: ${strategy}`);
      }

      // Store active connection
      this.activeConnections.set(userId, {
        connection,
        strategy,
        config,
        createdAt: Date.now(),
        lastUsed: Date.now()
      });

      return {
        success: true,
        strategy: strategy,
        message: 'SMB connection created successfully'
      };

    } catch (error) {
      logger.error('Failed to create SMB connection', { userId, error: error.message });
      throw error;
    }
  }

  // Create SMB2 direct connection
  async createSMB2Connection(config) {
    return new SMB2({
      share: `\\\\${config.server}\\${config.share}`,
      domain: config.domain || 'WORKGROUP',
      username: config.username,
      password: config.password,
      autoCloseTimeout: 0, // Keep connection alive
      packetConcurrency: 10 // Optimized for cloud latency
    });
  }

  // Create Samba client connection (wrapper object)
  async createSambaClientConnection(config) {
    return {
      type: 'samba_client',
      config: config,
      execute: (command, args) => {
        return new Promise((resolve, reject) => {
          const fullArgs = [
            ...args,
            '-U', `${config.domain || 'WORKGROUP'}\\${config.username}%${config.password}`,
            '-W', config.domain || 'WORKGROUP'
          ];

          const process = spawn(command, fullArgs);
          let output = '';
          let errorOutput = '';

          process.stdout.on('data', (data) => {
            output += data.toString();
          });

          process.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });

          process.on('close', (code) => {
            if (code === 0) {
              resolve(output);
            } else {
              reject(new Error(errorOutput || 'Command failed'));
            }
          });

          process.on('error', reject);
        });
      }
    };
  }

  // List files in SMB share
  async listFiles(userId, remotePath = '') {
    try {
      const connectionInfo = this.activeConnections.get(userId);
      if (!connectionInfo) {
        throw new Error('No active SMB connection found');
      }

      this.updateLastUsed(userId);
      
      switch (connectionInfo.strategy) {
        case SMBService.STRATEGIES.SMB2_DIRECT:
          return await this.listFilesSMB2(connectionInfo.connection, remotePath);
        
        case SMBService.STRATEGIES.SAMBA_CLIENT:
          return await this.listFilesSambaClient(connectionInfo.connection, remotePath);
        
        default:
          throw new Error(`List files not implemented for strategy: ${connectionInfo.strategy}`);
      }

    } catch (error) {
      logger.error('Failed to list SMB files', { userId, remotePath, error: error.message });
      throw error;
    }
  }

  // List files using SMB2 direct
  async listFilesSMB2(connection, remotePath) {
    return new Promise((resolve, reject) => {
      connection.readdir(remotePath, (err, files) => {
        if (err) {
          reject(new Error(`Failed to list files: ${err.message}`));
          return;
        }

        const transformedFiles = files.map(file => ({
          name: file.Filename,
          type: file.FileAttributes & 0x10 ? 'folder' : 'file', // FILE_ATTRIBUTE_DIRECTORY
          size: file.EndOfFile,
          created: file.CreationTime,
          modified: file.LastWriteTime,
          accessed: file.LastAccessTime
        }));

        resolve({
          success: true,
          data: transformedFiles,
          path: remotePath
        });
      });
    });
  }

  // List files using Samba client
  async listFilesSambaClient(connection, remotePath) {
    try {
      const shareUrl = `//${connection.config.server}/${connection.config.share}`;
      const output = await connection.execute('smbclient', [
        shareUrl,
        '-c', `ls ${remotePath}`
      ]);

      // Parse smbclient output
      const lines = output.split('\n').filter(line => line.trim());
      const files = [];

      for (const line of lines) {
        // Parse smbclient ls output format
        const match = line.match(/^\s*(.+?)\s+([AD])\s+(\d+)\s+(.+)$/);
        if (match) {
          files.push({
            name: match[1].trim(),
            type: match[2] === 'D' ? 'folder' : 'file',
            size: parseInt(match[3]),
            modified: match[4],
            created: null,
            accessed: null
          });
        }
      }

      return {
        success: true,
        data: files,
        path: remotePath
      };

    } catch (error) {
      throw new Error(`Failed to list files via smbclient: ${error.message}`);
    }
  }

  // Download file from SMB share
  async downloadFile(userId, remotePath, localPath = null) {
    try {
      const connectionInfo = this.activeConnections.get(userId);
      if (!connectionInfo) {
        throw new Error('No active SMB connection found');
      }

      this.updateLastUsed(userId);
      
      switch (connectionInfo.strategy) {
        case SMBService.STRATEGIES.SMB2_DIRECT:
          return await this.downloadFileSMB2(connectionInfo.connection, remotePath, localPath);
        
        case SMBService.STRATEGIES.SAMBA_CLIENT:
          return await this.downloadFileSambaClient(connectionInfo.connection, remotePath, localPath);
        
        default:
          throw new Error(`Download not implemented for strategy: ${connectionInfo.strategy}`);
      }

    } catch (error) {
      logger.error('Failed to download SMB file', { userId, remotePath, error: error.message });
      throw error;
    }
  }

  // Download file using SMB2 direct
  async downloadFileSMB2(connection, remotePath, localPath) {
    return new Promise((resolve, reject) => {
      if (localPath) {
        // Download to local file
        const dir = path.dirname(localPath);
        fs.ensureDirSync(dir);
        
        connection.createReadStream(remotePath, (err, readStream) => {
          if (err) {
            reject(new Error(`Failed to create read stream: ${err.message}`));
            return;
          }

          const writeStream = fs.createWriteStream(localPath);
          readStream.pipe(writeStream);

          writeStream.on('finish', () => {
            resolve({
              success: true,
              localPath: localPath,
              message: 'File downloaded successfully'
            });
          });

          writeStream.on('error', (error) => {
            reject(new Error(`Download failed: ${error.message}`));
          });
        });
      } else {
        // Return stream
        connection.createReadStream(remotePath, (err, readStream) => {
          if (err) {
            reject(new Error(`Failed to create read stream: ${err.message}`));
            return;
          }

          resolve({
            success: true,
            stream: readStream,
            message: 'File stream ready'
          });
        });
      }
    });
  }

  // Download file using Samba client
  async downloadFileSambaClient(connection, remotePath, localPath) {
    try {
      if (!localPath) {
        throw new Error('Samba client strategy requires local path for download');
      }

      const dir = path.dirname(localPath);
      await fs.ensureDir(dir);

      const shareUrl = `//${connection.config.server}/${connection.config.share}`;
      
      await connection.execute('smbclient', [
        shareUrl,
        '-c', `get "${remotePath}" "${localPath}"`
      ]);

      return {
        success: true,
        localPath: localPath,
        message: 'File downloaded successfully'
      };

    } catch (error) {
      throw new Error(`Failed to download via smbclient: ${error.message}`);
    }
  }

  // Upload file to SMB share
  async uploadFile(userId, localPath, remotePath) {
    try {
      const connectionInfo = this.activeConnections.get(userId);
      if (!connectionInfo) {
        throw new Error('No active SMB connection found');
      }

      // Check if local file exists
      if (!await fs.pathExists(localPath)) {
        throw new Error(`Local file not found: ${localPath}`);
      }

      this.updateLastUsed(userId);
      
      switch (connectionInfo.strategy) {
        case SMBService.STRATEGIES.SMB2_DIRECT:
          return await this.uploadFileSMB2(connectionInfo.connection, localPath, remotePath);
        
        case SMBService.STRATEGIES.SAMBA_CLIENT:
          return await this.uploadFileSambaClient(connectionInfo.connection, localPath, remotePath);
        
        default:
          throw new Error(`Upload not implemented for strategy: ${connectionInfo.strategy}`);
      }

    } catch (error) {
      logger.error('Failed to upload SMB file', { userId, localPath, remotePath, error: error.message });
      throw error;
    }
  }

  // Upload file using SMB2 direct
  async uploadFileSMB2(connection, localPath, remotePath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(localPath);
      
      connection.createWriteStream(remotePath, (err, writeStream) => {
        if (err) {
          reject(new Error(`Failed to create write stream: ${err.message}`));
          return;
        }

        readStream.pipe(writeStream);

        writeStream.on('finish', () => {
          resolve({
            success: true,
            remotePath: remotePath,
            message: 'File uploaded successfully'
          });
        });

        writeStream.on('error', (error) => {
          reject(new Error(`Upload failed: ${error.message}`));
        });
      });
    });
  }

  // Upload file using Samba client
  async uploadFileSambaClient(connection, localPath, remotePath) {
    try {
      const shareUrl = `//${connection.config.server}/${connection.config.share}`;
      
      await connection.execute('smbclient', [
        shareUrl,
        '-c', `put "${localPath}" "${remotePath}"`
      ]);

      return {
        success: true,
        remotePath: remotePath,
        message: 'File uploaded successfully'
      };

    } catch (error) {
      throw new Error(`Failed to upload via smbclient: ${error.message}`);
    }
  }

  // Update last used timestamp
  updateLastUsed(userId) {
    const connectionInfo = this.activeConnections.get(userId);
    if (connectionInfo) {
      connectionInfo.lastUsed = Date.now();
    }
  }

  // Disconnect SMB connection
  async disconnect(userId) {
    try {
      const connectionInfo = this.activeConnections.get(userId);
      if (!connectionInfo) {
        return { success: true, message: 'No active connection' };
      }

      // Disconnect based on strategy
      if (connectionInfo.strategy === SMBService.STRATEGIES.SMB2_DIRECT) {
        connectionInfo.connection.disconnect();
      }

      // Remove from active connections
      this.activeConnections.delete(userId);
      this.connectionConfig.delete(userId);

      logger.info('SMB connection disconnected', { userId });
      
      return {
        success: true,
        message: 'SMB connection disconnected successfully'
      };

    } catch (error) {
      logger.error('Failed to disconnect SMB', { userId, error: error.message });
      throw error;
    }
  }

  // Get connection status
  getConnectionStatus(userId) {
    const connectionInfo = this.activeConnections.get(userId);
    const config = this.connectionConfig.get(userId);
    
    return {
      connected: !!connectionInfo,
      strategy: connectionInfo?.strategy,
      server: config?.server,
      share: config?.share,
      createdAt: connectionInfo?.createdAt,
      lastUsed: connectionInfo?.lastUsed
    };
  }

  // Cleanup idle connections (call periodically)
  cleanupIdleConnections(maxIdleTime = 30 * 60 * 1000) { // 30 minutes default
    const now = Date.now();
    
    for (const [userId, connectionInfo] of this.activeConnections.entries()) {
      if (now - connectionInfo.lastUsed > maxIdleTime) {
        logger.info('Cleaning up idle SMB connection', { userId });
        this.disconnect(userId).catch(err => {
          logger.error('Failed to cleanup idle connection', { userId, error: err.message });
        });
      }
    }
  }
}

export const smbService = new SMBService();

// Start cleanup interval
setInterval(() => {
  smbService.cleanupIdleConnections();
}, 5 * 60 * 1000); // Check every 5 minutes

export default smbService;