import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { automationApi } from '../../services/api';
import type { Automation, ExecutionResult, Execution, ValidationResult } from '../../types/automation';

interface AutomationState {
  automations: Automation[];
  currentAutomation: Automation | null;
  executions: Execution[];
  isLoading: boolean;
  isSaving: boolean;
  isExecuting: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  filters: {
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  };
  lastExecutionResult: ExecutionResult | null;
  validationResult: ValidationResult | null;
}

const initialState: AutomationState = {
  automations: [],
  currentAutomation: null,
  executions: [],
  isLoading: false,
  isSaving: false,
  isExecuting: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
  filters: {},
  lastExecutionResult: null,
  validationResult: null,
};

// Async thunks
export const fetchAutomations = createAsyncThunk(
  'automation/fetchAutomations',
  async (params: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}, { rejectWithValue }) => {
    try {
      const response = await automationApi.getAutomations(params);
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to fetch automations');
    }
  }
);

export const fetchAutomation = createAsyncThunk(
  'automation/fetchAutomation',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await automationApi.getAutomation(id);
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to fetch automation');
    }
  }
);

export const createAutomation = createAsyncThunk(
  'automation/createAutomation',
  async (automation: Omit<Automation, 'id' | 'createdAt' | 'updatedAt' | 'ownerId' | 'version'>, { rejectWithValue }) => {
    try {
      const response = await automationApi.createAutomation(automation);
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to create automation');
    }
  }
);

export const updateAutomation = createAsyncThunk(
  'automation/updateAutomation',
  async ({ id, data }: { id: string; data: Partial<Automation> }, { rejectWithValue }) => {
    try {
      const response = await automationApi.updateAutomation(id, data);
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to update automation');
    }
  }
);

export const deleteAutomation = createAsyncThunk(
  'automation/deleteAutomation',
  async (id: string, { rejectWithValue }) => {
    try {
      await automationApi.deleteAutomation(id);
      return id;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to delete automation');
    }
  }
);

export const duplicateAutomation = createAsyncThunk(
  'automation/duplicateAutomation',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await automationApi.duplicateAutomation(id);
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to duplicate automation');
    }
  }
);

export const executeAutomation = createAsyncThunk(
  'automation/executeAutomation',
  async ({ id, inputData }: { id: string; inputData?: unknown }, { rejectWithValue }) => {
    try {
      const response = await automationApi.executeAutomation(id, inputData);
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to execute automation');
    }
  }
);

export const validateAutomation = createAsyncThunk(
  'automation/validateAutomation',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await automationApi.validateAutomation(id);
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to validate automation');
    }
  }
);

export const fetchExecutionHistory = createAsyncThunk(
  'automation/fetchExecutionHistory',
  async ({ id, page = 1, limit = 20 }: { id: string; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await automationApi.getExecutionHistory(id, { page, limit });
      return response;
    } catch (error: unknown) {
      return rejectWithValue((error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to fetch execution history');
    }
  }
);

const automationSlice = createSlice({
  name: 'automation',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setFilters: (state, action: PayloadAction<AutomationState['filters']>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearFilters: (state) => {
      state.filters = {};
    },
    setCurrentAutomation: (state, action: PayloadAction<Automation | null>) => {
      state.currentAutomation = action.payload;
    },
    updateCurrentAutomationSteps: (state, action: PayloadAction<unknown[]>) => {
      if (state.currentAutomation) {
        state.currentAutomation.steps = action.payload as typeof state.currentAutomation.steps;
      }
    },
    clearExecutionResult: (state) => {
      state.lastExecutionResult = null;
    },
    clearValidationResult: (state) => {
      state.validationResult = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch automations
    builder
      .addCase(fetchAutomations.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAutomations.fulfilled, (state, action) => {
        state.isLoading = false;
        state.automations = action.payload.data;
        state.pagination = action.payload.pagination as {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
        state.error = null;
      })
      .addCase(fetchAutomations.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Fetch automation
    builder
      .addCase(fetchAutomation.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAutomation.fulfilled, (state, action) => {
        state.isLoading = false;
        state.currentAutomation = action.payload;
        state.error = null;
      })
      .addCase(fetchAutomation.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Create automation
    builder
      .addCase(createAutomation.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(createAutomation.fulfilled, (state, action) => {
        state.isSaving = false;
        state.automations.unshift(action.payload);
        state.currentAutomation = action.payload;
        state.error = null;
      })
      .addCase(createAutomation.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload as string;
      });

    // Update automation
    builder
      .addCase(updateAutomation.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(updateAutomation.fulfilled, (state, action) => {
        state.isSaving = false;
        const index = state.automations.findIndex(a => a.id === action.payload.id);
        if (index !== -1) {
          state.automations[index] = action.payload;
        }
        if (state.currentAutomation?.id === action.payload.id) {
          state.currentAutomation = action.payload;
        }
        state.error = null;
      })
      .addCase(updateAutomation.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload as string;
      });

    // Delete automation
    builder
      .addCase(deleteAutomation.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deleteAutomation.fulfilled, (state, action) => {
        state.isLoading = false;
        state.automations = state.automations.filter(a => a.id !== action.payload);
        if (state.currentAutomation?.id === action.payload) {
          state.currentAutomation = null;
        }
        state.error = null;
      })
      .addCase(deleteAutomation.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Duplicate automation
    builder
      .addCase(duplicateAutomation.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(duplicateAutomation.fulfilled, (state, action) => {
        state.isLoading = false;
        state.automations.unshift(action.payload);
        state.error = null;
      })
      .addCase(duplicateAutomation.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Execute automation
    builder
      .addCase(executeAutomation.pending, (state) => {
        state.isExecuting = true;
        state.error = null;
        state.lastExecutionResult = null;
      })
      .addCase(executeAutomation.fulfilled, (state, action) => {
        state.isExecuting = false;
        state.lastExecutionResult = action.payload;
        state.error = null;
      })
      .addCase(executeAutomation.rejected, (state, action) => {
        state.isExecuting = false;
        state.error = action.payload as string;
      });

    // Validate automation
    builder
      .addCase(validateAutomation.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(validateAutomation.fulfilled, (state, action) => {
        state.isLoading = false;
        state.validationResult = action.payload;
        state.error = null;
      })
      .addCase(validateAutomation.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Fetch execution history
    builder
      .addCase(fetchExecutionHistory.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchExecutionHistory.fulfilled, (state, action) => {
        state.isLoading = false;
        state.executions = action.payload.data;
        state.error = null;
      })
      .addCase(fetchExecutionHistory.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  clearError,
  setFilters,
  clearFilters,
  setCurrentAutomation,
  updateCurrentAutomationSteps,
  clearExecutionResult,
  clearValidationResult,
} = automationSlice.actions;

export default automationSlice.reducer;