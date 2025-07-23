import { generateToken } from '../middleware/auth.js';

// Mock user data
const mockUsers = [
  {
    id: '1',
    email: 'admin@gam.com',
    name: 'Admin User',
    password: 'password',
    role: 'admin'
  }
];

// Register new user (mock)
export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = mockUsers.find(user => user.email === email);
    if (existingUser) {
      return res.status(400).json({
        error: {
          message: 'User with this email already exists',
          status: 400
        }
      });
    }

    // Create mock user
    const newUser = {
      id: (mockUsers.length + 1).toString(),
      email,
      name,
      password,
      role: 'user'
    };

    mockUsers.push(newUser);

    // Generate token
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role
        },
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: {
        message: 'Registration failed',
        status: 500
      }
    });
  }
};

// Login user (mock)
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = mockUsers.find(u => u.email === email && u.password === password);
    
    if (!user) {
      return res.status(401).json({
        error: {
          message: 'Invalid email or password',
          status: 401
        }
      });
    }

    // Generate token
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: {
        message: 'Login failed',
        status: 500
      }
    });
  }
};

// Get profile (mock)
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = mockUsers.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          status: 404
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to get profile',
        status: 500
      }
    });
  }
};

// Update profile (mock)
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email } = req.body;
    
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({
        error: {
          message: 'User not found',
          status: 404
        }
      });
    }

    // Update user
    mockUsers[userIndex] = {
      ...mockUsers[userIndex],
      name: name || mockUsers[userIndex].name,
      email: email || mockUsers[userIndex].email
    };

    res.status(200).json({
      success: true,
      data: {
        id: mockUsers[userIndex].id,
        email: mockUsers[userIndex].email,
        name: mockUsers[userIndex].name,
        role: mockUsers[userIndex].role
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: {
        message: 'Failed to update profile',
        status: 500
      }
    });
  }
}; 