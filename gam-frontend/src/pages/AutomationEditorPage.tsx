import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  Grid,
} from '@mui/material';
import { Save, PlayArrow, ArrowBack } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { CanvasEditor } from '../components/CanvasEditor/CanvasEditor';
import { StepConfigPanel } from '../components/StepConfigPanel/StepConfigPanel';
import type { StepNode } from '../components/CanvasEditor/CanvasEditor';

export const AutomationEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [automation, setAutomation] = useState({
    name: 'Nova Automação',
    description: '',
    steps: [] as StepNode[],
  });
  
  const [selectedStep, setSelectedStep] = useState<StepNode | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleSave = async () => {
    try {
      const automationData = {
        name: automation.name,
        description: automation.description,
        config: { steps: automation.steps }
      };

      const response = await fetch('http://localhost:3002/api/automations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(automationData)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('Automation saved:', result.data);
        // Optionally navigate to the saved automation or show success message
      } else {
        console.error('Failed to save automation:', result.error);
      }
    } catch (error) {
      console.error('Error saving automation:', error);
    }
  };

  const handleExecute = () => {
    console.log('Executing automation:', automation);
    // TODO: Implement execute logic
  };

  const handleStepsChange = (steps: StepNode[]) => {
    setAutomation(prev => ({
      ...prev,
      steps
    }));
    
    // Update selected step if it was modified
    if (selectedStep) {
      const updatedStep = steps.find(s => s.id === selectedStep.id);
      setSelectedStep(updatedStep || null);
    }
  };

  const handleStepUpdate = (stepId: string, updates: Partial<StepNode>) => {
    const updatedSteps = automation.steps.map(step =>
      step.id === stepId ? { ...step, ...updates } : step
    );
    handleStepsChange(updatedSteps);
  };

  const handleStepSelect = (stepId: string | null) => {
    const step = stepId ? automation.steps.find(s => s.id === stepId) : null;
    setSelectedStep(step || null);
  };

  const handleExecuteStep = async (stepId: string) => {
    setIsExecuting(true);
    try {
      const step = automation.steps.find(s => s.id === stepId);
      if (!step) return;

      const response = await fetch('http://localhost:3002/api/steps/execute-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          step,
          inputData: null
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('Step execution result:', result.data);
        // You could update the UI to show execution results
      } else {
        console.error('Step execution failed:', result.error);
      }
    } catch (error) {
      console.error('Failed to execute step:', error);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/automations')}
            sx={{ mr: 2 }}
          >
            Voltar
          </Button>
          <Typography variant="h4" component="h1">
            {isNew ? 'Nova Automação' : 'Editar Automação'}
          </Typography>
        </Box>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Nome"
              value={automation.name}
              onChange={(e) => setAutomation(prev => ({ ...prev, name: e.target.value }))}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Descrição"
              value={automation.description}
              onChange={(e) => setAutomation(prev => ({ ...prev, description: e.target.value }))}
            />
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSave}
          >
            Salvar
          </Button>
          <Button
            variant="outlined"
            startIcon={<PlayArrow />}
            onClick={handleExecute}
            disabled={automation.steps.length === 0}
          >
            Executar
          </Button>
        </Box>
      </Box>

      {/* Editor Layout */}
      <Box sx={{ flexGrow: 1, display: 'flex', gap: 2, overflow: 'hidden' }}>
        {/* Canvas Editor */}
        <Paper sx={{ flexGrow: 1, overflow: 'hidden' }}>
          <CanvasEditor
            steps={automation.steps}
            onStepsChange={handleStepsChange}
            onSave={handleSave}
            onExecute={handleExecute}
            selectedStepId={selectedStep?.id}
            onStepSelect={handleStepSelect}
          />
        </Paper>

        {/* Step Configuration Panel */}
        <Paper sx={{ width: 400, overflow: 'hidden' }}>
          <StepConfigPanel
            selectedStep={selectedStep}
            onStepUpdate={handleStepUpdate}
            onExecuteStep={handleExecuteStep}
            isExecuting={isExecuting}
          />
        </Paper>
      </Box>
    </Box>
  );
};