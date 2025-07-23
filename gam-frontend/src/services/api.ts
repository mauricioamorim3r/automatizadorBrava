import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { Automation, ExecutionResult, Execution, ValidationResult, User } from '../types/automation';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_data');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API response wrapper
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    status: number;
    details?: unknown;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Auth API
export const authApi = {
  login: async (email: string, password: string): Promise<{ user: User; token: string }> => {
    const response: AxiosResponse<ApiResponse<{ user: User; token: string }>> = await api.post('/auth/login', {
      email,
      password,
    });
    return response.data.data;
  },

  register: async (email: string, password: string, name: string): Promise<{ user: User; token: string }> => {
    const response: AxiosResponse<ApiResponse<{ user: User; token: string }>> = await api.post('/auth/register', {
      email,
      password,
      name,
    });
    return response.data.data;
  },

  getProfile: async (): Promise<User> => {
    const response: AxiosResponse<ApiResponse<User>> = await api.get('/auth/profile');
    return response.data.data;
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response: AxiosResponse<ApiResponse<User>> = await api.put('/auth/profile', data);
    return response.data.data;
  },

  verifyToken: async (): Promise<{ user: User; valid: boolean }> => {
    const response: AxiosResponse<ApiResponse<{ user: User; valid: boolean }>> = await api.get('/auth/verify');
    return response.data.data;
  },
};

// Automation API
export const automationApi = {
  getAutomations: async (params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ data: Automation[]; pagination: unknown }> => {
    const response: AxiosResponse<ApiResponse<Automation[]>> = await api.get('/automations', { params });
    return {
      data: response.data.data,
      pagination: response.data.pagination,
    };
  },

  getAutomation: async (id: string): Promise<Automation> => {
    const response: AxiosResponse<ApiResponse<Automation>> = await api.get(`/automations/${id}`);
    return response.data.data;
  },

  createAutomation: async (automation: Omit<Automation, 'id' | 'createdAt' | 'updatedAt' | 'ownerId' | 'version'>): Promise<Automation> => {
    const response: AxiosResponse<ApiResponse<Automation>> = await api.post('/automations', automation);
    return response.data.data;
  },

  updateAutomation: async (id: string, automation: Partial<Automation>): Promise<Automation> => {
    const response: AxiosResponse<ApiResponse<Automation>> = await api.put(`/automations/${id}`, automation);
    return response.data.data;
  },

  deleteAutomation: async (id: string): Promise<void> => {
    await api.delete(`/automations/${id}`);
  },

  duplicateAutomation: async (id: string): Promise<Automation> => {
    const response: AxiosResponse<ApiResponse<Automation>> = await api.post(`/automations/${id}/duplicate`);
    return response.data.data;
  },

  executeAutomation: async (id: string, inputData?: unknown): Promise<ExecutionResult> => {
    const response: AxiosResponse<ApiResponse<ExecutionResult>> = await api.post(`/automations/${id}/execute`, {
      inputData,
    });
    return response.data.data;
  },

  validateAutomation: async (id: string): Promise<ValidationResult> => {
    const response: AxiosResponse<ApiResponse<ValidationResult>> = await api.get(`/automations/${id}/validate`);
    return response.data.data;
  },

  getExecutionHistory: async (id: string, params?: {
    page?: number;
    limit?: number;
  }): Promise<{ data: Execution[]; pagination: unknown }> => {
    const response: AxiosResponse<ApiResponse<Execution[]>> = await api.get(`/automations/${id}/executions`, { params });
    return {
      data: response.data.data,
      pagination: response.data.pagination,
    };
  },
};

// Health check
export const healthApi = {
  check: async (): Promise<{ status: string; timestamp: string; service: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};

// Export configured axios instance for custom requests
export { api };
export default api;