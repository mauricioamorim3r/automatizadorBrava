import express from 'express';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes working!' });
});

// Register route
router.post('/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        error: {
          message: 'Name, email and password are required',
          status: 400
        }
      });
    }

    // Mock response
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: '1',
          name,
          email,
          role: 'user'
        },
        token: 'mock-token-123'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: 'Registration failed',
        status: 500
      }
    });
  }
});

// Login route
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: {
          message: 'Email and password are required',
          status: 400
        }
      });
    }

    // Mock login - accept any credentials for testing
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: '1',
          name: 'Test User',
          email,
          role: 'user'
        },
        token: 'mock-token-123'
      }
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: 'Login failed',
        status: 500
      }
    });
  }
});

export default router; 