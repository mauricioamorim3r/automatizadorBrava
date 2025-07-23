import React from 'react';
import {
  Box,
  Typography,
  Paper,
} from '@mui/material';

export const SettingsPage: React.FC = () => {
  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Configurações
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Configure sua conta e preferências do sistema
        </Typography>
      </Box>

      {/* Settings Content */}
      <Paper sx={{ p: 4 }}>
        <Typography variant="h6" gutterBottom>
          Em construção
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Esta página está sendo desenvolvida
        </Typography>
      </Paper>
    </Box>
  );
};