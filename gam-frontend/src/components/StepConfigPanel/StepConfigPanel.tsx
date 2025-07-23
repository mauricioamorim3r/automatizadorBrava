import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  IconButton,
  Grid
} from '@mui/material';
import {
  ExpandMore,
  Add,
  Delete,
  PlayArrow,
  Stop,
  Settings
} from '@mui/icons-material';
import type { StepNode } from '../CanvasEditor/CanvasEditor';

interface StepConfigPanelProps {
  selectedStep: StepNode | null;
  onStepUpdate: (stepId: string, updates: Partial<StepNode>) => void;
  onExecuteStep: (stepId: string) => void;
  isExecuting?: boolean;
}

const STEP_TEMPLATES = {
  SOURCE_MANUAL_INPUT: {
    name: 'Manual Input',
    icon: '📝',
    fields: [
      { key: 'data', label: 'Input Data', type: 'json', required: true },
      { key: 'format', label: 'Data Format', type: 'select', options: ['json', 'csv', 'text'] }
    ]
  },
  SOURCE_FILE: {
    name: 'File Input',
    icon: '📄',
    fields: [
      { key: 'path', label: 'File Path', type: 'text', required: true },
      { key: 'encoding', label: 'Encoding', type: 'select', options: ['utf8', 'latin1', 'ascii'] },
      { key: 'watch', label: 'Watch for Changes', type: 'boolean' }
    ]
  },
  SOURCE_API: {
    name: 'API Input',
    icon: '🌐',
    fields: [
      { key: 'url', label: 'API URL', type: 'text', required: true },
      { key: 'method', label: 'HTTP Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] },
      { key: 'headers', label: 'Headers', type: 'json' },
      { key: 'body', label: 'Request Body', type: 'json' },
      { key: 'timeout', label: 'Timeout (ms)', type: 'number' }
    ]
  },
  FILTER_SIMPLE: {
    name: 'Simple Filter',
    icon: '🔍',
    fields: [
      { key: 'condition', label: 'Filter Condition', type: 'text', required: true },
      { key: 'operator', label: 'Operator', type: 'select', options: ['equals', 'contains', 'greater_than', 'less_than', 'regex'] },
      { key: 'value', label: 'Value', type: 'text', required: true },
      { key: 'caseSensitive', label: 'Case Sensitive', type: 'boolean' }
    ]
  },
  FILTER_ADVANCED: {
    name: 'Advanced Filter',
    icon: '🔬',
    fields: [
      { key: 'script', label: 'Filter Script', type: 'code', required: true },
      { key: 'language', label: 'Language', type: 'select', options: ['javascript', 'python'] }
    ]
  },
  ACTION_TRANSFORM: {
    name: 'Transform Data',
    icon: '⚙️',
    fields: [
      { key: 'mapping', label: 'Field Mapping', type: 'json', required: true },
      { key: 'removeEmpty', label: 'Remove Empty Fields', type: 'boolean' },
      { key: 'flatten', label: 'Flatten Nested Objects', type: 'boolean' }
    ]
  },
  ACTION_BROWSER: {
    name: 'Browser Action',
    icon: '🌐',
    fields: [
      { key: 'action', label: 'Action Type', type: 'select', options: ['navigate', 'click', 'type', 'extract', 'screenshot'], required: true },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'selector', label: 'CSS Selector', type: 'text' },
      { key: 'text', label: 'Text to Type', type: 'text' },
      { key: 'waitFor', label: 'Wait for Element', type: 'text' },
      { key: 'timeout', label: 'Timeout (ms)', type: 'number' }
    ]
  },
  DESTINATION_FILE: {
    name: 'Save to File',
    icon: '💾',
    fields: [
      { key: 'path', label: 'Output Path', type: 'text', required: true },
      { key: 'format', label: 'File Format', type: 'select', options: ['json', 'csv', 'txt', 'xlsx'] },
      { key: 'overwrite', label: 'Overwrite Existing', type: 'boolean' },
      { key: 'append', label: 'Append to File', type: 'boolean' }
    ]
  },
  DESTINATION_EMAIL: {
    name: 'Send Email',
    icon: '📧',
    fields: [
      { key: 'to', label: 'To Email(s)', type: 'text', required: true },
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'body', label: 'Email Body', type: 'textarea' },
      { key: 'attachData', label: 'Attach Data as File', type: 'boolean' },
      { key: 'format', label: 'Attachment Format', type: 'select', options: ['json', 'csv', 'txt'] }
    ]
  }
};

export const StepConfigPanel: React.FC<StepConfigPanelProps> = ({
  selectedStep,
  onStepUpdate,
  onExecuteStep,
  isExecuting = false
}) => {
  const [localConfig, setLocalConfig] = useState<any>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (selectedStep) {
      setLocalConfig(selectedStep.config || {});
      setValidationErrors({});
    }
  }, [selectedStep]);

  if (!selectedStep) {
    return (
      <Paper sx={{ p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Select a step to configure its properties
        </Typography>
      </Paper>
    );
  }

  const stepTemplate = STEP_TEMPLATES[selectedStep.type as keyof typeof STEP_TEMPLATES] || {
    name: 'Unknown Step',
    icon: '❓',
    fields: []
  };

  const handleFieldChange = (fieldKey: string, value: any) => {
    const updatedConfig = { ...localConfig, [fieldKey]: value };
    setLocalConfig(updatedConfig);
    
    // Clear validation error for this field
    if (validationErrors[fieldKey]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldKey];
        return newErrors;
      });
    }
  };

  const handleSaveConfig = () => {
    // Validate required fields
    const errors: Record<string, string> = {};
    stepTemplate.fields.forEach(field => {
      if (field.required && (!localConfig[field.key] || localConfig[field.key] === '')) {
        errors[field.key] = `${field.label} is required`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    // Update step
    onStepUpdate(selectedStep.id, {
      config: localConfig,
      name: localConfig.name || selectedStep.name
    });
  };

  const handleStepNameChange = (newName: string) => {
    onStepUpdate(selectedStep.id, { name: newName });
  };

  const renderField = (field: any) => {
    const value = localConfig[field.key] || '';
    const hasError = !!validationErrors[field.key];

    switch (field.type) {
      case 'text':
        return (
          <TextField
            key={field.key}
            fullWidth
            label={field.label}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            error={hasError}
            helperText={validationErrors[field.key]}
            required={field.required}
            size="small"
            margin="dense"
          />
        );

      case 'textarea':
        return (
          <TextField
            key={field.key}
            fullWidth
            label={field.label}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            error={hasError}
            helperText={validationErrors[field.key]}
            required={field.required}
            multiline
            rows={4}
            size="small"
            margin="dense"
          />
        );

      case 'number':
        return (
          <TextField
            key={field.key}
            fullWidth
            label={field.label}
            type="number"
            value={value}
            onChange={(e) => handleFieldChange(field.key, parseInt(e.target.value))}
            error={hasError}
            helperText={validationErrors[field.key]}
            required={field.required}
            size="small"
            margin="dense"
          />
        );

      case 'select':
        return (
          <FormControl 
            key={field.key} 
            fullWidth 
            margin="dense" 
            size="small"
            error={hasError}
            required={field.required}
          >
            <InputLabel>{field.label}</InputLabel>
            <Select
              value={value}
              label={field.label}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
            >
              {field.options?.map((option: string) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
            {hasError && (
              <Typography variant="caption" color="error" sx={{ ml: 2, mt: 0.5 }}>
                {validationErrors[field.key]}
              </Typography>
            )}
          </FormControl>
        );

      case 'boolean':
        return (
          <FormControlLabel
            key={field.key}
            control={
              <Switch
                checked={!!value}
                onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                size="small"
              />
            }
            label={field.label}
            sx={{ mt: 1, mb: 1 }}
          />
        );

      case 'json':
        return (
          <TextField
            key={field.key}
            fullWidth
            label={field.label}
            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handleFieldChange(field.key, parsed);
              } catch {
                handleFieldChange(field.key, e.target.value);
              }
            }}
            error={hasError}
            helperText={validationErrors[field.key] || 'Enter valid JSON'}
            required={field.required}
            multiline
            rows={4}
            size="small"
            margin="dense"
            sx={{ fontFamily: 'monospace' }}
          />
        );

      case 'code':
        return (
          <TextField
            key={field.key}
            fullWidth
            label={field.label}
            value={value}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            error={hasError}
            helperText={validationErrors[field.key]}
            required={field.required}
            multiline
            rows={8}
            size="small"
            margin="dense"
            sx={{ fontFamily: 'monospace', fontSize: '14px' }}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ mr: 1 }}>
            {stepTemplate.icon}
          </Typography>
          <TextField
            variant="outlined"
            size="small"
            value={selectedStep.name}
            onChange={(e) => handleStepNameChange(e.target.value)}
            sx={{ flexGrow: 1 }}
          />
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip 
            label={stepTemplate.name} 
            variant="outlined" 
            size="small" 
          />
          <Chip 
            label={selectedStep.id} 
            variant="outlined" 
            size="small" 
            color="secondary" 
          />
          
          <Box sx={{ flexGrow: 1 }} />
          
          <IconButton
            size="small"
            onClick={() => onExecuteStep(selectedStep.id)}
            disabled={isExecuting}
            color="primary"
            title="Test Step"
          >
            {isExecuting ? <Stop /> : <PlayArrow />}
          </IconButton>
        </Box>
      </Paper>

      {/* Configuration */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Settings sx={{ mr: 1 }} />
            <Typography variant="subtitle1">Configuration</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                {stepTemplate.fields.map(renderField)}
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="subtitle1">Advanced Options</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={localConfig.enabled !== false}
                      onChange={(e) => handleFieldChange('enabled', e.target.checked)}
                      size="small"
                    />
                  }
                  label="Step Enabled"
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Description"
                  value={localConfig.description || ''}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  multiline
                  rows={2}
                  size="small"
                  placeholder="Describe what this step does..."
                />
              </Grid>
              
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Timeout (seconds)"
                  type="number"
                  value={localConfig.timeout || 30}
                  onChange={(e) => handleFieldChange('timeout', parseInt(e.target.value))}
                  size="small"
                />
              </Grid>
              
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Retry Count"
                  type="number"
                  value={localConfig.retryCount || 0}
                  onChange={(e) => handleFieldChange('retryCount', parseInt(e.target.value))}
                  size="small"
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Save Button */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button
          fullWidth
          variant="contained"
          onClick={handleSaveConfig}
          disabled={isExecuting}
        >
          Save Configuration
        </Button>
      </Box>
    </Box>
  );
};