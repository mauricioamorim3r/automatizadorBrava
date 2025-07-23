export interface Position {
  x: number;
  y: number;
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePort?: string;
  targetPort?: string;
}

export interface StepConfig {
  [key: string]: unknown;
}

export interface AutomationStep {
  id: string;
  type: string;
  name: string;
  config: StepConfig;
  position: Position;
  connections: Connection[];
}

export interface Schedule {
  type: 'cron' | 'interval' | 'webhook';
  config: {
    cronExpression?: string;
    intervalMs?: number;
    webhookUrl?: string;
  };
  enabled: boolean;
}

export interface Automation {
  id: string;
  name: string;
  description?: string;
  steps: AutomationStep[];
  config: {
    timeout?: number;
    retries?: number;
    [key: string]: unknown;
  };
  status: 'draft' | 'active' | 'paused';
  schedule?: Schedule;
  ownerId: string;
  collaborators: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ExecutionResult {
  success: boolean;
  executionId: string;
  results?: unknown;
  error?: string;
  logs: LogEntry[];
  duration: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  metadata?: {
    [key: string]: unknown;
  };
}

export interface Execution {
  id: string;
  automationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  inputData?: unknown;
  outputData?: unknown;
  logs: LogEntry[];
  errorDetails?: {
    message: string;
    stack?: string;
  };
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  triggeredBy: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// Step type definitions
export type StepType = 
  // Source steps
  | 'source_file_local'
  | 'source_api_rest'
  | 'source_database'
  | 'source_sharepoint'
  | 'source_onedrive'
  | 'source_smb_share'
  | 'source_manual_input'
  
  // Filter steps
  | 'filter_simple'
  | 'filter_complex'
  | 'filter_regex'
  | 'filter_date'
  | 'filter_dedup'
  | 'filter_validation'
  
  // Action steps
  | 'action_transform'
  | 'action_calculate'
  | 'action_format_text'
  | 'action_merge_data'
  | 'action_file_operation'
  | 'action_custom_js'
  
  // Interface automation steps
  | 'interface_navigate'
  | 'interface_click'
  | 'interface_type'
  | 'interface_extract'
  | 'interface_wait'
  
  // Destination steps
  | 'destination_file'
  | 'destination_api'
  | 'destination_database'
  | 'destination_email'
  | 'destination_cloud';

export interface StepTypeDefinition {
  type: StepType;
  category: 'source' | 'filter' | 'action' | 'interface' | 'destination';
  label: string;
  description: string;
  icon: string;
  color: string;
  configSchema: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    label: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    options?: { value: unknown; label: string }[];
  }>;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  settings: {
    [key: string]: unknown;
  };
  createdAt: string;
  lastLogin?: string;
}