# INITIAL.md - Gerenciador de Automações de Medição (GAM)

## Project Identity
**Sistema**: Gerenciador de Automações de Medição  
**Domínio**: Automação de Processos / No-Code Platform  
**Contexto**: Plataforma para automações visuais de tarefas repetitivas  
**Confidence Target**: 9/10 (seguindo padrão SGM)

## Business Context

### Core Problem
Necessidade de automatizar tarefas repetitivas de medição e coleta de dados sem conhecimento técnico de programação, integrando múltiplas fontes (web, SharePoint, OneDrive, pastas de rede).

### Success Metrics
- Criação de automação em <10 minutos
- Taxa de sucesso de execução >95%
- Tempo de resposta <2 segundos
- Suporte a 50+ execuções simultâneas

### Business Rules
- **BR001**: Automações devem ser compartilháveis com controle de permissões
- **BR002**: Execuções devem ter logs completos para auditoria
- **BR003**: Sistema deve suportar agendamento cronológico e triggers externos
- **BR004**: Integração com IA para geração automática de fluxos

## Technical Architecture

### Stack Core
```typescript
Frontend: React + TypeScript + Redux + Material-UI + Vite
Backend: Node.js + Express + Drizzle ORM + PostgreSQL + Redis
Automation: Puppeteer + Microsoft Graph API + SMB2
Infrastructure: Docker + GitHub Actions + Prometheus/Grafana
```

### System Components
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │   API Gateway   │    │  Automation     │
│   (React/TS)    │◄──►│   (Express)     │◄──►│  Engine         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Auth System   │    │   PostgreSQL    │    │   External      │
│   (JWT/RBAC)    │    │   + Redis       │    │   Integrations  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Models Core
```typescript
interface Automation {
  id: string;
  name: string;
  description?: string;
  steps: AutomationStep[];
  config: AutomationConfig;
  status: 'draft' | 'active' | 'paused';
  schedule?: Schedule;
  owner: string;
  collaborators: Collaborator[];
  metadata: AutomationMetadata;
}

interface AutomationStep {
  id: string;
  type: 'source' | 'filter' | 'action' | 'destination';
  config: StepConfig;
  position: Position;
  connections: Connection[];
}
```

## Functional Requirements Matrix

### RF001 - Gerenciamento de Automações
**Prioridade**: Crítica  
**Complexidade**: Média  
**Validação**: CRUD completo + filtros + templates

### RF002 - Editor Visual de Automações  
**Prioridade**: Crítica  
**Complexidade**: Alta  
**Validação**: Canvas drag-and-drop + validação + undo/redo

### RF003 - Tipos de Steps de Automação
**Prioridade**: Crítica  
**Complexidade**: Alta  
**Validação**: Source/Filter/Action/Interface Automation/Destination configuráveis

#### Step Categories Overview
```typescript
// SOURCE STEPS - Origem de Dados
'file_local' | 'api_rest' | 'database' | 'sharepoint' | 'onedrive' | 
'smb_share' | 'clipboard' | 'webhook' | 'email' | 'cloud_storage'

// FILTER STEPS - Filtros e Condições  
'simple_conditions' | 'complex_logic' | 'regex' | 'date_filters' |
'deduplication' | 'validation' | 'custom_javascript'

// ACTION STEPS - Processamento
'data_transform' | 'calculations' | 'text_format' | 'file_convert' |
'merge_join' | 'aggregations' | 'file_operations' | 'custom_js'

// INTERFACE AUTOMATION - Automação Web
'navigate' | 'click' | 'type' | 'select' | 'upload' | 'download' |
'scroll' | 'extract' | 'screenshot' | 'wait_elements'

// DESTINATION STEPS - Saída de Dados
'save_file' | 'api_post' | 'database_insert' | 'email_send' |
'cloud_upload' | 'smb_save' | 'webhook_trigger' | 'pdf_generate'
```

### RF004 - Automação de Interface Web
**Prioridade**: Alta  
**Complexidade**: Alta  
**Validação**: Puppeteer + seletores CSS + ações complexas

### RF005 - Execução de Automações
**Prioridade**: Crítica  
**Complexidade**: Alta  
**Validação**: Manual/debug + retry + >95% sucesso

### RF006 - Agendamento e Triggers
**Prioridade**: Alta  
**Complexidade**: Média  
**Validação**: Cron + webhooks + email triggers

### RF007 - Logs e Monitoramento
**Prioridade**: Alta  
**Complexidade**: Média  
**Validação**: Dashboard real-time + alertas

### RF008 - Colaboração
**Prioridade**: Média  
**Complexidade**: Média  
**Validação**: Compartilhamento + permissões + comentários

### RF010 - Integração com IA
**Prioridade**: Baixa  
**Complexidade**: Alta  
**Validação**: Geração por linguagem natural + sugestões

## Non-Functional Requirements

### Performance (RNF001)
```
Response Time: <2s (95th percentile)
Throughput: 50+ execuções simultâneas
Memory Usage: <512MB por execução
Database Queries: <100ms (95th percentile)
```

### Security (RNF004)
```
Authentication: JWT + refresh tokens
Authorization: RBAC granular
Data Encryption: AES-256 (dados sensíveis)
API Security: Rate limiting + CORS
Audit Trail: Logs completos de ações
```

### Reliability (RNF002)
```
Uptime: 99.5%
Recovery Time: <5 minutos
Backup Frequency: Diário
Error Rate: <1%
Retry Strategy: Exponential backoff
```

## Practical Use Cases

### Caso 1: Backup Automático SharePoint → SMB
```
Source: SharePoint site (/sites/{site-id}/lists)
Filter: Arquivos modificados última semana  
Action: Compactar em ZIP (archiver lib)
Destination: Pasta de rede (\\server\backup\)
Trigger: Agendamento semanal (domingo 02:00)
```

### Caso 2: Relatório Vendas Multi-fonte
```
Source 1: API CRM (vendas do dia)
Source 2: OneDrive Excel (metas regionais)  
Filter: Vendas > R$1.000 AND região = 'Sul'
Action: Calcular performance vs meta
Destination: Email dashboard + SharePoint list
```

### Caso 3: Monitoramento Web com IA
```
Interface Automation: Navegar site concorrente
Action: Extrair preços (CSS selectors)
Filter: Mudanças > 5% (comparar histórico)
AI Integration: Gerar insights automáticos
Destination: Slack webhook + relatório PDF
```

### Microsoft Graph API Integration
```typescript
interface GraphIntegration {
  oauth2Flow: 'authorization_code';
  scopes: ['Files.ReadWrite', 'Sites.ReadWrite.All'];
  endpoints: {
    sharepoint: '/sites/{site-id}';
    onedrive: '/me/drive';
    files: '/items/{item-id}';
  };
  operations: {
    source: ['list_drives', 'read_files', 'get_items'];
    destination: ['upload_files', 'create_folders', 'update_items'];
    actions: ['copy', 'move', 'delete', 'compress'];
  };
}
```

### SMB/Network Shares Integration
```typescript
interface SMBIntegration {
  protocol: 'smb2';
  authentication: 'ntlm' | 'kerberos';
  operations: ['read', 'write', 'list', 'delete'];
  pathPattern: '\\\\server\\share\\path';
  nodeLibrary: 'smb2'; // Node.js integration
  limitations: ['headless_environments', 'vpn_requirements'];
}
```

## Development Phases

### Fase 1: Fundação (Semanas 1-2)
- [ ] Setup projeto + infraestrutura
- [ ] Backend core + API foundation  
- [ ] Frontend base + autenticação
- [ ] Editor básico drag-and-drop

### Fase 2: Automação Web (Semanas 3-4)
- [ ] Browser automation engine (Puppeteer)
- [ ] Integrações SharePoint/OneDrive/SMB
- [ ] Sistema de agendamento
- [ ] Colaboração básica

### Fase 3: IA e Otimização (Semanas 5-6)
- [ ] Integração IA para geração
- [ ] Performance e segurança avançada
- [ ] Testes e deploy
- [ ] Monitoramento e métricas

## Quality Gates

### Definition of Done (DoD)
- [ ] Funcionalidade implementada conforme RF
- [ ] Testes unitários >80% cobertura
- [ ] Testes de integração passando
- [ ] Performance requirements atendidos
- [ ] Security review aprovado
- [ ] Documentação atualizada

### Acceptance Criteria Template
```gherkin
Given [contexto inicial]
When [ação do usuário]
Then [resultado esperado]
And [validações adicionais]
```

## Risk Assessment

### Technical Risks
- **Alto**: Complexity do editor visual drag-and-drop
- **Alto**: Integração Microsoft Graph API (rate limits, OAuth flow)
- **Médio**: SMB shares em ambientes headless/cloud
- **Médio**: Performance com 50+ execuções simultâneas
- **Médio**: Browser automation memory management (Puppeteer)

### Business Risks
- **Médio**: Adoção da interface no-code
- **Baixo**: Competição com ferramentas existentes
- **Baixo**: Custos API Graph (10k requests/dia gratuito)

### Mitigation Strategies
- Prototipagem rápida do editor visual
- POCs Microsoft Graph API com conta dev
- SMB testing com VPN/network mounts
- Load testing desde fase inicial
- Memory profiling para browser automation

## Success Validation

### MVP Criteria
- Criação de automação simples em <10 minutos
- Execução bem-sucedida de fluxo web básico
- Integração SharePoint/OneDrive funcional (read/write)
- SMB share access (local network)
- Agendamento diário funcional
- Compartilhamento entre usuários

### Scale Validation  
- 50+ automações executando simultaneamente
- Response time <2s sob carga
- Graph API rate limits respeitados (10k/dia)
- Zero downtime durante deploys
- Browser memory management otimizado
- Logs/monitoring operacionais completos

### Integration Success Metrics
```
Microsoft Graph API:
- OAuth flow completion rate >95%
- File operations success rate >98%
- API response time <1s (95th percentile)

SMB Operations:
- Network connection success >90%
- File transfer reliability >95%
- Fallback to UI automation <5% cases

Browser Automation:
- Element detection accuracy >95%
- Memory usage <512MB per session
- Parallel session limit: 10+ concurrent
```

## Context Engineering Compliance

### Validation Loops
- [ ] Requirements validation (weekly)
- [ ] Architecture review (bi-weekly)  
- [ ] Performance benchmarking (continuous)
- [ ] Security assessment (milestone-based)

### Documentation Standards
- [ ] API documentation (OpenAPI 3.0)
- [ ] Architecture Decision Records (ADRs)
- [ ] Runbooks operacionais
- [ ] User guides + tutorials

### Confidence Building
- [ ] Automated testing pipeline
- [ ] Staging environment mirroring prod
- [ ] Gradual rollout strategy
- [ ] Monitoring/alerting comprehensive

---

**Target Confidence Score**: 9/10  
**Methodology**: Context Engineering (following SGM success pattern)  
**Review Cycle**: Weekly validation loops  
**Success Metric**: Production-ready platform in 6 weeks