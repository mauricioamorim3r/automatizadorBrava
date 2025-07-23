import React from 'react';
import {
  Box,
  Typography,
  Paper,
} from '@mui/material';

export const ExecutionsPage: React.FC = () => {
  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Execuções
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Histórico de execuções das automações
        </Typography>
      </Box>

      {/* Empty State */}
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" gutterBottom>
          Nenhuma execução encontrada
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Execute uma automação para ver o histórico aqui
        </Typography>
      </Paper>
    </Box>
  );
};