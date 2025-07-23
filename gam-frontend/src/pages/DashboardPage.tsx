import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Paper,
} from '@mui/material';
import { Add, AutoMode, PlayArrow, CheckCircle, Error } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const stats = [
    {
      title: 'Total Automações',
      value: '0',
      icon: <AutoMode fontSize="large" />,
      color: '#1976d2',
    },
    {
      title: 'Execuções Hoje',
      value: '0',
      icon: <PlayArrow fontSize="large" />,
      color: '#388e3c',
    },
    {
      title: 'Sucessos',
      value: '0',
      icon: <CheckCircle fontSize="large" />,
      color: '#4caf50',
    },
    {
      title: 'Falhas',
      value: '0',
      icon: <Error fontSize="large" />,
      color: '#f44336',
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Bem-vindo ao Gerenciador de Automações de Medição
        </Typography>
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      bgcolor: `${stat.color}20`,
                      color: stat.color,
                      mr: 2,
                    }}
                  >
                    {stat.icon}
                  </Box>
                  <Box>
                    <Typography variant="h4" component="div" fontWeight="bold">
                      {stat.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stat.title}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Quick Actions */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Ações Rápidas
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => navigate('/automations/new')}
              >
                Nova Automação
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/automations')}
              >
                Ver Automações
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/executions')}
              >
                Ver Execuções
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Status do Sistema
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <CheckCircle sx={{ color: 'success.main', mr: 1 }} />
              <Typography variant="body2">API Backend: Online</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <CheckCircle sx={{ color: 'success.main', mr: 1 }} />
              <Typography variant="body2">Banco de Dados: Online</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <CheckCircle sx={{ color: 'success.main', mr: 1 }} />
              <Typography variant="body2">Cache Redis: Online</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Atividade Recente
        </Typography>
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Nenhuma atividade recente
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Crie sua primeira automação para começar!
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
};