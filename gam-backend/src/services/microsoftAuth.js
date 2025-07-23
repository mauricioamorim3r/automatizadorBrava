import { ConfidentialClientApplication } from '@azure/msal-node';
// Microsoft Graph Client imports with CommonJS fallback
let Client, AuthenticationProvider;
try {
  const graphModule = await import('@microsoft/microsoft-graph-client');
  Client = graphModule.Client;
  AuthenticationProvider = graphModule.AuthenticationProvider;
  
  // Fallback for CommonJS modules
  if (!Client || !AuthenticationProvider) {
    const graphPkg = graphModule.default;
    Client = Client || graphPkg?.Client;
    AuthenticationProvider = AuthenticationProvider || graphPkg?.AuthenticationProvider;
  }
} catch (error) {
  console.warn('Microsoft Graph Client not available, Microsoft integrations will be disabled');
}
import { db } from '../config/database.js';
import { redis } from '../config/database.js';
import { users } from '../models/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../config/logs.js';

// MSAL Configuration
const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
  },
};

// Required permissions for Graph API
const SCOPES = [
  'https://graph.microsoft.com/Files.ReadWrite',
  'https://graph.microsoft.com/Sites.ReadWrite.All',
  'https://graph.microsoft.com/User.Read',
  'offline_access'
];

class MicrosoftAuthService {
  constructor() {
    if (!process.env.AZURE_CLIENT_ID) {
      logger.warn('Azure client ID not configured - Microsoft integrations will be disabled');
      this.msalInstance = null;
      return;
    }

    this.msalInstance = new ConfidentialClientApplication(msalConfig);
  }

  // Get authorization URL for OAuth2 flow
  getAuthorizationUrl(userId, state = null) {
    if (!this.msalInstance) {
      throw new Error('Microsoft authentication not configured');
    }

    const authCodeUrlParameters = {
      scopes: SCOPES,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback',
      state: state || userId,
      prompt: 'select_account',
    };

    return this.msalInstance.getAuthCodeUrl(authCodeUrlParameters);
  }

  // Handle OAuth2 callback and get tokens
  async handleCallback(code, state) {
    if (!this.msalInstance) {
      throw new Error('Microsoft authentication not configured');
    }

    try {
      const tokenRequest = {
        code,
        scopes: SCOPES,
        redirectUri: process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback',
      };

      const response = await this.msalInstance.acquireTokenByCode(tokenRequest);
      
      // Store tokens in Redis with user association
      const userId = state; // Assuming state contains userId
      const tokenData = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        expiresOn: response.expiresOn,
        account: response.account,
        scopes: response.scopes,
      };

      await this.storeUserTokens(userId, tokenData);

      logger.info('Microsoft tokens acquired successfully', { userId, scopes: response.scopes });
      
      return {
        success: true,
        account: response.account,
        scopes: response.scopes,
      };

    } catch (error) {
      logger.error('Microsoft OAuth callback failed', { error: error.message, code: error.errorCode });
      throw new Error(`Microsoft authentication failed: ${error.message}`);
    }
  }

  // Store user tokens in Redis
  async storeUserTokens(userId, tokenData) {
    const key = `microsoft_tokens:${userId}`;
    const expiresIn = Math.floor((tokenData.expiresOn.getTime() - Date.now()) / 1000);
    
    await redis.setEx(key, expiresIn, JSON.stringify(tokenData));
    
    // Also store a flag indicating user has Microsoft integration
    await this.updateUserMicrosoftStatus(userId, true);
  }

  // Get user tokens from Redis
  async getUserTokens(userId) {
    const key = `microsoft_tokens:${userId}`;
    const tokenData = await redis.get(key);
    
    if (!tokenData) {
      return null;
    }

    return JSON.parse(tokenData);
  }

  // Refresh access token
  async refreshAccessToken(userId) {
    if (!this.msalInstance) {
      throw new Error('Microsoft authentication not configured');
    }

    try {
      const storedTokens = await this.getUserTokens(userId);
      if (!storedTokens || !storedTokens.refreshToken) {
        throw new Error('No refresh token available');
      }

      const refreshTokenRequest = {
        refreshToken: storedTokens.refreshToken,
        scopes: SCOPES,
        account: storedTokens.account,
      };

      const response = await this.msalInstance.acquireTokenByRefreshToken(refreshTokenRequest);
      
      // Update stored tokens
      const tokenData = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken || storedTokens.refreshToken, // Keep old refresh token if new one not provided
        expiresOn: response.expiresOn,
        account: response.account,
        scopes: response.scopes,
      };

      await this.storeUserTokens(userId, tokenData);

      logger.info('Microsoft access token refreshed', { userId });
      
      return response.accessToken;

    } catch (error) {
      logger.error('Token refresh failed', { userId, error: error.message });
      
      // If refresh fails, mark user as needing re-authentication
      await this.updateUserMicrosoftStatus(userId, false);
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  // Get valid access token (refresh if needed)
  async getValidAccessToken(userId) {
    const storedTokens = await this.getUserTokens(userId);
    if (!storedTokens) {
      throw new Error('User not authenticated with Microsoft');
    }

    // Check if token is still valid (with 5 minute buffer)
    const now = new Date();
    const expiresOn = new Date(storedTokens.expiresOn);
    const buffer = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (now.getTime() < (expiresOn.getTime() - buffer)) {
      return storedTokens.accessToken;
    }

    // Token is expired or about to expire, refresh it
    return await this.refreshAccessToken(userId);
  }

  // Update user's Microsoft integration status in database
  async updateUserMicrosoftStatus(userId, isConnected) {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (user) {
        const updatedSettings = {
          ...user.settings,
          microsoftIntegration: {
            connected: isConnected,
            connectedAt: isConnected ? new Date().toISOString() : null,
          }
        };

        await db
          .update(users)
          .set({ settings: updatedSettings })
          .where(eq(users.id, userId));
      }
    } catch (error) {
      logger.error('Failed to update user Microsoft status', { userId, error: error.message });
    }
  }

  // Disconnect Microsoft integration
  async disconnectUser(userId) {
    try {
      // Remove tokens from Redis
      const key = `microsoft_tokens:${userId}`;
      await redis.del(key);

      // Update user status
      await this.updateUserMicrosoftStatus(userId, false);

      logger.info('Microsoft integration disconnected', { userId });
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to disconnect Microsoft integration', { userId, error: error.message });
      throw error;
    }
  }

  // Check if user has valid Microsoft integration
  async isUserConnected(userId) {
    const tokens = await this.getUserTokens(userId);
    return !!tokens;
  }

  // Create Graph client for user
  async createGraphClient(userId) {
    if (!this.msalInstance) {
      throw new Error('Microsoft authentication not configured');
    }

    const accessToken = await this.getValidAccessToken(userId);
    
    // Custom authentication provider
    const authProvider = {
      getAccessToken: async () => {
        return accessToken;
      }
    };

    return Client.initWithMiddleware({ authProvider });
  }
}

// Custom authentication provider for Graph client
class TokenAuthenticationProvider {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  async getAccessToken() {
    return this.accessToken;
  }
}

export const microsoftAuth = new MicrosoftAuthService();

// Helper function to get Graph client for user
export const getGraphClientForUser = async (userId) => {
  return await microsoftAuth.createGraphClient(userId);
};

// Helper function to check if Microsoft integration is available
export const isMicrosoftIntegrationAvailable = () => {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
};

export default microsoftAuth;