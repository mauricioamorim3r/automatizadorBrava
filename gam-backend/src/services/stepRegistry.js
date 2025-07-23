import { logger } from '../config/logs.js';

// Comprehensive step type registry with metadata
export const STEP_REGISTRY = {
  // SOURCE STEPS - Data Input
  SOURCE_MANUAL_INPUT: {
    type: 'source_manual_input',
    category: 'source',
    label: 'Manual Input',
    description: 'Collect data through manual input or form fields',
    icon: '📝',
    color: '#4CAF50',
    configSchema: {
      defaultValue: {
        type: 'string',
        label: 'Default Value',
        description: 'Default value if no input provided',
        required: false
      },
      prompt: {
        type: 'string',
        label: 'Prompt Text',
        description: 'Text to display to user',
        required: true
      },
      dataType: {
        type: 'select',
        label: 'Data Type',
        description: 'Type of data expected',
        required: false,
        default: 'string',
        options: [
          { value: 'string', label: 'Text' },
          { value: 'number', label: 'Number' },
          { value: 'boolean', label: 'Boolean' },
          { value: 'date', label: 'Date' }
        ]
      }
    }
  },

  SOURCE_FILE_LOCAL: {
    type: 'source_file_local',
    category: 'source',
    label: 'Local File',
    description: 'Read data from local files (CSV, JSON, Excel)',
    icon: '📁',
    color: '#4CAF50',
    configSchema: {
      filePath: {
        type: 'string',
        label: 'File Path',
        description: 'Path to the local file',
        required: true
      },
      fileType: {
        type: 'select',
        label: 'File Type',
        description: 'Type of file to read',
        required: true,
        options: [
          { value: 'csv', label: 'CSV' },
          { value: 'json', label: 'JSON' },
          { value: 'excel', label: 'Excel (.xlsx)' },
          { value: 'text', label: 'Text File' }
        ]
      },
      encoding: {
        type: 'select',
        label: 'File Encoding',
        description: 'Character encoding of the file',
        required: false,
        default: 'utf8',
        options: [
          { value: 'utf8', label: 'UTF-8' },
          { value: 'latin1', label: 'Latin-1' },
          { value: 'ascii', label: 'ASCII' }
        ]
      }
    }
  },

  SOURCE_SHAREPOINT: {
    type: 'source_sharepoint',
    category: 'source',
    label: 'SharePoint',
    description: 'Connect to SharePoint sites and document libraries',
    icon: '📊',
    color: '#0078D4',
    configSchema: {
      operation: {
        type: 'select',
        label: 'Operation',
        description: 'Type of SharePoint operation',
        required: true,
        options: [
          { value: 'list_files', label: 'List Files' },
          { value: 'list_sites', label: 'List Sites' },
          { value: 'list_document_libraries', label: 'List Document Libraries' },
          { value: 'get_list_items', label: 'Get List Items' },
          { value: 'search_files', label: 'Search Files' }
        ]
      },
      siteId: {
        type: 'string',
        label: 'Site ID',
        description: 'SharePoint site identifier',
        required: true,
        conditional: { field: 'operation', values: ['list_files', 'list_document_libraries', 'get_list_items', 'search_files'] }
      },
      driveId: {
        type: 'string',
        label: 'Drive ID',
        description: 'Document library drive ID',
        required: false,
        conditional: { field: 'operation', values: ['list_files'] }
      },
      folderPath: {
        type: 'string',
        label: 'Folder Path',
        description: 'Path within the document library',
        required: false,
        default: 'root'
      }
    }
  },

  SOURCE_ONEDRIVE: {
    type: 'source_onedrive',
    category: 'source',
    label: 'OneDrive',
    description: 'Access files and folders from OneDrive',
    icon: '☁️',
    color: '#0078D4',
    configSchema: {
      operation: {
        type: 'select',
        label: 'Operation',
        description: 'Type of OneDrive operation',
        required: true,
        options: [
          { value: 'list_files', label: 'List Files' },
          { value: 'get_drive_info', label: 'Get Drive Info' },
          { value: 'search_files', label: 'Search Files' },
          { value: 'get_usage_stats', label: 'Get Usage Stats' }
        ]
      },
      folderPath: {
        type: 'string',
        label: 'Folder Path',
        description: 'Path to folder in OneDrive',
        required: false,
        default: 'root'
      },
      sortBy: {
        type: 'select',
        label: 'Sort By',
        description: 'Sort files by field',
        required: false,
        options: [
          { value: 'name', label: 'Name' },
          { value: 'lastModified', label: 'Last Modified' },
          { value: 'size', label: 'Size' },
          { value: 'created', label: 'Created Date' }
        ]
      }
    }
  },

  SOURCE_SMB_SHARE: {
    type: 'source_smb_share',
    category: 'source',
    label: 'Network Share (SMB)',
    description: 'Connect to SMB/CIFS network shares',
    icon: '🗂️',
    color: '#FF9800',
    configSchema: {
      server: {
        type: 'string',
        label: 'Server Address',
        description: 'IP address or hostname of SMB server',
        required: true
      },
      share: {
        type: 'string',
        label: 'Share Name',
        description: 'Name of the network share',
        required: true
      },
      username: {
        type: 'string',
        label: 'Username',
        description: 'Username for authentication',
        required: true
      },
      password: {
        type: 'password',
        label: 'Password',
        description: 'Password for authentication',
        required: true,
        sensitive: true
      },
      domain: {
        type: 'string',
        label: 'Domain',
        description: 'Windows domain (optional)',
        required: false,
        default: 'WORKGROUP'
      },
      remotePath: {
        type: 'string',
        label: 'Remote Path',
        description: 'Path within the share',
        required: false,
        default: ''
      }
    }
  },

  // FILTER STEPS - Data Processing
  FILTER_SIMPLE: {
    type: 'filter_simple',
    category: 'filter',
    label: 'Simple Filter',
    description: 'Filter data using simple conditions',
    icon: '🔍',
    color: '#2196F3',
    configSchema: {
      field: {
        type: 'string',
        label: 'Field Name',
        description: 'Name of field to filter on',
        required: true
      },
      operator: {
        type: 'select',
        label: 'Operator',
        description: 'Comparison operator',
        required: true,
        options: [
          { value: 'equals', label: 'Equals' },
          { value: 'not_equals', label: 'Not Equals' },
          { value: 'contains', label: 'Contains' },
          { value: 'greater_than', label: 'Greater Than' },
          { value: 'less_than', label: 'Less Than' },
          { value: 'greater_equal', label: 'Greater or Equal' },
          { value: 'less_equal', label: 'Less or Equal' }
        ]
      },
      value: {
        type: 'string',
        label: 'Comparison Value',
        description: 'Value to compare against',
        required: true
      },
      caseSensitive: {
        type: 'boolean',
        label: 'Case Sensitive',
        description: 'Whether comparison is case sensitive',
        required: false,
        default: false
      }
    }
  },

  // ACTION STEPS - Data Transformation
  ACTION_TRANSFORM: {
    type: 'action_transform',
    category: 'action',
    label: 'Transform Data',
    description: 'Transform and reshape data structures',
    icon: '⚙️',
    color: '#FF9800',
    configSchema: {
      transformType: {
        type: 'select',
        label: 'Transform Type',
        description: 'Type of transformation to apply',
        required: true,
        options: [
          { value: 'map', label: 'Map Fields' },
          { value: 'flatten', label: 'Flatten Array' },
          { value: 'group', label: 'Group By Field' },
          { value: 'sort', label: 'Sort Data' }
        ]
      },
      mapping: {
        type: 'object',
        label: 'Field Mapping',
        description: 'Map old field names to new ones',
        required: false,
        conditional: { field: 'transformType', values: ['map'] }
      },
      groupBy: {
        type: 'string',
        label: 'Group By Field',
        description: 'Field to group data by',
        required: false,
        conditional: { field: 'transformType', values: ['group'] }
      },
      sortBy: {
        type: 'string',
        label: 'Sort By Field',
        description: 'Field to sort data by',
        required: false,
        conditional: { field: 'transformType', values: ['sort'] }
      },
      order: {
        type: 'select',
        label: 'Sort Order',
        description: 'Ascending or descending order',
        required: false,
        default: 'asc',
        conditional: { field: 'transformType', values: ['sort'] },
        options: [
          { value: 'asc', label: 'Ascending' },
          { value: 'desc', label: 'Descending' }
        ]
      }
    }
  },

  ACTION_FILE_OPERATION: {
    type: 'action_file_operation',
    category: 'action',
    label: 'File Operations',
    description: 'Copy, move, upload, download files',
    icon: '📋',
    color: '#FF9800',
    configSchema: {
      operation: {
        type: 'select',
        label: 'File Operation',
        description: 'Type of file operation to perform',
        required: true,
        options: [
          { value: 'download', label: 'Download Files' },
          { value: 'upload', label: 'Upload Files' },
          { value: 'copy', label: 'Copy Files' },
          { value: 'move', label: 'Move Files' },
          { value: 'delete', label: 'Delete Files' }
        ]
      },
      sourceType: {
        type: 'select',
        label: 'Source Type',
        description: 'Where files are coming from',
        required: true,
        conditional: { field: 'operation', values: ['download', 'copy', 'move', 'delete'] },
        options: [
          { value: 'sharepoint', label: 'SharePoint' },
          { value: 'onedrive', label: 'OneDrive' },
          { value: 'smb', label: 'Network Share' },
          { value: 'local', label: 'Local Files' }
        ]
      },
      destinationType: {
        type: 'select',
        label: 'Destination Type',
        description: 'Where files are going to',
        required: true,
        conditional: { field: 'operation', values: ['upload', 'copy', 'move'] },
        options: [
          { value: 'sharepoint', label: 'SharePoint' },
          { value: 'onedrive', label: 'OneDrive' },
          { value: 'smb', label: 'Network Share' },
          { value: 'local', label: 'Local Files' }
        ]
      },
      destinationPath: {
        type: 'string',
        label: 'Destination Path',
        description: 'Path where files will be saved',
        required: false
      }
    }
  },

  // INTERFACE AUTOMATION STEPS - Browser Actions
  INTERFACE_NAVIGATE: {
    type: 'interface_navigate',
    category: 'interface',
    label: 'Navigate to URL',
    description: 'Navigate browser to a specific URL',
    icon: '🌐',
    color: '#9C27B0',
    configSchema: {
      url: {
        type: 'string',
        label: 'URL',
        description: 'Web address to navigate to',
        required: true
      },
      waitUntil: {
        type: 'select',
        label: 'Wait Until',
        description: 'Wait condition after navigation',
        required: false,
        default: 'networkidle2',
        options: [
          { value: 'load', label: 'Page Load Event' },
          { value: 'domcontentloaded', label: 'DOM Content Loaded' },
          { value: 'networkidle0', label: 'No Network Activity' },
          { value: 'networkidle2', label: 'Minimal Network Activity' }
        ]
      },
      waitTime: {
        type: 'number',
        label: 'Additional Wait (ms)',
        description: 'Extra time to wait after page loads',
        required: false,
        default: 0
      }
    }
  },

  INTERFACE_CLICK: {
    type: 'interface_click',
    category: 'interface',
    label: 'Click Element',
    description: 'Click on a page element',
    icon: '👆',
    color: '#9C27B0',
    configSchema: {
      selector: {
        type: 'string',
        label: 'CSS Selector',
        description: 'CSS selector to identify the element',
        required: true
      },
      method: {
        type: 'select',
        label: 'Click Method',
        description: 'How to perform the click',
        required: false,
        default: 'default',
        options: [
          { value: 'default', label: 'Normal Click' },
          { value: 'js', label: 'JavaScript Click' }
        ]
      },
      waitAfter: {
        type: 'number',
        label: 'Wait After (ms)',
        description: 'Time to wait after clicking',
        required: false,
        default: 0
      },
      scroll: {
        type: 'boolean',
        label: 'Scroll to Element',
        description: 'Scroll element into view before clicking',
        required: false,
        default: true
      }
    }
  },

  INTERFACE_TYPE: {
    type: 'interface_type',
    category: 'interface',
    label: 'Type Text',
    description: 'Type text into an input field',
    icon: '⌨️',
    color: '#9C27B0',
    configSchema: {
      selector: {
        type: 'string',
        label: 'CSS Selector',
        description: 'CSS selector for the input field',
        required: true
      },
      text: {
        type: 'string',
        label: 'Text to Type',
        description: 'Text content to enter',
        required: false
      },
      useInputData: {
        type: 'boolean',
        label: 'Use Input Data',
        description: 'Use data from previous step as text',
        required: false,
        default: false
      },
      clear: {
        type: 'boolean',
        label: 'Clear Existing Text',
        description: 'Clear field before typing',
        required: false,
        default: true
      },
      pressEnter: {
        type: 'boolean',
        label: 'Press Enter',
        description: 'Press Enter key after typing',
        required: false,
        default: false
      },
      delay: {
        type: 'number',
        label: 'Typing Delay (ms)',
        description: 'Delay between keystrokes',
        required: false,
        default: 50
      }
    }
  },

  INTERFACE_EXTRACT: {
    type: 'interface_extract',
    category: 'interface',
    label: 'Extract Data',
    description: 'Extract text or data from page elements',
    icon: '📤',
    color: '#9C27B0',
    configSchema: {
      selector: {
        type: 'string',
        label: 'CSS Selector',
        description: 'CSS selector for elements to extract from',
        required: true
      },
      extractType: {
        type: 'select',
        label: 'Extract Type',
        description: 'Type of data to extract',
        required: false,
        default: 'text',
        options: [
          { value: 'text', label: 'Text Content' },
          { value: 'html', label: 'HTML Content' },
          { value: 'attribute', label: 'Element Attribute' }
        ]
      },
      attribute: {
        type: 'string',
        label: 'Attribute Name',
        description: 'Name of attribute to extract',
        required: false,
        conditional: { field: 'extractType', values: ['attribute'] }
      },
      multiple: {
        type: 'boolean',
        label: 'Multiple Elements',
        description: 'Extract from all matching elements',
        required: false,
        default: false
      }
    }
  },

  INTERFACE_WAIT: {
    type: 'interface_wait',
    category: 'interface',
    label: 'Wait for Condition',
    description: 'Wait for elements or conditions',
    icon: '⏳',
    color: '#9C27B0',
    configSchema: {
      waitType: {
        type: 'select',
        label: 'Wait Type',
        description: 'What to wait for',
        required: true,
        options: [
          { value: 'selector', label: 'Element Selector' },
          { value: 'timeout', label: 'Fixed Timeout' },
          { value: 'function', label: 'JavaScript Function' }
        ]
      },
      condition: {
        type: 'string',
        label: 'Condition',
        description: 'CSS selector, timeout (ms), or JavaScript function',
        required: true
      },
      visible: {
        type: 'boolean',
        label: 'Element Must Be Visible',
        description: 'Wait for element to be visible',
        required: false,
        default: true,
        conditional: { field: 'waitType', values: ['selector'] }
      },
      timeout: {
        type: 'number',
        label: 'Timeout (ms)',
        description: 'Maximum time to wait',
        required: false,
        default: 30000
      }
    }
  },

  INTERFACE_SCREENSHOT: {
    type: 'interface_screenshot',
    category: 'interface',
    label: 'Take Screenshot',
    description: 'Capture screenshot of current page',
    icon: '📸',
    color: '#9C27B0',
    configSchema: {
      filename: {
        type: 'string',
        label: 'Filename',
        description: 'Name for screenshot file (optional)',
        required: false
      },
      fullPage: {
        type: 'boolean',
        label: 'Full Page',
        description: 'Capture entire page or just viewport',
        required: false,
        default: false
      },
      quality: {
        type: 'number',
        label: 'Quality (1-100)',
        description: 'JPEG quality (for JPEG type only)',
        required: false,
        default: 90,
        min: 1,
        max: 100
      },
      type: {
        type: 'select',
        label: 'Image Type',
        description: 'Format of screenshot image',
        required: false,
        default: 'png',
        options: [
          { value: 'png', label: 'PNG' },
          { value: 'jpeg', label: 'JPEG' }
        ]
      }
    }
  },

  // DESTINATION STEPS - Data Output
  DESTINATION_FILE: {
    type: 'destination_file',
    category: 'destination',
    label: 'Save to File',
    description: 'Save data to local files',
    icon: '💾',
    color: '#607D8B',
    configSchema: {
      filePath: {
        type: 'string',
        label: 'File Path',
        description: 'Path where file will be saved',
        required: true
      },
      fileType: {
        type: 'select',
        label: 'File Type',
        description: 'Format to save data in',
        required: true,
        options: [
          { value: 'json', label: 'JSON' },
          { value: 'csv', label: 'CSV' },
          { value: 'excel', label: 'Excel (.xlsx)' },
          { value: 'text', label: 'Plain Text' }
        ]
      },
      overwrite: {
        type: 'boolean',
        label: 'Overwrite Existing',
        description: 'Overwrite file if it exists',
        required: false,
        default: true
      }
    }
  }
};

// Get step definition by type
export const getStepDefinition = (stepType) => {
  const definition = STEP_REGISTRY[stepType.toUpperCase()];
  if (!definition) {
    logger.warn('Unknown step type requested', { stepType });
    return null;
  }
  return definition;
};

// Get all step types by category
export const getStepsByCategory = (category) => {
  return Object.values(STEP_REGISTRY).filter(step => step.category === category);
};

// Get all available step types
export const getAllStepTypes = () => {
  return Object.values(STEP_REGISTRY);
};

// Validate step configuration against schema
export const validateStepConfig = (stepType, config) => {
  const definition = getStepDefinition(stepType);
  if (!definition) {
    return { valid: false, errors: ['Unknown step type'] };
  }

  const errors = [];
  const schema = definition.configSchema;

  // Check required fields
  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    if (fieldSchema.required && (config[fieldName] === undefined || config[fieldName] === '')) {
      errors.push(`${fieldSchema.label} is required`);
    }

    // Check conditional fields
    if (fieldSchema.conditional && config[fieldSchema.conditional.field]) {
      const conditionValue = config[fieldSchema.conditional.field];
      if (fieldSchema.conditional.values.includes(conditionValue) && 
          fieldSchema.required && 
          (config[fieldName] === undefined || config[fieldName] === '')) {
        errors.push(`${fieldSchema.label} is required when ${fieldSchema.conditional.field} is ${conditionValue}`);
      }
    }

    // Type validation
    if (config[fieldName] !== undefined) {
      const value = config[fieldName];
      
      switch (fieldSchema.type) {
        case 'number':
          if (isNaN(Number(value))) {
            errors.push(`${fieldSchema.label} must be a number`);
          } else {
            const numValue = Number(value);
            if (fieldSchema.min !== undefined && numValue < fieldSchema.min) {
              errors.push(`${fieldSchema.label} must be at least ${fieldSchema.min}`);
            }
            if (fieldSchema.max !== undefined && numValue > fieldSchema.max) {
              errors.push(`${fieldSchema.label} must be no more than ${fieldSchema.max}`);
            }
          }
          break;
        
        case 'boolean':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            errors.push(`${fieldSchema.label} must be a boolean value`);
          }
          break;
        
        case 'select':
          if (fieldSchema.options && !fieldSchema.options.some(opt => opt.value === value)) {
            errors.push(`${fieldSchema.label} must be one of: ${fieldSchema.options.map(opt => opt.label).join(', ')}`);
          }
          break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

export default STEP_REGISTRY;