import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Typography,
  Avatar,
  useTheme,
} from '@mui/material';
import {
  Dashboard,
  AutoMode,
  PlayArrow,
  Settings,
  ExitToApp,
  Add,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { logout } from '../../store/slices/authSlice';

interface NavItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  badge?: number;
}

export const Sidebar: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);

  const navItems: NavItem[] = [
    {
      text: 'Dashboard',
      icon: <Dashboard />,
      path: '/dashboard',
    },
    {
      text: 'Automações',
      icon: <AutoMode />,
      path: '/automations',
    },
    {
      text: 'Execuções',
      icon: <PlayArrow />,
      path: '/executions',
    },
    {
      text: 'Configurações',
      icon: <Settings />,
      path: '/settings',
    },
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const handleNewAutomation = () => {
    navigate('/automations/new');
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header with user info */}
      <Toolbar>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <Avatar
            sx={{ 
              width: 32, 
              height: 32, 
              mr: 2,
              bgcolor: theme.palette.primary.main 
            }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2" noWrap>
              {user?.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {user?.email}
            </Typography>
          </Box>
        </Box>
      </Toolbar>

      <Divider />

      {/* Quick Actions */}
      <Box sx={{ p: 2 }}>
        <ListItemButton
          onClick={handleNewAutomation}
          sx={{
            borderRadius: 1,
            bgcolor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            '&:hover': {
              bgcolor: theme.palette.primary.dark,
            },
          }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
            <Add />
          </ListItemIcon>
          <ListItemText primary="Nova Automação" />
        </ListItemButton>
      </Box>

      <Divider />

      {/* Navigation */}
      <List sx={{ flexGrow: 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path === '/automations' && location.pathname.startsWith('/automations'));

          return (
            <ListItem key={item.text} disablePadding>
              <ListItemButton
                onClick={() => handleNavigation(item.path)}
                selected={isActive}
                sx={{
                  mx: 1,
                  borderRadius: 1,
                  '&.Mui-selected': {
                    bgcolor: theme.palette.action.selected,
                    '&:hover': {
                      bgcolor: theme.palette.action.selected,
                    },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
                {item.badge && (
                  <Box
                    sx={{
                      bgcolor: theme.palette.error.main,
                      color: theme.palette.error.contrastText,
                      borderRadius: '50%',
                      width: 20,
                      height: 20,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                    }}
                  >
                    {item.badge}
                  </Box>
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Divider />

      {/* Logout */}
      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              mx: 1,
              borderRadius: 1,
              color: theme.palette.error.main,
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>
              <ExitToApp />
            </ListItemIcon>
            <ListItemText primary="Sair" />
          </ListItemButton>
        </ListItem>
      </List>

      {/* Footer */}
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary" align="center">
          GAM v1.0.0
        </Typography>
      </Box>
    </Box>
  );
};