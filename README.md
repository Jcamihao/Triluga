# Triluga 2.4.14

Classificado mobile-first de veículos entre pessoas, com frontend Angular PWA, backend NestJS modular e experiência visual orientada ao marketplace para web e mobile.

## Destaques da versão

- **Galeria responsiva 2.4.14**: detalhe do veículo exibe galeria com zoom, navegação por toque e carrossel de miniaturas.
- **Localização automática 2.4.13**: ao entrar no app, a localização do usuário é detectada pelo browser e usada para ordenar resultados.
- **Categorias de veículos ampliadas**: nova categoria adicionada no frontend e backend para cobrir mais tipos de anúncio.
- **Instalação mobile melhorada**: card de instalação do PWA revisado para melhor apelo visual.
- **Galeria com edição 2.3.12**: fotos do anúncio permitem remover ou substituir individualmente; crop de avatar na modal de perfil.
- **Preço semanal 2.3.10**: busca, ordenação, cards, favoritos, chat, comparação e detalhe usam o valor semanal como referência.
- **Publicação guiada**: o painel do proprietário indica a etapa e os campos pendentes antes de publicar.
- **Comparação funcional**: veículos selecionados podem ser avaliados lado a lado com preço semanal, especificações, localização e reputação do anunciante.
- **Publicação mais segura**: anúncio exige no mínimo 3 fotos, título automático e ações de publicar, despublicar e excluir.
- **Backend evoluído**: estatísticas da home, visualizações por anúncio, filtros de busca e tempo médio de resposta em perfil público.

## Arquitetura

- Frontend: Angular 16 standalone, SCSS, mobile first, lazy loading e service worker.
- Backend: NestJS 10 em monólito modular com módulos de domínio e serviços transversais.
- Banco: PostgreSQL com Prisma ORM.
- Infra local: Docker Compose com PostgreSQL, Redis, MinIO, backend e frontend.
- Real-time: WebSockets via Socket.io para chat e notificações.
- Autenticação: JWT Bearer tokens + refresh tokens em cookie httpOnly.
- Integrações desacopladas:
  - `StorageService` para MinIO/S3.
  - `CacheQueueService` para cache Redis e filas BullMQ.

## Estrutura

```text
.
├── backend
│   ├── prisma
│   └── src
│       ├── auth
│       ├── users
│       ├── profiles
│       ├── vehicles
│       ├── vehicle-images
│       ├── reviews
│       ├── favorites
│       ├── chat
│       ├── notifications
│       ├── search-alerts
│       ├── analytics
│       ├── lookups
│       ├── admin
│       ├── privacy
│       ├── storage
│       ├── cache-queue
│       ├── common
│       └── prisma
├── frontend
│   └── src/app
│       ├── core
│       ├── shared
│       └── features
├── docs
└── docker-compose.yml
```

## Banco

Entidades principais modeladas no Prisma:

- `User`
- `Profile`
- `Vehicle`
- `VehicleImage`
- `Favorite`
- `Review`
- `Notification`
- `SearchAlert`
- `Chat` / `ChatMessage`
- `PrivacyRequest`

Regras centrais refletidas no schema e nos serviços:

- múltiplos veículos por proprietário
- busca por cidade, tipo, categoria, câmbio, combustível, ano, preço e localização
- anúncios com fotos, descrição, reputação, contato por chat e galeria com zoom
- favoritos e alertas de busca
- avaliações públicas de anúncios e usuários
- conformidade LGPD com exportação de dados e solicitações de exclusão

## Páginas e rotas

| Path | Página | Guard |
|------|--------|-------|
| `/` | Home com busca rápida e atalhos de categorias | — |
| `/search` | Lista de veículos com filtros e carregamento progressivo | — |
| `/vehicles/:id` | Detalhe do veículo com galeria, Google Maps e reviews | — |
| `/compare` | Comparação lado a lado de veículos | — |
| `/chat` | Lista de conversas | `authGuard` |
| `/chat/:conversationId` | Conversa individual | `authGuard` |
| `/favorites` | Favoritos do usuário | `authGuard` |
| `/profile` | Perfil do usuário autenticado | `authGuard` |
| `/privacy-center` | Central LGPD (exportar dados, solicitar exclusão) | `authGuard` |
| `/anunciar-carro` | Painel do proprietário (criar / editar / excluir anúncios) | `authGuard` |
| `/users/:id` | Perfil público do anunciante | — |
| `/admin` | Painel administrativo (usuários, veículos, LGPD) | `authGuard + roleGuard(ADMIN)` |
| `/auth/login` | Login com e-mail/senha | — |
| `/auth/register` | Cadastro de novo usuário | — |
| `/privacy` | Política de privacidade pública | — |

## Backend — endpoints

### Auth
```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me
```

### Vehicles
```
GET    /vehicles                        lista com filtros (público)
GET    /vehicles/stats                  contagens para a home (público)
GET    /vehicles/me                     anúncios do usuário autenticado
GET    /vehicles/:id                    detalhe (público)
POST   /vehicles                        cria anúncio
PATCH  /vehicles/:id                    atualiza anúncio
DELETE /vehicles/:id                    desativa anúncio
POST   /vehicles/:id/images             upload de imagens (até 8)
DELETE /vehicles/:id/images/:imageId   remove uma imagem
```

### Favorites
```
GET    /favorites/my                    lista favoritos
POST   /favorites/:vehicleId           adiciona favorito
DELETE /favorites/:vehicleId           remove favorito
```

### Chat
```
POST   /chats/vehicle/:vehicleId/start inicia conversa
GET    /chats                          lista conversas
GET    /chats/:id/messages             mensagens da conversa
PATCH  /chats/:id/read                 marca como lida
POST   /chats/:id/messages             envia mensagem
```

### Reviews
```
POST   /reviews                        avalia anúncio
POST   /reviews/user                   avalia anunciante
GET    /reviews/vehicle/:vehicleId     reviews de um veículo (público)
```

### Search Alerts
```
POST   /search-alerts                  cria alerta
GET    /search-alerts/my               lista alertas
DELETE /search-alerts/:id              remove alerta
```

### Notifications
```
GET    /notifications/my               lista notificações
PATCH  /notifications/:id/read         marca como lida
```

### Profiles
```
GET    /profiles/me                    perfil do usuário
PATCH  /profiles/me                    atualiza perfil
GET    /profiles/:userId               perfil público (público)
POST   /profiles/me/avatar             upload de foto de perfil
POST   /profiles/me/document           upload de documento
GET    /profiles/me/document/url       URL temporária do documento
POST   /profiles/me/driver-license     upload da CNH
GET    /profiles/me/driver-license/url URL temporária da CNH
```

### Privacy / LGPD
```
GET    /privacy/policy                 resumo público da política (público)
GET    /privacy/me                     preferências e solicitações
PATCH  /privacy/me/preferences         atualiza preferências
GET    /privacy/me/export              exporta dados da conta
GET    /privacy/me/requests            lista solicitações abertas
POST   /privacy/me/requests            cria solicitação LGPD
```

### Admin
```
GET    /admin/dashboard                resumo administrativo
GET    /admin/users                    lista usuários
GET    /admin/vehicles                 lista veículos
GET    /admin/users/:id/verification-file   URL temporária de documento
GET    /admin/privacy/requests         lista solicitações LGPD
PATCH  /admin/privacy/requests/:id     atualiza status de solicitação
PATCH  /admin/users/:id/block          bloqueia usuário
PATCH  /admin/users/:id/document/approve   aprova documento
PATCH  /admin/users/:id/document/reject    recusa documento
PATCH  /admin/users/:id/driver-license/approve   aprova CNH
PATCH  /admin/users/:id/driver-license/reject    recusa CNH
PATCH  /admin/vehicles/:id/deactivate  desativa veículo
```

### Lookups & Analytics
```
GET    /lookups/cep/:zipCode           consulta endereço por CEP (público)
POST   /analytics/visits               rastreia visita
POST   /analytics/vehicle-views        rastreia visualização de veículo
GET    /analytics/vehicles/most-viewed veículos mais vistos (público)
GET    /analytics/summary              resumo analytics (admin)
GET    /                               healthcheck
```

Swagger disponível em `http://localhost:3002/api/docs`.

## Rodando localmente

### Opção 1: um comando com Docker

```bash
cp .env.example .env
docker compose up --build
```

| Serviço | URL |
|---------|-----|
| Frontend | `http://localhost:4202` |
| Backend | `http://localhost:3002/api/v1` |
| Swagger | `http://localhost:3002/api/docs` |
| MinIO Console | `http://localhost:9005` |

Se alguma porta já estiver em uso, ajuste no `.env` antes de subir:

```env
POSTGRES_HOST_PORT=5436
```

### Opção 2: apps locais + infra em containers

```bash
cp backend/.env.example backend/.env
npm run dev:infra
npm run dev:backend
npm --prefix frontend start
```

Para preparar e verificar o backend manualmente:

```bash
npm run backend:prepare
npm run backend:verify
```

## Seed

```bash
npm run db:seed
```

Para recriar o Postgres local do zero:

```bash
npm run db:rebuild
```

Credenciais sugeridas:

- Admin: `admin@triluga.local` / `Admin123!`
- Usuária anunciante: `mariana@triluga.local` / `User123!`
- Usuário locatário: `lucas@triluga.local` / `User123!`

## Documentação adicional

- Wireframes: [docs/wireframes.md](./docs/wireframes.md)
- Privacidade/LGPD: [docs/privacy-policy.md](./docs/privacy-policy.md), [docs/lgpd-operations.md](./docs/lgpd-operations.md), [docs/data-retention.md](./docs/data-retention.md)
- QA Playbook: [docs/qa-playbook.md](./docs/qa-playbook.md)
- Deploy Render: [docs/deploy-render.md](./docs/deploy-render.md)
- Deploy Vercel/Railway: [docs/deploy-vercel-railway.md](./docs/deploy-vercel-railway.md)
- iOS com Capacitor: [docs/ios-capacitor.md](./docs/ios-capacitor.md)

## iOS com Capacitor

Guia para abrir o Triluga no Xcode e testar em iPhone em [docs/ios-capacitor.md](./docs/ios-capacitor.md).

## Releases

- [v2.4.14](./docs/releases/v2.4.14.md)
- [v2.3.12](./docs/releases/v2.3.12.md)
- [v2.3.11](./docs/releases/v2.3.11.md)
- [v2.3.10](./docs/releases/v2.3.10.md)
- [v2.3.9](./docs/releases/v2.3.9.md)
- [v2.3.8](./docs/releases/v2.3.8.md)
- [v2.2.0](./docs/releases/v2.2.0.md)
- [v2.1.0](./docs/releases/v2.1.0.md)
- [v2.0.0](./docs/releases/v2.0.0.md)
- [v0.7.0](./docs/releases/v0.7.0.md)
- [v0.6.0](./docs/releases/v0.6.0.md)
- [v0.4.0](./docs/releases/v0.4.0.md)
- [v0.3.0](./docs/releases/v0.3.0.md)
- [v0.2.0](./docs/releases/v0.2.0.md)
