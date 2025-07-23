import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  notifications: Notification[];
  isFullscreen: boolean;
  selectedStepId: string | null;
  canvasZoom: number;
  canvasPosition: { x: number; y: number };
  propertyPanelOpen: boolean;
  executionPanelOpen: boolean;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  timestamp: number;
  duration?: number; // in milliseconds, null for persistent
}

const initialState: UIState = {
  sidebarOpen: true,
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'light',
  notifications: [],
  isFullscreen: false,
  selectedStepId: null,
  canvasZoom: 1,
  canvasPosition: { x: 0, y: 0 },
  propertyPanelOpen: false,
  executionPanelOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', state.theme);
    },
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id' | 'timestamp'>>) => {
      const notification: Notification = {
        ...action.payload,
        id: `notification_${Date.now()}_${Math.random()}`,
        timestamp: Date.now(),
      };
      state.notifications.push(notification);
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    setFullscreen: (state, action: PayloadAction<boolean>) => {
      state.isFullscreen = action.payload;
    },
    toggleFullscreen: (state) => {
      state.isFullscreen = !state.isFullscreen;
    },
    setSelectedStep: (state, action: PayloadAction<string | null>) => {
      state.selectedStepId = action.payload;
      // Open property panel when step is selected
      if (action.payload) {
        state.propertyPanelOpen = true;
      }
    },
    setCanvasZoom: (state, action: PayloadAction<number>) => {
      state.canvasZoom = Math.max(0.1, Math.min(3, action.payload));
    },
    setCanvasPosition: (state, action: PayloadAction<{ x: number; y: number }>) => {
      state.canvasPosition = action.payload;
    },
    resetCanvasView: (state) => {
      state.canvasZoom = 1;
      state.canvasPosition = { x: 0, y: 0 };
    },
    togglePropertyPanel: (state) => {
      state.propertyPanelOpen = !state.propertyPanelOpen;
    },
    setPropertyPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.propertyPanelOpen = action.payload;
    },
    toggleExecutionPanel: (state) => {
      state.executionPanelOpen = !state.executionPanelOpen;
    },
    setExecutionPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.executionPanelOpen = action.payload;
    },
  },
});

export const {
  toggleSidebar,
  setSidebarOpen,
  setTheme,
  toggleTheme,
  addNotification,
  removeNotification,
  clearNotifications,
  setFullscreen,
  toggleFullscreen,
  setSelectedStep,
  setCanvasZoom,
  setCanvasPosition,
  resetCanvasView,
  togglePropertyPanel,
  setPropertyPanelOpen,
  toggleExecutionPanel,
  setExecutionPanelOpen,
} = uiSlice.actions;

export default uiSlice.reducer;