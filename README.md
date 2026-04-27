# Triluga 2.1.0

Classificado mobile-first de veículos entre pessoas, com frontend Angular PWA, backend NestJS modular e experiência visual orientada ao marketplace para web e mobile.

## Destaques da versão

- **Experiência 2.1**: home, perfis, privacidade, comparação, filtros e navegação mobile refinados sobre a base do redesign 2.0.
- **Serviços mais resilientes**: auth, chat, favoritos, notificações, privacidade, storage, analytics e APIs de veículos revisados para fluxos reais de uso.
- **Operação e deploy**: Docker, Render, runtime config e documentação de QA ajustados para ambientes gerenciados.
- **Backend defensivo**: controllers e services reforçados em autenticação, preferências, busca, avaliações e imagens.
- **Frontend funcional**: as telas continuam conectadas aos serviços Angular existentes, com rotas, busca, favoritos, comparação, chat e ações principais preservadas.

## Arquitetura

- Frontend: Angular 16 standalone, SCSS, mobile first, lazy loading e service worker.
- Backend: NestJS 10 em monólito modular com módulos de domínio e serviços transversais.
- Banco: PostgreSQL com Prisma.
- Infra local: Docker Compose com PostgreSQL, Redis, MinIO, backend e frontend.
- Runtime config gerado para frontend web/mobile.
- Integrações desacopladas:
  - `StorageService` para MinIO/S3 futuro.
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
│       ├── notifications
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
- `Review`
- `Notification`

Regras centrais já refletidas no schema e nos serviços:

- múltiplos veículos por proprietário
- busca por cidade, tipo, categoria, preço e localização
- anúncios com fotos, descrição, reputação e contato por chat
- favoritos e alertas de busca
- avaliações públicas de anúncios e usuários

## Backend

Endpoints principais implementados:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /privacy/policy`
- `GET /privacy/me`
- `PATCH /privacy/me/preferences`
- `GET /privacy/me/export`
- `GET /privacy/me/requests`
- `POST /privacy/me/requests`
- `GET /vehicles`
- `GET /vehicles/me`
- `GET /vehicles/:id`
- `POST /vehicles`
- `PATCH /vehicles/:id`
- `DELETE /vehicles/:id`
- `POST /vehicles/:id/images`
- `POST /reviews`
- `GET /reviews/vehicle/:vehicleId`
- `GET /notifications/my`
- `PATCH /notifications/:id/read`
- `GET /admin/dashboard`
- `GET /admin/users`
- `GET /admin/vehicles`
- `GET /admin/privacy/requests`
- `PATCH /admin/users/:id/block`
- `PATCH /admin/vehicles/:id/deactivate`

No Docker Compose padrão, Swagger fica disponível em `http://localhost:3002/api/docs`.

## Frontend

Fluxos disponíveis no Angular:

- home redesenhada com busca rápida e atalhos
- lista redesenhada com filtros e carregamento progressivo
- alertas de busca salvos para usuários autenticados
- detalhe do veículo redesenhado com galeria e reviews
- mapa de localização no detalhe do veículo quando o anúncio possui coordenadas
- login e cadastro redesenhados
- perfil e perfil público redesenhados
- favoritos, comparação e chat redesenhados
- política de privacidade pública
- central de privacidade autenticada
- painel do proprietário redesenhado
- painel admin
- notificações e recuperação de sessão mais previsíveis

Componentes obrigatórios implementados:

- card de veículo
- header com busca
- filtro modal
- galeria de imagens
- botão fixo mobile
- bottom navigation

Preparação mobile adicional:

- navegação por arraste lateral entre início, busca, anúncio e chat
- barra de ação do detalhe fixa acima da navegação inferior
- base do Capacitor configurada para iOS em `frontend/capacitor.config.ts`
- projeto nativo iOS gerado em `frontend/ios`

## Rodando localmente

### Opção 1: um comando com Docker

```bash
cp .env.example .env
docker compose up --build
```

Frontend: `http://localhost:4202`  
Backend: `http://localhost:3002/api/v1`  
Swagger: `http://localhost:3002/api/docs`  
MinIO Console: `http://localhost:9005`

Se alguma porta já estiver em uso na sua máquina, ajuste no `.env` antes de subir. Exemplo:

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

Se quiser preparar e verificar o backend manualmente antes de subir:

```bash
npm run backend:prepare
npm run backend:verify
```

## Seed

Depois da infraestrutura estar disponível:

```bash
npm run db:seed
```

Se precisar recriar o Postgres local do zero e recolocar o `triluga` como banco/usuário principal do ambiente:

```bash
npm run db:rebuild
```

Credenciais sugeridas:

- Admin: `admin@triluga.local` / `Admin123!`
- Usuária anunciante: `mariana@triluga.local` / `User123!`
- Usuário locatário: `lucas@triluga.local` / `User123!`

## Wireframes

Os wireframes textuais mobile first estão em [docs/wireframes.md](./docs/wireframes.md).

## Privacidade e LGPD

- política resumida: [docs/privacy-policy.md](./docs/privacy-policy.md)
- operação e atendimento: [docs/lgpd-operations.md](./docs/lgpd-operations.md)
- retenção de dados: [docs/data-retention.md](./docs/data-retention.md)
- playbook de QA: [docs/qa-playbook.md](./docs/qa-playbook.md)

## Deploy

Guia para subir tudo no Render em [docs/deploy-render.md](./docs/deploy-render.md).

Guia alternativo para frontend no Vercel e backend no Railway em [docs/deploy-vercel-railway.md](./docs/deploy-vercel-railway.md).

## Releases

- release notes 2.1.0: [docs/releases/v2.1.0.md](./docs/releases/v2.1.0.md)
- release notes 2.0.0: [docs/releases/v2.0.0.md](./docs/releases/v2.0.0.md)
- release notes 0.7.0: [docs/releases/v0.7.0.md](./docs/releases/v0.7.0.md)
- release notes 0.6.0: [docs/releases/v0.6.0.md](./docs/releases/v0.6.0.md)
- release notes 0.4.0: [docs/releases/v0.4.0.md](./docs/releases/v0.4.0.md)
- release notes 0.3.0: [docs/releases/v0.3.0.md](./docs/releases/v0.3.0.md)
- release notes 0.2.0: [docs/releases/v0.2.0.md](./docs/releases/v0.2.0.md)

## iOS com Capacitor

Guia para abrir o Triluga no Xcode e testar em iPhone em [docs/ios-capacitor.md](./docs/ios-capacitor.md).
