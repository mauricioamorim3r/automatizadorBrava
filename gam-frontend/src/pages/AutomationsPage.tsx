import React from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

export const AutomationsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Automações
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Gerencie suas automações de medição
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/automations/new')}
        >
          Nova Automação
        </Button>
      </Box>

      {/* Empty State */}
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>
          Nenhuma automação encontrada
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Crie sua primeira automação para começar a automatizar suas tarefas
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/automations/new')}
        >
          Criar Primeira Automação
        </Button>
      </Paper>
    </Box>
  );
};