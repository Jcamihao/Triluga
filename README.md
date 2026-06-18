<div align="center">

<img src="https://img.shields.io/badge/Triluga-%F0%9F%9A%97%20Marketplace%20de%20Ve%C3%ADculos-1e293b?style=for-the-badge" alt="Triluga" />

# Classificados P2P de Veículos

### Compra, venda e aluguel entre pessoas — web e mobile

<br/>

![versão](https://img.shields.io/badge/Versão-2.6.0-84cc16?style=for-the-badge&labelColor=1e293b)

<br/>

![Angular](https://img.shields.io/badge/Angular-16-DD0031?style=flat-square&logo=angular&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=flat-square&logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)
![MinIO](https://img.shields.io/badge/MinIO-S3-C72E49?style=flat-square&logo=minio&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)
![Swagger](https://img.shields.io/badge/API-Swagger-85EA2D?style=flat-square&logo=swagger&logoColor=black)

</div>

---

## ✨ Visão rápida

- 🔍 **Busca avançada** com filtros por tipo, categoria, câmbio, combustível, ano, preço e localização geográfica.
- 📸 **Galeria responsiva** com zoom, navegação por toque, carrossel de miniaturas e crop de avatar.
- 💬 **Chat em tempo real** via WebSocket entre comprador e anunciante.
- 🤖 **Verificação de identidade com IA** — OCR + InsightFace para comparação biométrica selfie ↔ documento.
- ⭐ **Avaliações e reputação** pública de anunciantes e veículos.
- 🔔 **Notificações e alertas de busca** por e-mail e push via BullMQ.
- 💰 **Destaque pago** de anúncios integrado com EfiPay (PIX).
- 🛡️ **Conformidade LGPD** com exportação de dados e solicitações de exclusão.
- 🚀 **CI/CD automático** com GitHub Actions — testes antes de cada deploy na VPS.

---

## 🏗️ Arquitetura

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Angular 16 standalone · SCSS · PWA · lazy loading |
| **Backend** | NestJS 10 monólito modular · Prisma ORM |
| **Banco** | PostgreSQL 16 |
| **Cache / Filas** | Redis 7 + BullMQ |
| **Storage** | MinIO (S3-compatible) |
| **Real-time** | Socket.io (WebSocket) |
| **Auth** | JWT Bearer + refresh token httpOnly cookie |
| **IA — OCR** | Tesseract.js |
| **IA — Visão** | Ollama (`qwen2.5-vl`) |
| **IA — Faces** | InsightFace `buffalo_s` (microserviço Python/FastAPI) |
| **Infra local** | Docker Compose |
| **CI/CD** | GitHub Actions → SSH deploy VPS |

---

## 📁 Estrutura

```text
.
├── backend/                  NestJS API
│   ├── prisma/               Schema + migrations + seed
│   └── src/
│       ├── auth/             JWT, refresh, e-mail verification
│       ├── users/
│       ├── profiles/         KYC, selfie, documentos
│       ├── vehicles/         CRUD de anúncios
│       ├── vehicle-images/   Upload de fotos
│       ├── chat/             WebSocket + mensagens
│       ├── notifications/    Push + e-mail via BullMQ
│       ├── search-alerts/    Alertas de busca
│       ├── favorites/
│       ├── reviews/
│       ├── analytics/
│       ├── admin/            Painel administrativo
│       ├── featured/         Destaque pago (EfiPay/PIX)
│       ├── privacy/          LGPD
│       ├── storage/          MinIO abstraction
│       ├── cache-queue/      Redis + BullMQ abstraction
│       └── verification/     OCR + Ollama + InsightFace
├── frontend/                 Angular PWA
│   └── src/app/
│       ├── core/             Guards, interceptors, services, models
│       ├── shared/           Componentes reutilizáveis
│       └── features/         Páginas da aplicação
├── face-verification/        Microserviço Python — InsightFace
├── docs/                     Documentação adicional
│   └── releases/             Notas de versão
└── docker-compose.yml
```

---

## 🗺️ Páginas e rotas

| Rota | Página | Guard |
|------|--------|-------|
| `/` | Home com busca rápida e atalhos | — |
| `/search` | Lista de veículos com filtros | — |
| `/vehicles/:id` | Detalhe · galeria · mapa · reviews | — |
| `/compare` | Comparação lado a lado | — |
| `/chat` | Lista de conversas | `auth` |
| `/chat/:id` | Conversa individual | `auth` |
| `/favorites` | Favoritos | `auth` |
| `/profile` | Perfil + KYC + verificação | `auth` |
| `/privacy-center` | Central LGPD | `auth` |
| `/anunciar-carro` | Painel do anunciante | `auth` |
| `/users/:id` | Perfil público do anunciante | — |
| `/admin` | Painel administrativo | `auth + ADMIN` |
| `/auth/login` | Login | — |
| `/auth/register` | Cadastro | — |
| `/privacy` | Política de privacidade | — |

---

## 🔌 API — Endpoints

### 🔐 Auth
```
POST   /auth/register              Cadastro
POST   /auth/login                 Login
POST   /auth/refresh               Renova tokens
POST   /auth/logout                Logout
GET    /auth/me                    Usuário autenticado
POST   /auth/forgot-password       Solicita reset
POST   /auth/reset-password        Redefine senha com token
GET    /auth/confirm-email         Confirma e-mail
POST   /auth/resend-confirmation   Reenvia confirmação
```

### 🚗 Vehicles
```
GET    /vehicles                   Lista com filtros (público)
GET    /vehicles/stats             Contagens para a home (público)
GET    /vehicles/me                Anúncios do usuário
GET    /vehicles/:id               Detalhe (público)
POST   /vehicles                   Cria anúncio
PATCH  /vehicles/:id               Atualiza anúncio
DELETE /vehicles/:id               Desativa anúncio
POST   /vehicles/:id/images        Upload de imagens (até 8)
DELETE /vehicles/:id/images/:imgId Remove imagem
```

### ❤️ Favorites
```
GET    /favorites/my               Lista favoritos
POST   /favorites/:vehicleId       Adiciona favorito
DELETE /favorites/:vehicleId       Remove favorito
```

### 💬 Chat
```
POST   /chats/vehicle/:vehicleId/start  Inicia conversa
GET    /chats                           Lista conversas
GET    /chats/:id/messages              Mensagens
PATCH  /chats/:id/read                  Marca como lida
POST   /chats/:id/messages              Envia mensagem
```

### ⭐ Reviews
```
POST   /reviews                    Avalia anúncio
POST   /reviews/user               Avalia anunciante
GET    /reviews/vehicle/:id        Reviews de um veículo (público)
```

### 🔔 Notifications & Alerts
```
GET    /notifications/my           Lista notificações
PATCH  /notifications/:id/read     Marca como lida
POST   /search-alerts              Cria alerta de busca
GET    /search-alerts/my           Lista alertas
DELETE /search-alerts/:id          Remove alerta
```

### 👤 Profiles & KYC
```
GET    /profiles/me                     Perfil do usuário
PATCH  /profiles/me                     Atualiza perfil
GET    /profiles/:userId                Perfil público (público)
POST   /profiles/me/avatar              Upload de avatar
POST   /profiles/me/document            Upload de documento (KYC)
POST   /profiles/me/driver-license      Upload de CNH (KYC)
POST   /profiles/me/selfie              Upload de selfie → dispara verificação IA
GET    /profiles/me/document/url        URL temporária do documento
GET    /profiles/me/driver-license/url  URL temporária da CNH
```

### 🛡️ Privacy / LGPD
```
GET    /privacy/policy             Política pública (público)
GET    /privacy/me                 Preferências e solicitações
PATCH  /privacy/me/preferences     Atualiza preferências
GET    /privacy/me/export          Exporta dados da conta
POST   /privacy/me/requests        Cria solicitação LGPD
```

### ⚙️ Admin
```
GET    /admin/dashboard                          Resumo administrativo
GET    /admin/users                              Lista usuários
GET    /admin/vehicles                           Lista veículos
PATCH  /admin/users/:id/block                   Bloqueia usuário
DELETE /admin/users/:id                         Exclui usuário permanentemente
PATCH  /admin/users/:id/document/approve        Aprova documento
PATCH  /admin/users/:id/document/reject         Recusa documento
PATCH  /admin/users/:id/driver-license/approve  Aprova CNH
PATCH  /admin/users/:id/driver-license/reject   Recusa CNH
PATCH  /admin/vehicles/:id/deactivate           Desativa veículo
DELETE /admin/vehicles/:id                      Exclui veículo
PATCH  /admin/vehicles/:id/featured             Configura destaque
GET    /admin/reports                           Lista denúncias
PATCH  /admin/reports/:id                       Resolve denúncia
GET    /admin/privacy/requests                  Solicitações LGPD
PATCH  /admin/privacy/requests/:id              Atualiza solicitação
```

### 📊 Analytics & Lookups
```
POST   /analytics/visits                Rastreia visita
POST   /analytics/vehicle-views         Rastreia visualização
GET    /analytics/vehicles/most-viewed  Mais vistos (público)
GET    /analytics/summary               Resumo (admin)
GET    /lookups/cep/:zipCode            Consulta CEP (público)
GET    /lookups/fipe/brands             Marcas FIPE
GET    /lookups/fipe/models             Modelos FIPE
GET    /lookups/fipe/years              Anos FIPE
GET    /lookups/fipe/price              Preço FIPE
GET    /                                Healthcheck
```

> Swagger completo em `http://localhost:3002/api/docs`

---

## 🚀 Rodando localmente

### Opção 1 — Docker (recomendado)

```bash
cp .env.example .env
docker compose up --build
```

| Serviço | URL |
|---------|-----|
| **Frontend** | http://localhost:4202 |
| **Backend API** | http://localhost:3002/api/v1 |
| **Swagger** | http://localhost:3002/api/docs |
| **MinIO Console** | http://localhost:9005 |

> Se alguma porta já estiver em uso, ajuste no `.env` antes de subir.

### Opção 2 — Apps locais + infra em container

```bash
cp backend/.env.example backend/.env
npm run dev:infra       # sobe PostgreSQL, Redis, MinIO, Ollama
npm run dev:backend     # NestJS em watch mode
npm --prefix frontend start
```

### Verificação do backend

```bash
npm run backend:prepare   # prisma generate + migrate
npm run backend:verify    # type-check + build + testes
```

---

## 🌱 Seed

```bash
npm run db:seed
```

Para recriar o banco do zero:

```bash
npm run db:rebuild
```

**Credenciais de desenvolvimento:**

| Papel | E-mail | Senha |
|-------|--------|-------|
| Admin | `admin@triluga.local` | `Admin123!` |
| Anunciante | `mariana@triluga.local` | `User123!` |
| Comprador | `lucas@triluga.local` | `User123!` |

---

## 🤖 Verificação de Identidade (KYC)

O fluxo de KYC combina dois modelos em paralelo:

1. **Ollama** (`qwen2.5-vl`) — analisa legibilidade e autenticidade dos documentos.
2. **InsightFace** (`buffalo_s`) — compara biometricamente a selfie com a foto do documento e da CNH via cosine similarity (threshold `≥ 0.40`).

O InsightFace tem precedência no resultado de face match. Se indisponível, o sistema degrada graciosamente para o resultado do Ollama.

```
Upload selfie
    ├── Ollama → doc genuíno? CNH genuína? rosto corresponde?
    └── InsightFace → selfie ↔ doc sim? selfie ↔ CNH sim?
                          ↓ paralelo
            Combina resultados → APPROVED / REJECTED
            Dispara e-mail para o usuário
```

---

## 🔄 CI/CD

GitHub Actions com dois workflows:

- **CI** (`ci.yml`) — roda em todo push: build Angular + build NestJS + lint + audit de segurança.
- **CD** (`cd.yml`) — dispara após CI verde no `master`: SSH na VPS → `git pull` → `docker compose up --build` → limpeza de cache.

Secrets necessários no repositório:

| Secret | Descrição |
|--------|-----------|
| `VPS_HOST` | IP ou domínio da VPS |
| `VPS_USER` | Usuário SSH |
| `VPS_SSH_KEY` | Chave privada Ed25519 |
| `VPS_PROJECT_PATH` | Caminho absoluto do projeto na VPS |

---

## 📚 Documentação adicional

| Documento | Descrição |
|-----------|-----------|
| [Wireframes](./docs/wireframes.md) | Fluxos e telas principais |
| [Política de Privacidade](./docs/privacy-policy.md) | Texto legal LGPD |
| [Operações LGPD](./docs/lgpd-operations.md) | Procedimentos operacionais |
| [Retenção de Dados](./docs/data-retention.md) | Política de retenção |
| [QA Playbook](./docs/qa-playbook.md) | Roteiro de testes manuais |
| [Deploy VPS](./docs/deploy-render.md) | Guia de deploy na VPS |
| [Deploy Vercel/Railway](./docs/deploy-vercel-railway.md) | Deploy em cloud gerenciada |
| [iOS com Capacitor](./docs/ios-capacitor.md) | Build e teste no Xcode |

---

## 🏷️ Releases

| Versão | Destaques |
|--------|-----------|
| [v2.6.0](./docs/releases/v2.6.0.md) | CI/CD · InsightFace KYC · badge contatado · taxa de resposta |
| [v2.5.0](./docs/releases/v2.5.0.md) | KYC completo · verificação de e-mail · recuperação de senha · FIPE |
| [v2.4.14](./docs/releases/v2.4.14.md) | Galeria com zoom · localização automática |
| [v2.3.12](./docs/releases/v2.3.12.md) | Galeria com edição · crop de avatar |
| [v2.3.10](./docs/releases/v2.3.10.md) | Preço semanal como referência |
| [v2.2.0](./docs/releases/v2.2.0.md) | — |
| [v2.1.0](./docs/releases/v2.1.0.md) | — |
| [v2.0.0](./docs/releases/v2.0.0.md) | — |
