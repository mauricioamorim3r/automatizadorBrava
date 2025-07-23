import { graphApiClient } from './graphApiClient.js';
import { logger } from '../config/logs.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class OneDriveService {
  constructor() {
    this.graphClient = graphApiClient;
  }

  // Get user's OneDrive information
  async getDriveInfo(userId) {
    try {
      logger.info('Getting OneDrive info', { userId });
      
      const drives = await this.graphClient.getUserDrives(userId);
      const primaryDrive = drives.value?.find(drive => drive.driveType === 'personal') || drives.value?.[0];
      
      if (!primaryDrive) {
        throw new Error('No OneDrive found for user');
      }
      
      return {
        success: true,
        data: {
          id: primaryDrive.id,
          name: primaryDrive.name,
          driveType: primaryDrive.driveType,
          owner: primaryDrive.owner,
          quota: primaryDrive.quota,
          webUrl: primaryDrive.webUrl
        }
      };
      
    } catch (error) {
      logger.error('Failed to get OneDrive info', { userId, error: error.message });
      throw new Error(`Failed to get OneDrive info: ${error.message}`);
    }
  }

  // List files and folders in OneDrive
  async listItems(userId, folderPath = 'root', options = {}) {
    try {
      const { pageSize = 200, sortBy = 'lastModifiedDateTime', sortOrder = 'desc' } = options;
      
      logger.info('Listing OneDrive items', { userId, folderPath, options });
      
      const items = await this.graphClient.getDriveItems(userId, 'default', folderPath, pageSize);
      
      // Transform and sort items
      let transformedItems = items.value?.map(item => ({
        id: item.id,
        name: item.name,
        type: item.file ? 'file' : 'folder',
        size: item.size,
        lastModified: item.lastModifiedDateTime,
        created: item.createdDateTime,
        webUrl: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl'],
        mimeType: item.file?.mimeType,
        extension: item.file ? path.extname(item.name) : null,
        thumbnail: item.thumbnails?.[0]?.medium?.url,
        isShared: !!item.shared,
        path: item.parentReference?.path
      })) || [];
      
      // Apply sorting
      if (sortBy && transformedItems.length > 0) {
        transformedItems.sort((a, b) => {
          let aValue = a[sortBy];
          let bValue = b[sortBy];
          
          // Handle date strings
          if (sortBy.includes('Modified') || sortBy.includes('created')) {
            aValue = new Date(aValue).getTime();
            bValue = new Date(bValue).getTime();
          }
          
          if (sortOrder === 'desc') {
            return bValue > aValue ? 1 : -1;
          } else {
            return aValue > bValue ? 1 : -1;
          }
        });
      }
      
      return {
        success: true,
        data: transformedItems,
        pagination: items['@odata.nextLink'] ? { nextLink: items['@odata.nextLink'] } : null,
        path: folderPath
      };
      
    } catch (error) {
      logger.error('Failed to list OneDrive items', { userId, folderPath, error: error.message });
      throw new Error(`Failed to list OneDrive items: ${error.message}`);
    }
  }

  // Get item details by ID
  async getItem(userId, itemId) {
    try {
      logger.info('Getting OneDrive item', { userId, itemId });
      
      const client = await this.graphClient.createClient(userId);
      
      const item = await client
        .api(`/me/drive/items/${itemId}`)
        .select('id,name,size,lastModifiedDateTime,createdDateTime,file,folder,webUrl,parentReference,shared')
        .get();
      
      return {
        success: true,
        data: {
          id: item.id,
          name: item.name,
          type: item.file ? 'file' : 'folder',
          size: item.size,
          lastModified: item.lastModifiedDateTime,
          created: item.createdDateTime,
          webUrl: item.webUrl,
          downloadUrl: item['@microsoft.graph.downloadUrl'],
          mimeType: item.file?.mimeType,
          extension: item.file ? path.extname(item.name) : null,
          parentPath: item.parentReference?.path,
          isShared: !!item.shared
        }
      };
      
    } catch (error) {
      logger.error('Failed to get OneDrive item', { userId, itemId, error: error.message });
      throw new Error(`Failed to get OneDrive item: ${error.message}`);
    }
  }

  // Download file from OneDrive
  async downloadFile(userId, itemId, localPath = null) {
    try {
      logger.info('Downloading OneDrive file', { userId, itemId, localPath });
      
      // Get file stream from Graph API
      const fileStream = await this.graphClient.downloadFile(userId, 'default', itemId);
      
      if (localPath) {
        // Save to local file
        const dir = path.dirname(localPath);
        await fs.ensureDir(dir);
        
        const writeStream = fs.createWriteStream(localPath);
        fileStream.pipe(writeStream);
        
        return new Promise((resolve, reject) => {
          writeStream.on('finish', () => {
            logger.info('OneDrive file downloaded successfully', { localPath });
            resolve({
              success: true,
              localPath,
              message: 'File downloaded successfully'
            });
          });
          
          writeStream.on('error', (error) => {
            logger.error('OneDrive file download failed', { localPath, error: error.message });
            reject(new Error(`File download failed: ${error.message}`));
          });
        });
      } else {
        // Return stream for further processing
        return {
          success: true,
          stream: fileStream,
          message: 'File stream ready'
        };
      }
      
    } catch (error) {
      logger.error('Failed to download OneDrive file', { userId, itemId, error: error.message });
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  // Upload file to OneDrive
  async uploadFile(userId, localFilePath, destinationPath, options = {}) {
    try {
      const { conflictBehavior = 'replace', createFolders = true } = options;
      
      logger.info('Uploading file to OneDrive', { 
        userId, localFilePath, destinationPath, options 
      });
      
      // Check if local file exists
      if (!await fs.pathExists(localFilePath)) {
        throw new Error(`Local file not found: ${localFilePath}`);
      }
      
      // Get file stats and prepare paths
      const stats = await fs.stat(localFilePath);
      const fileName = path.basename(destinationPath);
      const parentPath = path.dirname(destinationPath);
      
      // For large files (>4MB), use upload session
      if (stats.size > 4 * 1024 * 1024) {
        return await this.uploadLargeFile(userId, parentPath, fileName, localFilePath);
      }
      
      // Small file upload
      const fileStream = fs.createReadStream(localFilePath);
      
      const result = await this.graphClient.uploadFile(
        userId, 
        'default', 
        parentPath === '.' ? 'root' : parentPath, 
        fileName, 
        fileStream, 
        conflictBehavior
      );
      
      return {
        success: true,
        data: {
          id: result.id,
          name: result.name,
          size: result.size,
          webUrl: result.webUrl,
          downloadUrl: result['@microsoft.graph.downloadUrl']
        },
        message: 'File uploaded successfully'
      };
      
    } catch (error) {
      logger.error('Failed to upload file to OneDrive', { 
        userId, localFilePath, destinationPath, error: error.message 
      });
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  // Upload large file using upload session
  async uploadLargeFile(userId, parentPath, fileName, localFilePath) {
    try {
      logger.info('Starting OneDrive large file upload', { userId, fileName });
      
      const client = await this.graphClient.createClient(userId);
      const stats = await fs.stat(localFilePath);
      const fileSize = stats.size;
      
      // Create upload session
      const uploadSession = await client
        .api(`/me/drive/${parentPath === '.' ? 'root' : parentPath}:/${fileName}:/createUploadSession`)
        .post({
          item: {
            '@microsoft.graph.conflictBehavior': 'replace',
            name: fileName
          }
        });
      
      const uploadUrl = uploadSession.uploadUrl;
      const chunkSize = 320 * 1024; // 320KB chunks (Graph API recommended)
      
      // Upload file in chunks
      const fileHandle = await fs.open(localFilePath, 'r');
      let uploadedBytes = 0;
      
      try {
        while (uploadedBytes < fileSize) {
          const remainingBytes = fileSize - uploadedBytes;
          const currentChunkSize = Math.min(chunkSize, remainingBytes);
          
          // Read chunk from file
          const buffer = Buffer.alloc(currentChunkSize);
          const { bytesRead } = await fileHandle.read(buffer, 0, currentChunkSize, uploadedBytes);
          
          if (bytesRead === 0) break;
          
          // Upload chunk
          const start = uploadedBytes;
          const end = uploadedBytes + bytesRead - 1;
          
          const chunkResponse = await client.api(uploadUrl).put(buffer.slice(0, bytesRead), {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': bytesRead.toString()
          });
          
          uploadedBytes += bytesRead;
          
          logger.debug('OneDrive chunk uploaded', { 
            uploadedBytes, 
            totalBytes: fileSize,
            progress: `${Math.round((uploadedBytes / fileSize) * 100)}%`
          });
          
          // If upload is complete, return the result
          if (chunkResponse && chunkResponse.id) {
            return {
              success: true,
              data: {
                id: chunkResponse.id,
                name: chunkResponse.name,
                size: chunkResponse.size,
                webUrl: chunkResponse.webUrl,
                downloadUrl: chunkResponse['@microsoft.graph.downloadUrl']
              },
              message: 'Large file uploaded successfully'
            };
          }
        }
      } finally {
        await fileHandle.close();
      }
      
      throw new Error('Upload completed but no response received');
      
    } catch (error) {
      logger.error('OneDrive large file upload failed', { userId, fileName, error: error.message });
      throw new Error(`Large file upload failed: ${error.message}`);
    }
  }

  // Create folder in OneDrive
  async createFolder(userId, parentPath, folderName) {
    try {
      logger.info('Creating OneDrive folder', { userId, parentPath, folderName });
      
      const client = await this.graphClient.createClient(userId);
      
      const parentEndpoint = parentPath === 'root' || parentPath === '.' 
        ? '/me/drive/root/children'
        : `/me/drive/root:/${parentPath}:/children`;
        
      const folder = await client.api(parentEndpoint).post({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'rename'
      });
      
      return {
        success: true,
        data: {
          id: folder.id,
          name: folder.name,
          webUrl: folder.webUrl,
          type: 'folder'
        },
        message: 'Folder created successfully'
      };
      
    } catch (error) {
      logger.error('Failed to create OneDrive folder', { 
        userId, parentPath, folderName, error: error.message 
      });
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  // Delete item from OneDrive
  async deleteItem(userId, itemId) {
    try {
      logger.info('Deleting OneDrive item', { userId, itemId });
      
      const client = await this.graphClient.createClient(userId);
      await client.api(`/me/drive/items/${itemId}`).delete();
      
      // Clear cache
      await this.graphClient.deleteFromCache(`drive_items:${userId}:default:root`);
      
      return {
        success: true,
        message: 'Item deleted successfully'
      };
      
    } catch (error) {
      logger.error('Failed to delete OneDrive item', { userId, itemId, error: error.message });
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  }

  // Move/rename item in OneDrive
  async moveItem(userId, itemId, newParentId = null, newName = null) {
    try {
      logger.info('Moving/renaming OneDrive item', { userId, itemId, newParentId, newName });
      
      const client = await this.graphClient.createClient(userId);
      
      const updateData = {};
      
      if (newName) {
        updateData.name = newName;
      }
      
      if (newParentId) {
        updateData.parentReference = {
          id: newParentId
        };
      }
      
      const result = await client.api(`/me/drive/items/${itemId}`).patch(updateData);
      
      // Clear cache
      await this.graphClient.deleteFromCache(`drive_items:${userId}:default:root`);
      
      return {
        success: true,
        data: {
          id: result.id,
          name: result.name,
          webUrl: result.webUrl
        },
        message: 'Item moved/renamed successfully'
      };
      
    } catch (error) {
      logger.error('Failed to move/rename OneDrive item', { userId, itemId, error: error.message });
      throw new Error(`Failed to move/rename item: ${error.message}`);
    }
  }

  // Search files in OneDrive
  async searchFiles(userId, query, options = {}) {
    try {
      const { pageSize = 200, fileTypes = [] } = options;
      
      logger.info('Searching OneDrive files', { userId, query, options });
      
      const client = await this.graphClient.createClient(userId);
      
      let searchQuery = query;
      if (fileTypes.length > 0) {
        const typeFilter = fileTypes.map(type => `filetype:${type}`).join(' OR ');
        searchQuery += ` AND (${typeFilter})`;
      }
      
      const searchResults = await client
        .api(`/me/drive/search(q='${encodeURIComponent(searchQuery)}')`)
        .top(pageSize)
        .select('id,name,size,lastModifiedDateTime,file,folder,webUrl')
        .get();
      
      const transformedResults = searchResults.value?.map(item => ({
        id: item.id,
        name: item.name,
        type: item.file ? 'file' : 'folder',
        size: item.size,
        lastModified: item.lastModifiedDateTime,
        webUrl: item.webUrl,
        downloadUrl: item['@microsoft.graph.downloadUrl'],
        mimeType: item.file?.mimeType,
        extension: item.file ? path.extname(item.name) : null
      })) || [];
      
      return {
        success: true,
        data: transformedResults,
        query: searchQuery,
        pagination: searchResults['@odata.nextLink'] ? { nextLink: searchResults['@odata.nextLink'] } : null
      };
      
    } catch (error) {
      logger.error('OneDrive file search failed', { userId, query, error: error.message });
      throw new Error(`File search failed: ${error.message}`);
    }
  }

  // Get file sharing information
  async getShareInfo(userId, itemId) {
    try {
      logger.info('Getting OneDrive share info', { userId, itemId });
      
      const client = await this.graphClient.createClient(userId);
      
      const permissions = await client
        .api(`/me/drive/items/${itemId}/permissions`)
        .get();
      
      return {
        success: true,
        data: permissions.value || [],
        message: 'Share information retrieved'
      };
      
    } catch (error) {
      logger.error('Failed to get OneDrive share info', { userId, itemId, error: error.message });
      throw new Error(`Failed to get share information: ${error.message}`);
    }
  }

  // Create sharing link for file
  async createShareLink(userId, itemId, type = 'view', scope = 'anonymous') {
    try {
      logger.info('Creating OneDrive share link', { userId, itemId, type, scope });
      
      const client = await this.graphClient.createClient(userId);
      
      const shareLink = await client
        .api(`/me/drive/items/${itemId}/createLink`)
        .post({
          type: type, // view, edit, embed
          scope: scope // anonymous, organization
        });
      
      return {
        success: true,
        data: {
          shareUrl: shareLink.link.webUrl,
          type: type,
          scope: scope,
          expirationDateTime: shareLink.expirationDateTime
        },
        message: 'Share link created successfully'
      };
      
    } catch (error) {
      logger.error('Failed to create OneDrive share link', { userId, itemId, error: error.message });
      throw new Error(`Failed to create share link: ${error.message}`);
    }
  }

  // Get OneDrive usage statistics
  async getUsageStats(userId) {
    try {
      logger.info('Getting OneDrive usage stats', { userId });
      
      const driveInfo = await this.getDriveInfo(userId);
      
      if (!driveInfo.success || !driveInfo.data.quota) {
        throw new Error('Unable to retrieve quota information');
      }
      
      const quota = driveInfo.data.quota;
      const usedPercentage = quota.total > 0 ? (quota.used / quota.total) * 100 : 0;
      
      return {
        success: true,
        data: {
          total: quota.total,
          used: quota.used,
          remaining: quota.remaining,
          usedPercentage: Math.round(usedPercentage * 100) / 100,
          deleted: quota.deleted || 0,
          state: quota.state
        },
        message: 'Usage statistics retrieved'
      };
      
    } catch (error) {
      logger.error('Failed to get OneDrive usage stats', { userId, error: error.message });
      throw new Error(`Failed to get usage statistics: ${error.message}`);
    }
  }
}

export const oneDriveService = new OneDriveService();
export default oneDriveService;