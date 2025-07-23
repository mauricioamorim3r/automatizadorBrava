# GAM - Gerenciador de Automações de Medição

Plataforma no-code para criação, gerenciamento e execução de automações de tarefas repetitivas com foco em medições e coleta de dados.

## 🚀 Quick Start

### Pré-requisitos
- Node.js 20+
- Docker e Docker Compose
- Git

### Instalação

1. **Clone o repositório**
```bash
git clone <repo-url>
cd Automator
```

2. **Configure variáveis de ambiente**
```bash
# Backend
cp gam-backend/.env.example gam-backend/.env
# Edite as variáveis conforme necessário
```

3. **Inicie os serviços com Docker**
```bash
docker-compose up -d postgres redis
```

4. **Instale dependências e inicie o backend**
```bash
cd gam-backend
npm install
npm run db:push
npm run dev
```

5. **Instale dependências e inicie o frontend**
```bash
cd gam-frontend
npm install
npm run dev
```

### URLs de Acesso
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## 📁 Estrutura do Projeto

```
Automator/
├── docker-compose.yml          # Orquestração de containers
├── gam-backend/               # API Node.js + Express
│   ├── src/
│   │   ├── controllers/       # Controladores da API
│   │   ├── middleware/        # Middlewares (auth, etc)
│   │   ├── models/           # Schemas do banco de dados
│   │   ├── routes/           # Rotas da API
│   │   ├── services/         # Lógica de negócio
│   │   ├── config/           # Configurações
│   │   └── index.js          # Ponto de entrada
│   └── package.json
├── gam-frontend/             # React + TypeScript
│   ├── src/
│   │   ├── components/       # Componentes React
│   │   ├── pages/           # Páginas da aplicação
│   │   ├── services/        # Serviços/API calls
│   │   └── hooks/           # Custom hooks
│   └── package.json
└── docs/                     # Documentação técnica
    ├── INITIAL.md           # Especificação inicial
    ├── Context Engineering.md # Blueprint técnico
    └── Funcionalidades do Gerenciador.md
```

## 🔧 Scripts Disponíveis

### Backend
```bash
npm run dev           # Desenvolvimento com nodemon
npm start            # Produção
npm run db:generate  # Gerar migrations
npm run db:push      # Aplicar migrations
npm run db:studio    # Interface visual do DB
npm test            # Executar testes
```

### Frontend
```bash
npm run dev         # Desenvolvimento
npm run build       # Build para produção
npm run preview     # Preview do build
npm test           # Executar testes
npm run lint       # Linter
```

## 🗄️ Database Schema

### Tabelas Principais
- **users** - Usuários do sistema
- **automations** - Definições de automações
- **executions** - Histórico de execuções
- **automation_shares** - Compartilhamentos
- **templates** - Templates pré-configurados

## 🔐 Autenticação

O sistema usa JWT (JSON Web Tokens) para autenticação:

### Endpoints de Auth
```
POST /api/auth/register  # Registro de usuário
POST /api/auth/login     # Login
GET  /api/auth/profile   # Perfil do usuário
PUT  /api/auth/profile   # Atualizar perfil
GET  /api/auth/verify    # Verificar token
```

### Headers de Autenticação
```javascript
Authorization: Bearer <jwt_token>
```

## 🏗️ Arquitetura Técnica

### Stack Principal
- **Frontend**: React 18 + TypeScript + Vite + Material-UI
- **Backend**: Node.js + Express + Drizzle ORM
- **Database**: PostgreSQL 15 + Redis 7
- **Containerização**: Docker + Docker Compose

### Integrações Planejadas
- **Microsoft Graph API** - SharePoint/OneDrive
- **SMB2** - Network shares
- **Puppeteer** - Browser automation
- **Azure AD** - OAuth2 authentication

## 📊 Monitoramento

### Health Checks
```bash
curl http://localhost:3001/health
```

### Logs
- Backend: Console logs + Winston (futuro)
- Database: PostgreSQL logs
- Redis: Redis logs

## 🧪 Testes

### Backend
```bash
cd gam-backend
npm test           # Jest unit tests
npm run test:watch # Watch mode
```

### Frontend
```bash
cd gam-frontend
npm test           # React Testing Library
```

## 🚀 Deploy

### Desenvolvimento
```bash
docker-compose up -d
```

### Produção
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 📈 Roadmap

### Fase 1 (Atual) - Fundação
- ✅ Setup inicial do projeto
- ✅ Autenticação JWT
- ✅ Database schema
- 🔄 Editor visual básico

### Fase 2 - Integrações
- 📅 Microsoft Graph API
- 📅 SMB network shares
- 📅 Browser automation
- 📅 Sistema de agendamento

### Fase 3 - IA e Otimização
- 📅 Geração automática via IA
- 📅 Performance optimization
- 📅 Advanced monitoring

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 📞 Suporte

- **Documentação**: `/docs` folder
- **Issues**: GitHub Issues
- **Email**: suporte@gam.com

---

**Status**: 🚀 Em desenvolvimento ativo  
**Versão**: 1.0.0 (MVP)  
**Confidence Level**: 9/10