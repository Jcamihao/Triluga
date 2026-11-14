# HANDOFF — Triluga

Última atualização: 2026-11-13. Quem continuar o trabalho deve ler este arquivo inteiro, depois o plano de assinaturas, e atualizar este arquivo ao fim de cada task.

## 1. Projeto

Triluga é um marketplace de aluguel de veículos entre pessoas e locadoras (anúncios, busca, chat, avaliações, destaque pago de anúncio, painel do dono, admin). O princípio que mais pesa nas decisões: o servidor é a fonte da verdade (limites, preços e estado de pagamento nunca vêm do cliente), e nenhum dado de pagamento sensível (CPF, cartão) passa pelo app.

## 2. Repositório

- Caminho local: `/home/caminhao/coding/codeStage/Triluga`
- Remoto: `git@github.com:Jcamihao/Triluga.git` (origin). Branch: `master`.
- Convenção de commit: Conventional Commits em português (`feat(billing): ...`, `fix(preco): ...`, `docs/chore: ...`), com o trailer `Co-Authored-By` do agente. Caminhos explícitos no `git add`; nunca `--amend`, `reset`, `rebase` nem `add -A`. `index.lock` = esperar e repetir.
- Estado do git em 2026-11-13: único item pendente é `docs/superpowers/plans/2026-11-13-assinaturas.md` (não rastreado) e este handoff. Tasks 1 e 2 do billing commitadas (ver seção 6).
- Último commit: `a4755c2 docs(preco): release v2.9.0 alinhada ao frontend corrigido`. Os anteriores são a entrega do preço por diária (v2.9.0).

## 3. Stack

- Backend: NestJS 10, Prisma 5.22, PostgreSQL, Jest. Pasta `backend/`, versão 2.28.0.
- Frontend: Angular 16 standalone, Karma. Pasta `frontend/`, versão 2.27.0. O app duplica telas em componentes desktop e mobile (padrão `*-desktop.component` / `*-mobile.component` com uma base compartilhada).
- Serviços externos: Asaas (cobrança do destaque por PIX, já em produção de código; assinatura é o trabalho atual), FIPE.
- Outros projetos de que depende: nenhum em runtime. O billing do projeto irmão **Lumen** é a referência de porte: `/home/caminhao/coding/codeStage/Lumen/backend/src/billing/` (o plano cita `/home/caminhao/codeStage/Lumen`, caminho errado; o certo é o com `coding/`). O Lumen já foi validado no sandbox real do Asaas em 2026-11-13.

## 4. Como rodar

- Variáveis de ambiente do Asaas (só nomes): `ASAAS_API_KEY`, `ASAAS_BASE_URL` (padrão sandbox `https://api-sandbox.asaas.com/v3`), `ASAAS_WEBHOOK_TOKEN`, `ASAAS_TIMEOUT_MS`, `FRONTEND_URL`. Novas (já nos arquivos de exemplo, compose e render): `BILLING_ENABLED` e `BILLING_PRICE_{PROFESSIONAL,FLEET}_{MONTHLY,YEARLY}`. O `docker-compose.yml` só repassa o que está na lista `environment`; `render.yaml`, `.env.example` e `backend/.env.example` também precisam listar.
- Backend (em `backend/`): `npx jest`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint:ci`, `npm run build`.
- Frontend (em `frontend/`): `CHROME_BIN=$(ls ~/.cache/puppeteer/chrome/*/chrome-linux64/chrome | head -1) npx ng test --watch=false --browsers=ChromeHeadless` e `npx ng build`. Há 3 falhas conhecidas e antigas em `RegisterPageComponent` (`formatPhone is not a function`); não são do billing.
- Linha de base verificada em 2026-11-13: backend `jest` = 14 suítes, 275 testes (antes do billing). Após a Task 4: 22 suítes, 383 testes, todos verdes; `tsc` e `lint:ci` limpos. `npm run build` do backend verde após a Task 4. Frontend **não foi rodado** nesta sessão.
- Grafo de código: `graphify query "<pergunta>"` antes de explorar; `graphify update .` depois de mexer em código (uma vez, nunca em paralelo).

## 5. Planos

- Fonte única da ordem de trabalho: `docs/superpowers/plans/2026-11-13-assinaturas.md` (12 tasks em 3 fases, com checkboxes). Spec: `docs/superpowers/specs/2026-10-15-assinaturas-design.md`.
- Decisões do dono já tomadas (2026-10-15): conta grátis com 3 anúncios (`isActive` e `isPublished`); dois planos pagos (Profissional até 10, Frota ilimitado), mensal ou anual; só cartão, checkout hospedado do Asaas; excedente continua no ar (o limite só impede criar e reativar); flag `BILLING_ENABLED` desligada por padrão; tolerância de 7 dias só para assinatura paga.
- Preços (R$ 29,90/299,00 e 79,90/799,00) são PROVISÓRIOS: o dono define.
- Entregas anteriores: destaque pago via Asaas (v2.8.0), preço por diária (v2.9.0).

## 6. Onde parou

- Billing/assinaturas: spec e plano escritos e revisados. **Task 1 feita** (commit `0c17d88`: `backend/src/billing/plans.catalog.ts` e `access.util.ts` com specs; 34 testes verdes, tsc e lint limpos, conferido pelo agente principal). **Task 2 feita** (dev `1ac58af`; revisão sonnet `21c7562`, 15+ mutantes mortos): enums e modelos `Subscription`/`BillingEvent` no Prisma, migration `20261113120000_billing_subscriptions` (só cria objetos), `PlanLimitException`, `EntitlementsService`, `billingConfig`. Conferido pelo agente principal: jest completo 18 suítes / 333 testes verdes, tsc e lint:ci limpos. **Task 3 feita** (dev `3a3ab85`; revisão sonnet `cd25d3f`, 13 mutantes + 2 de DI mortos; só testes foram adicionados, código de produção sem mudança): `VehiclesService.create` e `update` chamam `EntitlementsService.assertCanPublish` (create publicado; update só na transição `isPublished` false->true em anúncio `isActive`), `BillingModule` criado com `EntitlementsService`, `VehiclesModule` importa `BillingModule`. Auditoria de caminhos que tornam um anúncio contado: só esses dois, nenhum novo. Conferido pelo agente principal: jest completo 19 suítes / 349 testes, tsc e lint:ci limpos. **Task 4 feita** (dev `46095f1`; revisão sonnet `ccd9843`, 19 mutantes, 2 sobreviventes mortos com testes novos): `BillingService`, `BillingController` (`GET /billing/plans` público, `GET /billing/me`, `GET/POST /billing/admin/grants` e `DELETE /billing/admin/grants/:id` só ADMIN), `CreateGrantDto`, `BillingModule` importado no `app.module`, variáveis `BILLING_ENABLED` e `BILLING_PRICE_*` no compose, render e `.env.example`. A revisão removeu o bloqueio de concessão duplicada que o haiku portou do Lumen (impedia renovar), tornou a data `endsAt` estrita (rejeita `2026-02-31`) e trata data inválida com 400. Conferido pelo agente principal: jest completo 22 suítes / 383 testes, tsc, lint:ci e build limpos. **Fase 1 (sem cobrar) concluída no backend.** Próxima: Task 5 (mover `AsaasClient`). **Não verificado até aqui:** app real com Postgres/Redis, contrato HTTP 403 `PLAN_LIMIT` de ponta a ponta (só a exception e o testing module). Nota: o `ValidationPipe` usa `enableImplicitConversion`, então `"false"` em campo booleano vira `true`; não burla o limite, mas é pré-existente. Ainda não existe `backend/src/asaas/`. **Não verificado:** a migration não foi aplicada num Postgres que tenha as migrations anteriores mais o drift abaixo; só em banco descartável.
- **Drift pré-existente de migrations (decisão do dono, fora do plano):** `Report`, `AuditLog`, `FeaturedOrder` e algumas colunas existem no `schema.prisma` mas nenhuma migration as cria (a produção nasceu parcialmente de `db push`; o `backend/Dockerfile` contorna no start). Um `migrate deploy` em banco zerado não cria essas tabelas. A migration de billing intencionalmente não inclui esse drift. Última migration: `20261015120000_vehicle_daily_rate_min_rental`.
- O `AsaasClient` atual está em `backend/src/featured/asaas.client.ts` (só destaque PIX); a Task 5 o move para `backend/src/asaas/`.
- Ambiente: nenhum servidor, container ou banco de assinatura foi subido nesta sessão. Não verificado: webhook real do Asaas (payload e header reais nunca vistos), checkout recorrente na conta de produção do Asaas do Triluga.

## 7. O que falta (ordem do plano)

1. Fase 1 (sem cobrar): ~~T1 catálogo e acesso~~ (feita); ~~T2 schema, migration e `EntitlementsService`~~ (feita); ~~T3 limite ao criar/republicar~~ (feita); ~~T4 `BillingService`, rotas de leitura e concessões~~ (feita).
2. Fase 2 (cobrança): T5 mover `AsaasClient`; T6 checkout recorrente e assinatura no cliente; T7 assinar, sincronizar, cancelar; T8 webhook e convivência com o do destaque.
3. Fase 3: T9 serviço e aviso de limite no frontend; T10 página `/plano`; T11 admin e preços na landing; T12 ponta a ponta, sandbox real, docs, versões (v2.10.0).
- Dependências do dono para ligar em produção: preços finais, Termos de uso, Política de Privacidade e política de reembolso publicados, ativação do checkout recorrente na conta Asaas de produção, registro de **dois** webhooks no painel do Asaas com o mesmo `ASAAS_WEBHOOK_TOKEN`.

## 8. Desafios e riscos

- Corrida aceita: duas criações simultâneas no limite podem passar em 1 anúncio (sem lock, documentado no plano).
- Bugs reais do Lumen a não repetir: `sync` rebaixando assinante em dia; checkout reaproveitado de plano/ciclo errado.
- O Asaas recusa `localhost` nas URLs de retorno do checkout e exige `items` e `subscription.nextDueDate` no corpo (validado no sandbox do Lumen).
- Os dois webhooks (destaque e billing) recebem eventos `PAYMENT_*` do mesmo Asaas; cada um precisa ignorar o que não é dele.
- Nada hoje escreve `Vehicle.expiresAt`, então o job de vencimento não desativa nada ainda.

## 9. Decisões abertas do dono (perguntar, não decidir)

Preços e limites finais; textos de Termos/Privacidade/reembolso; quando ligar `BILLING_ENABLED`; PIX para assinatura depois; se a conta de produção do Asaas precisa de ativação do checkout recorrente.

## 10. Regras do dono e convenções

- Nunca fazer push, deploy, nem pôr segredo (chave do Asaas) em arquivo, commit ou chat. Chave só por variável de ambiente.
- Commit só quando o fluxo do projeto já está em commits por task (o plano manda commitar a cada task, com caminhos explícitos).
- Subagentes: quem desenvolve = `haiku`; revisão e correção = `sonnet`, obrigatória nas Tasks 2, 3, 7 e 8 (limite, token, webhook). Um subagente por vez, com brief e contrato completos. O agente principal confere tudo (diff, testes, build, lint, integração real e `ponytail-review`) antes de dar como pronto.
- Backend e frontend só se encontram no "Contrato HTTP" do plano.
- Respostas ao dono: curtas, assertivas, com recomendação, terminando com lista do que falta, recomendação e um próximo passo.

## 11. Onde estão os detalhes

- Plano e spec de assinaturas: `docs/superpowers/plans/2026-11-13-assinaturas.md`, `docs/superpowers/specs/2026-10-15-assinaturas-design.md`.
- Destaque via Asaas: `docs/superpowers/specs/2026-10-11-destaque-asaas-design.md`, `docs/superpowers/plans/2026-10-11-destaque-asaas.md`, scripts de sandbox em `backend/scripts/asaas-sandbox/`.
- Releases e runbooks: `docs/releases/`, `docs/runbooks/`. Relatório de carga e pentest: `docs/reports/2026-11-02-carga-pentest-triluga.md`.
- Design system: `DESIGN_SYSTEM.md`. QA: `docs/qa-playbook.md`. Grafo: `graphify-out/`.
