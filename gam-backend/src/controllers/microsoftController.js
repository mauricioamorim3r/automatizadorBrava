import { microsoftAuth, isMicrosoftIntegrationAvailable } from '../services/microsoftAuth.js';
import { logger } from '../config/logs.js';

// Initiate Microsoft OAuth2 flow
export const initiateOAuth = async (req, res) => {
  try {
    if (!isMicrosoftIntegrationAvailable()) {
      return res.status(503).json({
        error: {
          message: 'Microsoft integration not configured',
          status: 503
        }
      });
    }

    const userId = req.user.id;
    const authUrl = await microsoftAuth.getAuthorizationUrl(userId);

    res.status(200).json({
      success: true,
      data: {
        authorizationUrl: authUrl
      }
    });

  } catch (error) {
    logger.error('Failed to initiate Microsoft OAuth', { userId: req.user?.id, error: error.message });
    res.status(500).json({
      error: {
        message: 'Failed to initiate Microsoft authentication',
        status: 500
      }
    });
  }
};

// Handle OAuth2 callback
export const handleOAuthCallback = async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      logger.error('Microsoft OAuth error', { error, error_description });
      return res.status(400).json({
        error: {
          message: error_description || 'OAuth authentication failed',
          status: 400
        }
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        error: {
          message: 'Missing authorization code or state',
          status: 400
        }
      });
    }

    const result = await microsoftAuth.handleCallback(code, state);

    // Redirect to success page or return JSON based on Accept header
    const acceptsJson = req.headers.accept?.includes('application/json');
    
    if (acceptsJson) {
      res.status(200).json({
        success: true,
        data: result
      });
    } else {
      // Redirect to frontend success page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/settings?microsoft_auth=success`);
    }

  } catch (error) {
    logger.error('Microsoft OAuth callback failed', { error: error.message });
    
    const acceptsJson = req.headers.accept?.includes('application/json');
    
    if (acceptsJson) {
      res.status(500).json({
        error: {
          message: 'Authentication failed',
          status: 500
        }
      });
    } else {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/settings?microsoft_auth=error`);
    }
  }
};

// Get Microsoft connection status
export const getConnectionStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const isConnected = await microsoftAuth.isUserConnected(userId);

    res.status(200).json({
      success: true,
      data: {
        connected: isConnected,
        available: isMicrosoftIntegrationAvailable()
      }
    });

  } catch (error) {
    logger.error('Failed to get Microsoft connection status', { userId: req.user?.id, error: error.message });
    res.status(500).json({
      error: {
        message: 'Failed to get connection status',
        status: 500
      }
    });
  }
};

// Disconnect Microsoft integration
export const disconnect = async (req, res) => {
  try {
    const userId = req.user.id;
    await microsoftAuth.disconnectUser(userId);

    res.status(200).json({
      success: true,
      message: 'Microsoft integration disconnected successfully'
    });

  } catch (error) {
    logger.error('Failed to disconnect Microsoft integration', { userId: req.user?.id, error: error.message });
    res.status(500).json({
      error: {
        message: 'Failed to disconnect Microsoft integration',
        status: 500
      }
    });
  }
};

// Test Microsoft Graph API connection
export const testConnection = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Check if user is connected
    const isConnected = await microsoftAuth.isUserConnected(userId);
    if (!isConnected) {
      return res.status(400).json({
        error: {
          message: 'Microsoft integration not connected',
          status: 400
        }
      });
    }

    // Create Graph client and test with a simple API call
    const graphClient = await microsoftAuth.createGraphClient(userId);
    const userProfile = await graphClient.api('/me').select('displayName,mail,id').get();

    res.status(200).json({
      success: true,
      data: {
        connected: true,
        userProfile: {
          displayName: userProfile.displayName,
          email: userProfile.mail,
          id: userProfile.id
        }
      }
    });

  } catch (error) {
    logger.error('Microsoft connection test failed', { userId: req.user?.id, error: error.message });
    
    // If it's an authentication error, mark as disconnected
    if (error.message.includes('Token refresh failed') || error.message.includes('not authenticated')) {
      await microsoftAuth.disconnectUser(req.user.id).catch(() => {});
    }

    res.status(500).json({
      error: {
        message: 'Connection test failed',
        status: 500,
        details: error.message
      }
    });
  }
};

// Refresh access token manually
export const refreshToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const accessToken = await microsoftAuth.refreshAccessToken(userId);

    res.status(200).json({
      success: true,
      data: {
        tokenRefreshed: true,
        expiresIn: 3600 // Typically 1 hour
      }
    });

  } catch (error) {
    logger.error('Failed to refresh Microsoft token', { userId: req.user?.id, error: error.message });
    res.status(500).json({
      error: {
        message: 'Failed to refresh token',
        status: 500,
        details: error.message
      }
    });
  }
};