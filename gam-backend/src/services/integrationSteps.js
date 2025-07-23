import { StepExecutor, STEP_TYPES } from './workflowEngine.js';
import { sharepointService } from './sharepointService.js';
import { oneDriveService } from './oneDriveService.js';
import { smbService } from './smbService.js';
import { microsoftAuth } from './microsoftAuth.js';
import { logger } from '../config/logs.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create temp directory for file operations
const TEMP_DIR = path.join(__dirname, '../../temp');
fs.ensureDirSync(TEMP_DIR);

// SharePoint Source Step
class SharePointSourceExecutor extends StepExecutor {
  constructor() {
    super('source_sharepoint');
  }

  async execute(step, context, inputData) {
    const { siteId, driveId, folderPath = 'root', operation = 'list_files' } = step.config;
    const userId = context.automationId; // Using automationId as userId for now

    context.log('info', `Executing SharePoint source: ${operation}`, { stepId: step.id });

    try {
      // Check if user has Microsoft integration
      const isConnected = await microsoftAuth.isUserConnected(userId);
      if (!isConnected) {
        throw new Error('Microsoft integration not connected');
      }

      let result;
      switch (operation) {
        case 'list_files':
          result = await sharepointService.listFiles(userId, siteId, driveId, folderPath);
          break;
        
        case 'list_sites':
          const searchQuery = step.config.searchQuery || '';
          result = await sharepointService.listSites(userId, searchQuery);
          break;
        
        case 'list_document_libraries':
          result = await sharepointService.listDocumentLibraries(userId, siteId);
          break;
        
        case 'get_list_items':
          const { listId, pageSize = 200 } = step.config;
          result = await sharepointService.getListItems(userId, siteId, listId, { pageSize });
          break;
        
        case 'search_files':
          const { query, fileTypes = [] } = step.config;
          result = await sharepointService.searchFiles(userId, siteId, query, { fileTypes });
          break;
        
        default:
          throw new Error(`Unknown SharePoint operation: ${operation}`);
      }

      context.log('info', `SharePoint operation completed`, { 
        stepId: step.id, 
        operation,
        itemCount: Array.isArray(result.data) ? result.data.length : 'not-array'
      });

      return {
        success: true,
        data: result.data,
        metadata: {
          operation,
          siteId,
          driveId,
          folderPath,
          itemCount: Array.isArray(result.data) ? result.data.length : 1,
          source: 'sharepoint'
        }
      };

    } catch (error) {
      context.log('error', `SharePoint source failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [];
    
    if (!stepConfig.operation) {
      errors.push('Operation is required');
    }
    
    const { operation } = stepConfig;
    
    if (['list_files', 'list_document_libraries', 'get_list_items'].includes(operation) && !stepConfig.siteId) {
      errors.push('Site ID is required for this operation');
    }
    
    if (operation === 'list_files' && !stepConfig.driveId) {
      errors.push('Drive ID is required for listing files');
    }
    
    if (operation === 'get_list_items' && !stepConfig.listId) {
      errors.push('List ID is required for getting list items');
    }
    
    if (operation === 'search_files' && !stepConfig.query) {
      errors.push('Search query is required');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// OneDrive Source Step
class OneDriveSourceExecutor extends StepExecutor {
  constructor() {
    super('source_onedrive');
  }

  async execute(step, context, inputData) {
    const { folderPath = 'root', operation = 'list_files' } = step.config;
    const userId = context.automationId;

    context.log('info', `Executing OneDrive source: ${operation}`, { stepId: step.id });

    try {
      const isConnected = await microsoftAuth.isUserConnected(userId);
      if (!isConnected) {
        throw new Error('Microsoft integration not connected');
      }

      let result;
      switch (operation) {
        case 'list_files':
          const { sortBy, sortOrder, pageSize = 200 } = step.config;
          result = await oneDriveService.listItems(userId, folderPath, { sortBy, sortOrder, pageSize });
          break;
        
        case 'get_drive_info':
          result = await oneDriveService.getDriveInfo(userId);
          break;
        
        case 'search_files':
          const { query, fileTypes = [] } = step.config;
          result = await oneDriveService.searchFiles(userId, query, { fileTypes });
          break;
        
        case 'get_usage_stats':
          result = await oneDriveService.getUsageStats(userId);
          break;
        
        default:
          throw new Error(`Unknown OneDrive operation: ${operation}`);
      }

      context.log('info', `OneDrive operation completed`, { 
        stepId: step.id, 
        operation,
        itemCount: Array.isArray(result.data) ? result.data.length : 'not-array'
      });

      return {
        success: true,
        data: result.data,
        metadata: {
          operation,
          folderPath,
          itemCount: Array.isArray(result.data) ? result.data.length : 1,
          source: 'onedrive'
        }
      };

    } catch (error) {
      context.log('error', `OneDrive source failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [];
    
    if (!stepConfig.operation) {
      errors.push('Operation is required');
    }
    
    if (stepConfig.operation === 'search_files' && !stepConfig.query) {
      errors.push('Search query is required');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// SMB Share Source Step
class SMBShareSourceExecutor extends StepExecutor {
  constructor() {
    super('source_smb_share');
  }

  async execute(step, context, inputData) {
    const { server, share, username, password, domain, remotePath = '', operation = 'list_files' } = step.config;
    const userId = context.automationId;

    context.log('info', `Executing SMB source: ${operation}`, { stepId: step.id });

    try {
      // Create SMB connection if not exists
      const connectionStatus = smbService.getConnectionStatus(userId);
      if (!connectionStatus.connected) {
        await smbService.createConnection(userId, {
          server,
          share,
          username,
          password,
          domain
        });
      }

      let result;
      switch (operation) {
        case 'list_files':
          result = await smbService.listFiles(userId, remotePath);
          break;
        
        default:
          throw new Error(`Unknown SMB operation: ${operation}`);
      }

      context.log('info', `SMB operation completed`, { 
        stepId: step.id, 
        operation,
        itemCount: Array.isArray(result.data) ? result.data.length : 'not-array'
      });

      return {
        success: true,
        data: result.data,
        metadata: {
          operation,
          server,
          share,
          remotePath,
          itemCount: Array.isArray(result.data) ? result.data.length : 1,
          source: 'smb_share'
        }
      };

    } catch (error) {
      context.log('error', `SMB source failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async validate(stepConfig) {
    const errors = [];
    
    if (!stepConfig.server) {
      errors.push('Server is required');
    }
    
    if (!stepConfig.share) {
      errors.push('Share name is required');
    }
    
    if (!stepConfig.username) {
      errors.push('Username is required');
    }
    
    if (!stepConfig.password) {
      errors.push('Password is required');
    }
    
    if (!stepConfig.operation) {
      errors.push('Operation is required');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// File Operations Action Step
class FileOperationsExecutor extends StepExecutor {
  constructor() {
    super('action_file_operation');
  }

  async execute(step, context, inputData) {
    const { operation, sourceType, destinationType } = step.config;
    const userId = context.automationId;

    context.log('info', `Executing file operation: ${operation}`, { stepId: step.id });

    try {
      let result;
      
      switch (operation) {
        case 'download':
          result = await this.downloadFiles(userId, inputData, step.config, context);
          break;
        
        case 'upload':
          result = await this.uploadFiles(userId, inputData, step.config, context);
          break;
        
        case 'copy':
          result = await this.copyFiles(userId, inputData, step.config, context);
          break;
        
        case 'move':
          result = await this.moveFiles(userId, inputData, step.config, context);
          break;
        
        case 'delete':
          result = await this.deleteFiles(userId, inputData, step.config, context);
          break;
        
        default:
          throw new Error(`Unknown file operation: ${operation}`);
      }

      context.log('info', `File operation completed`, { 
        stepId: step.id, 
        operation,
        processedCount: result.processedCount || 0
      });

      return {
        success: true,
        data: result.data,
        metadata: {
          operation,
          sourceType,
          destinationType,
          processedCount: result.processedCount || 0,
          source: 'file_operations'
        }
      };

    } catch (error) {
      context.log('error', `File operation failed: ${error.message}`, { stepId: step.id });
      throw error;
    }
  }

  async downloadFiles(userId, inputData, config, context) {
    const { sourceType, downloadPath = TEMP_DIR } = config;
    const files = Array.isArray(inputData) ? inputData : [inputData];
    const downloadedFiles = [];

    await fs.ensureDir(downloadPath);

    for (const file of files) {
      try {
        const fileName = file.name || `file_${Date.now()}`;
        const localPath = path.join(downloadPath, fileName);

        switch (sourceType) {
          case 'sharepoint':
            const { siteId, driveId, itemId } = file;
            await sharepointService.downloadFile(userId, siteId, driveId, itemId || file.id, localPath);
            break;
          
          case 'onedrive':
            await oneDriveService.downloadFile(userId, file.id, localPath);
            break;
          
          case 'smb':
            await smbService.downloadFile(userId, file.path || file.name, localPath);
            break;
          
          default:
            throw new Error(`Unsupported source type for download: ${sourceType}`);
        }

        downloadedFiles.push({
          ...file,
          localPath,
          downloaded: true
        });

        context.log('debug', `File downloaded: ${fileName}`, { localPath });

      } catch (error) {
        context.log('warn', `Failed to download file: ${file.name}`, { error: error.message });
        downloadedFiles.push({
          ...file,
          downloaded: false,
          error: error.message
        });
      }
    }

    return {
      data: downloadedFiles,
      processedCount: downloadedFiles.filter(f => f.downloaded).length
    };
  }

  async uploadFiles(userId, inputData, config, context) {
    const { destinationType, destinationPath } = config;
    const files = Array.isArray(inputData) ? inputData : [inputData];
    const uploadedFiles = [];

    for (const file of files) {
      try {
        if (!file.localPath) {
          throw new Error('File must have localPath for upload');
        }

        const remotePath = path.join(destinationPath || '', file.name);

        switch (destinationType) {
          case 'sharepoint':
            const { siteId, driveId } = config;
            const result = await sharepointService.uploadFile(userId, siteId, driveId, file.localPath, remotePath);
            uploadedFiles.push({
              ...file,
              remoteId: result.data.id,
              remoteUrl: result.data.webUrl,
              uploaded: true
            });
            break;
          
          case 'onedrive':
            const oneDriveResult = await oneDriveService.uploadFile(userId, file.localPath, remotePath);
            uploadedFiles.push({
              ...file,
              remoteId: oneDriveResult.data.id,
              remoteUrl: oneDriveResult.data.webUrl,
              uploaded: true
            });
            break;
          
          case 'smb':
            await smbService.uploadFile(userId, file.localPath, remotePath);
            uploadedFiles.push({
              ...file,
              remotePath,
              uploaded: true
            });
            break;
          
          default:
            throw new Error(`Unsupported destination type for upload: ${destinationType}`);
        }

        context.log('debug', `File uploaded: ${file.name}`, { remotePath });

      } catch (error) {
        context.log('warn', `Failed to upload file: ${file.name}`, { error: error.message });
        uploadedFiles.push({
          ...file,
          uploaded: false,
          error: error.message
        });
      }
    }

    return {
      data: uploadedFiles,
      processedCount: uploadedFiles.filter(f => f.uploaded).length
    };
  }

  async copyFiles(userId, inputData, config, context) {
    // Implement copy logic by downloading from source and uploading to destination
    const downloadConfig = { ...config, sourceType: config.sourceType, downloadPath: TEMP_DIR };
    const downloadResult = await this.downloadFiles(userId, inputData, downloadConfig, context);
    
    const uploadConfig = { ...config, destinationType: config.destinationType };
    const uploadResult = await this.uploadFiles(userId, downloadResult.data, uploadConfig, context);

    // Cleanup temporary files
    for (const file of downloadResult.data) {
      if (file.localPath && await fs.pathExists(file.localPath)) {
        await fs.unlink(file.localPath).catch(() => {});
      }
    }

    return {
      data: uploadResult.data,
      processedCount: uploadResult.processedCount
    };
  }

  async moveFiles(userId, inputData, config, context) {
    // Move is copy + delete from source
    const copyResult = await this.copyFiles(userId, inputData, config, context);
    
    // Delete from source (only successful copies)
    const filesToDelete = copyResult.data.filter(f => f.uploaded);
    if (filesToDelete.length > 0) {
      const deleteConfig = { ...config, sourceType: config.sourceType };
      await this.deleteFiles(userId, filesToDelete, deleteConfig, context);
    }

    return copyResult;
  }

  async deleteFiles(userId, inputData, config, context) {
    const { sourceType } = config;
    const files = Array.isArray(inputData) ? inputData : [inputData];
    const deletedFiles = [];

    for (const file of files) {
      try {
        switch (sourceType) {
          case 'sharepoint':
            const { siteId, driveId } = file;
            await sharepointService.deleteItem(userId, siteId, driveId, file.id);
            break;
          
          case 'onedrive':
            await oneDriveService.deleteItem(userId, file.id);
            break;
          
          case 'local':
            if (file.localPath && await fs.pathExists(file.localPath)) {
              await fs.unlink(file.localPath);
            }
            break;
          
          default:
            throw new Error(`Unsupported source type for delete: ${sourceType}`);
        }

        deletedFiles.push({
          ...file,
          deleted: true
        });

        context.log('debug', `File deleted: ${file.name}`);

      } catch (error) {
        context.log('warn', `Failed to delete file: ${file.name}`, { error: error.message });
        deletedFiles.push({
          ...file,
          deleted: false,
          error: error.message
        });
      }
    }

    return {
      data: deletedFiles,
      processedCount: deletedFiles.filter(f => f.deleted).length
    };
  }

  async validate(stepConfig) {
    const errors = [];
    
    if (!stepConfig.operation) {
      errors.push('Operation is required');
    }
    
    const { operation } = stepConfig;
    
    if (['download', 'copy', 'move', 'delete'].includes(operation) && !stepConfig.sourceType) {
      errors.push('Source type is required');
    }
    
    if (['upload', 'copy', 'move'].includes(operation) && !stepConfig.destinationType) {
      errors.push('Destination type is required');
    }
    
    if (stepConfig.sourceType === 'sharepoint' && (!stepConfig.siteId || !stepConfig.driveId)) {
      errors.push('SharePoint operations require siteId and driveId');
    }
    
    return { valid: errors.length === 0, errors };
  }
}

// Export new step types
export const INTEGRATION_STEP_TYPES = {
  SOURCE_SHAREPOINT: 'source_sharepoint',
  SOURCE_ONEDRIVE: 'source_onedrive',
  SOURCE_SMB_SHARE: 'source_smb_share',
  ACTION_FILE_OPERATION: 'action_file_operation'
};

// Export executors
export const integrationExecutors = new Map([
  [INTEGRATION_STEP_TYPES.SOURCE_SHAREPOINT, new SharePointSourceExecutor()],
  [INTEGRATION_STEP_TYPES.SOURCE_ONEDRIVE, new OneDriveSourceExecutor()],
  [INTEGRATION_STEP_TYPES.SOURCE_SMB_SHARE, new SMBShareSourceExecutor()],
  [INTEGRATION_STEP_TYPES.ACTION_FILE_OPERATION, new FileOperationsExecutor()]
]);

export default integrationExecutors;