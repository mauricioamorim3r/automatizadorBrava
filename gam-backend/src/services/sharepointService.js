import { graphApiClient } from './graphApiClient.js';
import { logger } from '../config/logs.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SharePointService {
  constructor() {
    this.graphClient = graphApiClient;
  }

  // List all SharePoint sites accessible to user
  async listSites(userId, search = '') {
    try {
      logger.info('Listing SharePoint sites', { userId, search });
      
      const sites = await this.graphClient.getUserSites(userId, search);
      
      return {
        success: true,
        data: sites.value || [],
        pagination: sites['@odata.nextLink'] ? { nextLink: sites['@odata.nextLink'] } : null
      };
      
    } catch (error) {
      logger.error('Failed to list SharePoint sites', { userId, error: error.message });
      throw new Error(`Failed to list SharePoint sites: ${error.message}`);
    }
  }

  // Get specific SharePoint site details
  async getSite(userId, siteId) {
    try {
      logger.info('Getting SharePoint site', { userId, siteId });
      
      const site = await this.graphClient.getSiteById(userId, siteId);
      
      return {
        success: true,
        data: site
      };
      
    } catch (error) {
      logger.error('Failed to get SharePoint site', { userId, siteId, error: error.message });
      throw new Error(`Failed to get SharePoint site: ${error.message}`);
    }
  }

  // List document libraries in a SharePoint site
  async listDocumentLibraries(userId, siteId) {
    try {
      logger.info('Listing document libraries', { userId, siteId });
      
      const drives = await this.graphClient.getSiteDrives(userId, siteId);
      
      // Filter to only document libraries (not other drive types)
      const documentLibraries = drives.value?.filter(drive => 
        drive.driveType === 'documentLibrary'
      ) || [];
      
      return {
        success: true,
        data: documentLibraries
      };
      
    } catch (error) {
      logger.error('Failed to list document libraries', { userId, siteId, error: error.message });
      throw new Error(`Failed to list document libraries: ${error.message}`);
    }
  }

  // List SharePoint lists in a site
  async listLists(userId, siteId) {
    try {
      logger.info('Listing SharePoint lists', { userId, siteId });
      
      const lists = await this.graphClient.getSiteLists(userId, siteId);
      
      return {
        success: true,
        data: lists.value || []
      };
      
    } catch (error) {
      logger.error('Failed to list SharePoint lists', { userId, siteId, error: error.message });
      throw new Error(`Failed to list SharePoint lists: ${error.message}`);
    }
  }

  // Get items from a SharePoint list
  async getListItems(userId, siteId, listId, options = {}) {
    try {
      const { pageSize = 200, fields = [], filter = '' } = options;
      
      logger.info('Getting SharePoint list items', { userId, siteId, listId, options });
      
      const items = await this.graphClient.getListItems(userId, siteId, listId, pageSize);
      
      // Transform items to flatten fields
      const transformedItems = items.value?.map(item => ({
        id: item.id,
        webUrl: item.webUrl,
        lastModified: item.lastModifiedDateTime,
        created: item.createdDateTime,
        fields: item.fields || {}
      })) || [];
      
      return {
        success: true,
        data: transformedItems,
        pagination: items['@odata.nextLink'] ? { nextLink: items['@odata.nextLink'] } : null
      };
      
    } catch (error) {
      logger.error('Failed to get SharePoint list items', { userId, siteId, listId, error: error.message });
      throw new Error(`Failed to get SharePoint list items: ${error.message}`);
    }
  }

  // List files and folders in a document library
  async listFiles(userId, siteId, driveId, folderPath = 'root', options = {}) {
    try {
      const { pageSize = 200 } = options;
      
      logger.info('Listing SharePoint files', { userId, siteId, driveId, folderPath });
      
      const items = await this.graphClient.getDriveItems(userId, driveId, folderPath, pageSize);
      
      // Transform items to include more useful information
      const transformedItems = items.value?.map(item => ({
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
        data: transformedItems,
        pagination: items['@odata.nextLink'] ? { nextLink: items['@odata.nextLink'] } : null
      };
      
    } catch (error) {
      logger.error('Failed to list SharePoint files', { userId, siteId, driveId, folderPath, error: error.message });
      throw new Error(`Failed to list SharePoint files: ${error.message}`);
    }
  }

  // Download file from SharePoint
  async downloadFile(userId, siteId, driveId, itemId, localPath = null) {
    try {
      logger.info('Downloading SharePoint file', { userId, siteId, driveId, itemId });
      
      // Get file stream from Graph API
      const fileStream = await this.graphClient.downloadFile(userId, driveId, itemId);
      
      if (localPath) {
        // Save to local file
        const dir = path.dirname(localPath);
        await fs.ensureDir(dir);
        
        const writeStream = fs.createWriteStream(localPath);
        fileStream.pipe(writeStream);
        
        return new Promise((resolve, reject) => {
          writeStream.on('finish', () => {
            logger.info('File downloaded successfully', { localPath });
            resolve({
              success: true,
              localPath,
              message: 'File downloaded successfully'
            });
          });
          
          writeStream.on('error', (error) => {
            logger.error('File download failed', { localPath, error: error.message });
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
      logger.error('Failed to download SharePoint file', { userId, siteId, driveId, itemId, error: error.message });
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  // Upload file to SharePoint
  async uploadFile(userId, siteId, driveId, localFilePath, destinationPath, options = {}) {
    try {
      const { conflictBehavior = 'replace', createFolders = true } = options;
      
      logger.info('Uploading file to SharePoint', { 
        userId, siteId, driveId, localFilePath, destinationPath 
      });
      
      // Check if local file exists
      if (!await fs.pathExists(localFilePath)) {
        throw new Error(`Local file not found: ${localFilePath}`);
      }
      
      // Get file stats and create read stream
      const stats = await fs.stat(localFilePath);
      const fileStream = fs.createReadStream(localFilePath);
      const fileName = path.basename(destinationPath);
      const parentPath = path.dirname(destinationPath);
      
      // For large files (>4MB), use upload session
      if (stats.size > 4 * 1024 * 1024) {
        return await this.uploadLargeFile(userId, driveId, parentPath, fileName, localFilePath);
      }
      
      // Small file upload
      const result = await this.graphClient.uploadFile(
        userId, 
        driveId, 
        parentPath, 
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
      logger.error('Failed to upload file to SharePoint', { 
        userId, siteId, driveId, localFilePath, destinationPath, error: error.message 
      });
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  // Upload large file using upload session
  async uploadLargeFile(userId, driveId, parentPath, fileName, localFilePath) {
    try {
      logger.info('Starting large file upload session', { userId, driveId, fileName });
      
      const client = await this.graphClient.createClient(userId);
      const stats = await fs.stat(localFilePath);
      const fileSize = stats.size;
      
      // Create upload session
      const endpoint = driveId === 'default' 
        ? `/me/drive/${parentPath}:/${fileName}:/createUploadSession`
        : `/drives/${driveId}/items/${parentPath}:/${fileName}:/createUploadSession`;
        
      const uploadSession = await client.api(endpoint).post({
        item: {
          '@microsoft.graph.conflictBehavior': 'replace',
          name: fileName
        }
      });
      
      const uploadUrl = uploadSession.uploadUrl;
      const chunkSize = 320 * 1024; // 320KB chunks
      const fileStream = fs.createReadStream(localFilePath);
      
      let uploadedBytes = 0;
      const chunks = [];
      
      // Read file in chunks
      return new Promise((resolve, reject) => {
        fileStream.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        fileStream.on('end', async () => {
          try {
            // Upload chunks sequentially
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              const start = i * chunkSize;
              const end = Math.min(start + chunk.length - 1, fileSize - 1);
              
              const response = await client.api(uploadUrl).put(chunk, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunk.length.toString()
              });
              
              uploadedBytes += chunk.length;
              logger.debug('Uploaded chunk', { 
                chunkIndex: i, 
                uploadedBytes, 
                totalBytes: fileSize,
                progress: `${Math.round((uploadedBytes / fileSize) * 100)}%`
              });
              
              // If this is the last chunk, return the result
              if (end === fileSize - 1) {
                resolve({
                  success: true,
                  data: response,
                  message: 'Large file uploaded successfully'
                });
                return;
              }
            }
          } catch (error) {
            reject(error);
          }
        });
        
        fileStream.on('error', reject);
      });
      
    } catch (error) {
      logger.error('Large file upload failed', { userId, driveId, fileName, error: error.message });
      throw new Error(`Large file upload failed: ${error.message}`);
    }
  }

  // Create folder in SharePoint
  async createFolder(userId, siteId, driveId, parentPath, folderName) {
    try {
      logger.info('Creating SharePoint folder', { userId, siteId, driveId, parentPath, folderName });
      
      const client = await this.graphClient.createClient(userId);
      
      const endpoint = driveId === 'default' 
        ? `/me/drive/${parentPath}/children`
        : `/drives/${driveId}/items/${parentPath}/children`;
        
      const folder = await client.api(endpoint).post({
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
      logger.error('Failed to create SharePoint folder', { 
        userId, siteId, driveId, parentPath, folderName, error: error.message 
      });
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  }

  // Delete item from SharePoint
  async deleteItem(userId, siteId, driveId, itemId) {
    try {
      logger.info('Deleting SharePoint item', { userId, siteId, driveId, itemId });
      
      const client = await this.graphClient.createClient(userId);
      
      const endpoint = driveId === 'default' 
        ? `/me/drive/items/${itemId}`
        : `/drives/${driveId}/items/${itemId}`;
        
      await client.api(endpoint).delete();
      
      // Clear cache
      await this.graphClient.deleteFromCache(`drive_items:${userId}:${driveId}:root`);
      
      return {
        success: true,
        message: 'Item deleted successfully'
      };
      
    } catch (error) {
      logger.error('Failed to delete SharePoint item', { userId, siteId, driveId, itemId, error: error.message });
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  }

  // Search files in SharePoint
  async searchFiles(userId, siteId, query, options = {}) {
    try {
      const { pageSize = 200, fileTypes = [] } = options;
      
      logger.info('Searching SharePoint files', { userId, siteId, query, options });
      
      const client = await this.graphClient.createClient(userId);
      
      let searchQuery = query;
      if (fileTypes.length > 0) {
        const typeFilter = fileTypes.map(type => `filetype:${type}`).join(' OR ');
        searchQuery += ` AND (${typeFilter})`;
      }
      
      const searchResults = await client
        .api(`/sites/${siteId}/drive/search(q='${encodeURIComponent(searchQuery)}')`)
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
      logger.error('SharePoint file search failed', { userId, siteId, query, error: error.message });
      throw new Error(`File search failed: ${error.message}`);
    }
  }

  // Get file metadata
  async getFileMetadata(userId, siteId, driveId, itemId) {
    try {
      logger.info('Getting file metadata', { userId, siteId, driveId, itemId });
      
      const client = await this.graphClient.createClient(userId);
      
      const endpoint = driveId === 'default' 
        ? `/me/drive/items/${itemId}`
        : `/drives/${driveId}/items/${itemId}`;
        
      const item = await client
        .api(endpoint)
        .select('id,name,size,lastModifiedDateTime,createdDateTime,file,folder,webUrl,parentReference')
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
          parentPath: item.parentReference?.path,
          mimeType: item.file?.mimeType,
          extension: item.file ? path.extname(item.name) : null,
          downloadUrl: item['@microsoft.graph.downloadUrl']
        }
      };
      
    } catch (error) {
      logger.error('Failed to get file metadata', { userId, siteId, driveId, itemId, error: error.message });
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }
}

export const sharepointService = new SharePointService();
export default sharepointService;