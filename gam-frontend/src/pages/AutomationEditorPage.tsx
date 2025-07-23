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

  const handleSave = () => {
    console.log('Saving automation:', automation);
    // TODO: Implement save logic
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

      {/* Canvas Editor */}
      <Paper sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <CanvasEditor
          steps={automation.steps}
          onStepsChange={handleStepsChange}
          onSave={handleSave}
          onExecute={handleExecute}
        />
      </Paper>
    </Box>
  );
};