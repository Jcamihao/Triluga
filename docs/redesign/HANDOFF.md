# Handoff — Mapa de telas e screenshots para redesign

Data: 2026-11-12. Objetivo: levantar todas as páginas do app e gerar prints (desktop 1440px e mobile 390px) para usar no Claude Design.

## Onde estão os prints
`screenshots-redesign/` (raiz do repo), 45 PNGs: `NN-nome-desktop.png` / `NN-nome-mobile.png`.

## Telas (frontend Angular 16 + Tailwind, rotas em `frontend/src/app/app.routes.ts`)

| # | Rota | Acesso | Conteúdo |
|---|---|---|---|
| 01 | `/` | público | Hero com busca, como funciona (Busca/Contata/Fecha), coleções, destaques da semana, grade de veículos, bloco institucional |
| 02 | `/search` | público | Lista de veículos com cards, filtros (lateral no desktop, modal no mobile) |
| 03 | `/vehicles/:slug` | público | Galeria, specs, preço dia/semana/mês, dono, avaliações, similares, chat/WhatsApp |
| 04 | `/compare` | público | Comparação lado a lado (até 4 veículos) |
| 05 | `/chat` | público* | Lista de conversas |
| 06 | `/chat/:id` | público* | Conversa aberta |
| 07 | `/favorites` | login | Favoritos + comparação |
| 08 | `/profile` | login | Perfil: dados pessoais, foto, progresso do perfil |
| 09 | `/users/:id` | público | Perfil público: avaliações, anúncios ativos |
| 10 | `/anunciar-carro` | login + e-mail verificado | Painel do proprietário + wizard de anúncio (dados, fotos/preço, condições, destaque pago) |
| 11 | `/admin` | ADMIN | Visão Geral, Gestão, Auditoria |
| 12–16 | `/auth/login`, `register`, `forgot-password`, `reset-password`, `verify-email` | público | Fluxo de autenticação |
| 17 | `/privacy`, `/terms` | público | Política e Termos |
| 18 | `/privacy-center` | login | Consentimento analytics, exportar dados, pedidos LGPD |
| 20–23 | extras | — | Admin Gestão, Admin Auditoria, modal de filtros (mobile), wizard etapa 1 |

Componentes compartilhados: web-header, web-footer, bottom-nav (mobile), vehicle-card, compare-tray, filter-modal, banner de privacidade.
\* O chat exige sessão para carregar dados, embora a rota não tenha guard.

## Como os prints foram gerados
Sem backend: `ng serve` + Playwright com a API (`/api/v1/**`) mockada em `docs/redesign/generate-screenshots.js`. Para rodar:
1. `cd frontend && npm ci && npx ng serve --port 4200`
2. Desativar **temporariamente** os guards em `frontend/src/app/core/guards/*.ts` (inserir `return true;` no início). Não commitar.
3. `node docs/redesign/generate-screenshots.js` (ajustar `OUT`; `ONLY=01-home,...` filtra telas).
O script usa o proxy do ambiente (`HTTPS_PROXY`) para carregar as fontes do Google.

## Limitações
- Dados 100% fictícios; wizard capturado só na etapa 1; filtros desktop não têm print próprio (já aparecem na lateral).
- Backend não foi executado (requer Postgres/Redis/MinIO).
