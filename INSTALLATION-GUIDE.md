# 🚀 GAM Backend - Guia de Instalação Completo (Dados Reais)

## 📋 Pré-requisitos

### 1. PostgreSQL
```bash
# Windows (usando chocolatey)
choco install postgresql

# Ou baixe e instale: https://www.postgresql.org/download/windows/
```

### 2. Redis (Opcional mas recomendado)
```bash
# Windows (usando chocolatey)  
choco install redis-64
```

### 3. Node.js 20+
```bash
# Verificar versão
node --version  # Deve ser >= 20.0.0
```

## 🔧 Configuração do Banco de Dados

### Passo 1: Criar o banco e usuário
```bash
# Conectar como postgres
psql -U postgres

# No PostgreSQL, execute:
```

```sql
-- Executar no PostgreSQL
CREATE DATABASE gam_db;
CREATE USER gam_user WITH PASSWORD 'gam_password';
GRANT ALL PRIVILEGES ON DATABASE gam_db TO gam_user;
\c gam_db
GRANT ALL PRIVILEGES ON SCHEMA public TO gam_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO gam_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO gam_user;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gam_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO gam_user;
\q
```

### Passo 2: Aplicar migrations
```bash
cd gam-backend
npm run db:migrate
```

## 📦 Instalação das Dependências

### Opção 1: Instalação completa (recomendada)
```bash
cd gam-backend
npm run install:safe
```

### Opção 2: Se houver problemas, instalar mínimo
```bash
npm run install:minimal
npm install bcryptjs jsonwebtoken zod uuid drizzle-orm postgres redis
```

## 🔐 Configuração do Environment

### Copie e configure o .env
```bash
cp .env.example .env
```

### Edite o .env com suas configurações:
```env
# Database
DATABASE_URL=postgresql://gam_user:gam_password@localhost:5432/gam_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your_super_secure_jwt_secret_here
JWT_EXPIRES_IN=7d

# Server
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Microsoft Graph API (opcional)
AZURE_CLIENT_ID=your_azure_client_id
AZURE_CLIENT_SECRET=your_azure_client_secret
AZURE_TENANT_ID=your_azure_tenant_id

# Logging
LOG_LEVEL=info

# Browser Automation
MAX_BROWSER_SESSIONS=10
BROWSER_HEADLESS=true

# Performance
MAX_RETRIES=3
PERFORMANCE_MONITORING=true
```

## 🚀 Executar o Sistema

### Modo Produção (Recomendado - Dados Reais)
```bash
npm run start:production
```

### Modo Desenvolvimento
```bash
npm run dev:production
```

### Modo Básico (para testes sem DB)
```bash
npm run start:basic
```

## ✅ Verificar se Está Funcionando

### 1. Health Check
```bash
curl http://localhost:3001/health
```

### 2. Teste do Banco de Dados
```bash
curl http://localhost:3001/api/test-db
```

### 3. Informações da API
```bash
curl http://localhost:3001/api
```

## 📊 Endpoints Disponíveis

### Autenticação (Dados Reais)
- `POST /api/auth/register` - Registro de usuário
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Perfil do usuário

### Automações (CRUD Completo)
- `GET /api/automations` - Listar automações
- `POST /api/automations` - Criar automação
- `GET /api/automations/:id` - Obter automação
- `PUT /api/automations/:id` - Atualizar automação
- `DELETE /api/automations/:id` - Deletar automação
- `POST /api/automations/:id/execute` - Executar automação

### Execuções (Histórico Real)
- `GET /api/executions` - Listar execuções
- `GET /api/executions/:id` - Detalhes da execução
- `GET /api/executions/:id/logs` - Logs da execução
- `POST /api/executions/:id/cancel` - Cancelar execução
- `GET /api/executions/stats/summary` - Estatísticas

### Scheduling (Cron Jobs Reais)
- `GET /api/scheduler/schedules` - Listar schedules
- `PUT /api/scheduler/automations/:id/schedule` - Configurar schedule
- `POST /api/scheduler/webhooks/:token` - Webhook endpoint

### Microsoft Integration
- `GET /api/microsoft/auth` - Autenticação OAuth
- `GET /api/microsoft/sharepoint/*` - SharePoint endpoints
- `GET /api/microsoft/onedrive/*` - OneDrive endpoints

### Monitoramento
- `GET /api/metrics` - Métricas do sistema
- `GET /api/errors/report` - Relatório de erros

## 🔧 Solução de Problemas

### Erro de conexão com PostgreSQL
```bash
# Verificar se PostgreSQL está rodando
pg_ctl status

# Iniciar PostgreSQL (Windows)
net start postgresql-x64-14

# Testar conexão manual
psql -U gam_user -d gam_db
```

### Erro de conexão com Redis
```bash
# Iniciar Redis (Windows)
redis-server

# Ou como serviço
net start Redis
```

### Dependências com erro
```bash
# Limpar cache e reinstalar
npm cache clean --force
rm -rf node_modules package-lock.json
npm run install:safe
```

## 🎯 Funcionalidades Completas

### ✅ 100% Funcional - Dados Reais
- **✅ PostgreSQL Integration** - Banco completo
- **✅ User Authentication** - bcryptjs + JWT
- **✅ Automation CRUD** - Create, Read, Update, Delete
- **✅ Execution System** - Logs e histórico reais
- **✅ Scheduling System** - Cron jobs funcionais
- **✅ Error Handling** - Sistema completo
- **✅ Performance Monitoring** - Métricas reais
- **✅ Rate Limiting** - Proteção contra abuse
- **✅ Logging System** - Winston com arquivos
- **✅ Microsoft Integration** - Graph API OAuth
- **✅ Browser Automation** - Puppeteer completo

### ❌ Zero Mock Data
- Todos os dados são persistidos no PostgreSQL
- Autenticação real com hash de senhas
- Tokens JWT reais
- Logs de execução reais
- Métricas de performance reais

## 🚀 Comandos de Produção

```bash
# Instalar dependências
npm run install:safe

# Executar migrations
npm run db:migrate

# Modo produção
npm run start:production

# Desenvolvimento com reload
npm run dev:production
```

## 🎉 Sistema 100% Funcional!

Após seguir este guia, você terá:
- ✅ Sistema GAM rodando em modo produção
- ✅ Banco PostgreSQL configurado e funcionando
- ✅ Todas as APIs funcionais com dados reais
- ✅ Autenticação e autorização completas
- ✅ Sistema de execuções com logs reais
- ✅ Scheduling e webhooks funcionais

**🔥 Zero Mock Data - 100% Real Data! 🔥**