# Assinaturas do Triluga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limitar a conta grátis a 3 anúncios e vender dois planos pagos (Profissional e Frota) por assinatura recorrente no cartão via Asaas, com a flag `BILLING_ENABLED` desligada por padrão.

**Architecture:** Módulo `backend/src/billing/` onde o resto do app só pergunta ao `EntitlementsService` (nunca ao Asaas). O `AsaasClient` sai de `featured/` para um módulo compartilhado `backend/src/asaas/` e ganha checkout recorrente e assinatura. Estado da assinatura vem sempre de `reconcileSubscription` (webhook e `sync` usam a mesma função). O frontend ganha `/plano`, tratamento do `PLAN_LIMIT` ao publicar e um bloco no admin.

**Tech Stack:** NestJS 10, Prisma 5.22/PostgreSQL, Jest, Angular 16 standalone (padrão desktop/mobile duplicado), Karma.

**Spec:** `docs/superpowers/specs/2026-10-15-assinaturas-design.md`. Fonte do porte: `/home/caminhao/codeStage/Lumen/backend/src/billing/` (já validado no sandbox real em 2026-11-13; ler junto, adaptando nomes de plano).

## Global Constraints

- Grátis = 3 anúncios, contando `Vehicle` do dono com `isActive = true` **e** `isPublished = true`. Profissional = até 10. Frota = ilimitado.
- Preços provisórios, vindos do catálogo e sobrescritos por `BILLING_PRICE_<PLANO>_<CICLO>` (`PROFESSIONAL`/`FLEET` × `MONTHLY`/`YEARLY`): Profissional R$ 29,90 mensal e R$ 299,00 anual; Frota R$ 79,90 e R$ 799,00. Valor da variável inválido (vazio, NaN, ≤ 0) cai no padrão.
- Só cartão, checkout hospedado do Asaas, **sem `customerData`**; o app nunca vê CPF nem cartão. `externalReference` = id da `Subscription` local.
- Excedente continua no ar: o limite só impede **criar e reativar**; nunca apaga nem despublica.
- Tolerância de atraso: 7 dias, só para assinatura paga (`ASAAS`); concessão (`GRANT`) não tem. `PENDING` e `EXPIRED` nunca dão acesso.
- Erro de limite: HTTP 403 com corpo `{ statusCode: 403, error: "Forbidden", code: "PLAN_LIMIT", limit, used, plan, message }`.
- Webhook: token `asaas-access-token` em tempo constante, **fail closed** (sem token configurado recusa tudo), `@HttpCode(200)`, `@SkipThrottle()`, payload gravado já sanitizado, falha ao processar = 5xx.
- Flag `BILLING_ENABLED` (padrão `false`) lida no backend e exposta em `GET /billing/plans`; ligar não exige rebuild do frontend. Todas as variáveis novas vão em `docker-compose.yml` (lista `environment`), `render.yaml`, `.env.example` e `backend/.env.example`.
- Migration normal do Prisma, aditiva. Commits novos com caminhos explícitos; nunca `--amend`, `reset`, `rebase`, `add -A`. Trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Não fazer push nem deploy.

## Decisões deste plano (a spec não fechava)

- `Subscription` ganha `asaasCheckoutLink String?` (reaproveitar o mesmo link) e `latestInvoiceUrl String?` (botão "Regularizar pagamento"); a spec usava os dois fluxos sem os campos.
- Ids de plano no código: `'FREE' | 'PROFESSIONAL' | 'FLEET'`; `FREE` só existe no catálogo (nunca vira linha no banco).
- Limite de taxa de `checkout` (5/hora) e `sync` (10/hora) por `@Throttle` do Nest, que conta por IP, como já faz o `auth.controller`. A spec diz "por usuário"; aceito por ser o padrão do projeto.
- Corrida: duas criações simultâneas no limite podem ultrapassar em 1 anúncio. Aceito e documentado; sem lock.
- Nada hoje escreve `Vehicle.expiresAt`, então o job de vencimento não desativa nada ainda. Auditoria dos caminhos que tornam um anúncio "contado" (verificada no código): só `VehiclesService.create` (padrão `isPublished: true`, `isActive` nasce `true`) e `VehiclesService.update` com `isPublished` de `false` para `true` num anúncio `isActive`. `remove`, `admin.service` (L119), `reports.service` (L125) e `listing-expiry.service` só desativam. O DTO não aceita `isActive` (`forbidNonWhitelisted: true`).

## Contrato HTTP (backend e frontend)

```
GET  /billing/plans   (público) -> { enabled: boolean, plans: [{ id: 'FREE'|'PROFESSIONAL'|'FLEET', label: string, adLimit: number|null, sellable: boolean, prices: { MONTHLY: number, YEARLY: number } | null }] }
GET  /billing/me      -> { enabled, plan, status: 'PENDING'|'ACTIVE'|'PAST_DUE'|'CANCELED'|'EXPIRED'|null, source: 'ASAAS'|'GRANT'|null, interval: 'MONTHLY'|'YEARLY'|null, currentPeriodEnd: string|null, cancelAtPeriodEnd: boolean, latestInvoiceUrl: string|null, usage: { enforced: boolean, plan, ads: { used: number, limit: number|null } } }
POST /billing/checkout  { plan: 'PROFESSIONAL'|'FLEET', interval: 'MONTHLY'|'YEARLY' } -> { link: string }
POST /billing/sync    -> 201, corpo vazio     POST /billing/cancel -> 201, corpo vazio
POST /billing/webhooks/asaas  (público + token) -> { ok: true }
GET /billing/admin/grants -> [{ id, email, plan, currentPeriodEnd: string|null, status, createdAt }]
POST /billing/admin/grants { email, plan: 'PROFESSIONAL'|'FLEET', endsAt?: ISO } ; DELETE /billing/admin/grants/:id    (ADMIN)
```

## Review Focus

Entradas que a spec implica e nenhuma task testaria por conta própria; cada linha tem o teste na task dona.

1. Publicar → despublicar → republicar para burlar o limite: republicar com `used >= limit` dá `PLAN_LIMIT`; editar anúncio já contado nunca bloqueia (Task 3).
2. `sync` clicado no meio do ciclo não rebaixa quem está `ACTIVE` em dia (bug real do Lumen) (Task 7).
3. Checkout reaproveitado só do mesmo plano **e** ciclo; trocar mensal→anual no mesmo dia devolve link novo (bug real do Lumen) (Task 7).
4. Webhook duplicado (mesmo `id` de evento) responde 200 sem efeito; token ausente/errado/servidor sem token recusa; payload gravado sem CPF, cartão, e-mail nem telefone (Task 8).
5. Os dois webhooks no mesmo Asaas: pagamento com `payment.subscription` não gera aviso nem ativa nada no destaque; pagamento sem `subscription` é ignorado pelo billing (Task 8).
6. `BILLING_ENABLED=false`: nenhum limite aplicado, `GET /billing/me` responde (`enforced: false`), `POST /billing/checkout` recusa com 400 (Tasks 2, 4 e 7).
7. Dono com mais de 3 anúncios hoje e plano grátis: tudo continua no ar, só não publica novo (Task 3).

Execução (regras do dono): subagente que desenvolve = `haiku`; revisão e correção = `sonnet`, **obrigatória** nas Tasks 2, 3, 7 e 8 (limite, token, webhook); um subagente por vez; backend e frontend só se encontram no Contrato HTTP acima.

---

## Fase 1: núcleo sem cobrar

### Task 1: Catálogo e regras de acesso (puro)

**Files:**
- Create: `backend/src/billing/plans.catalog.ts`, `backend/src/billing/access.util.ts`
- Test: `backend/src/billing/plans.catalog.spec.ts`, `backend/src/billing/access.util.spec.ts`

**Interfaces:**
- Produces:
  - `type PlanId = 'FREE' | 'PROFESSIONAL' | 'FLEET'`; `type BillingIntervalId = 'MONTHLY' | 'YEARLY'`
  - `interface PlanDefinition { id: PlanId; label: string; adLimit: number | null; sellable: boolean; prices: Record<BillingIntervalId, number> | null }`
  - `const PLAN_RANK: Record<PlanId, number>` (FREE 0, PROFESSIONAL 1, FLEET 2)
  - `getCatalog(env?: NodeJS.ProcessEnv): Record<PlanId, PlanDefinition>` e `getPlan(id: PlanId, env?): PlanDefinition`
  - `const GRACE_DAYS = 7`; `interface SubscriptionLike { plan: 'PROFESSIONAL' | 'FLEET'; status: 'PENDING'|'ACTIVE'|'PAST_DUE'|'CANCELED'|'EXPIRED'; currentPeriodEnd: Date | null; source: 'ASAAS' | 'GRANT' }`
  - `subscriptionGrantsAccess(sub: SubscriptionLike, now: Date): boolean`; `pickEffectivePlan(subs: SubscriptionLike[], now: Date): PlanId`

- [ ] **Step 1: Write the failing tests.** Catálogo: FREE `adLimit` 3 e `prices` null; PROFESSIONAL 10 com 29.9/299; FLEET `adLimit` null com 79.9/799; `FREE.sellable` false, os outros true; `BILLING_PRICE_PROFESSIONAL_MONTHLY='39.9'` sobrescreve; `''`, `'abc'`, `'-1'` e `'0'` caem no padrão. Acesso (porte de `Lumen/backend/src/billing/access.util.spec.ts`): ACTIVE com fim futuro = acesso; ACTIVE vencido há 6 dias = acesso (tolerância) e há 8 dias = sem acesso; o mesmo vencido há 1 dia com `source: 'GRANT'` = sem acesso; ACTIVE `GRANT` com `currentPeriodEnd: null` = acesso; CANCELED com fim futuro = acesso e vencido = sem; PENDING e EXPIRED = sem; `pickEffectivePlan` devolve o maior plano com acesso e `'FREE'` quando nenhum.
- [ ] **Step 2: Run** `cd backend && npx jest src/billing/plans.catalog.spec.ts src/billing/access.util.spec.ts`. Expected: FAIL (módulos não existem).
- [ ] **Step 3: Implement** os dois arquivos com as assinaturas acima, portando `Lumen/backend/src/billing/{plans.catalog,access.util}.ts` (sem `currentMonthWindow`, sem `seats`, sem Selah). A leitura de `BILLING_PRICE_*` é a mesma do Lumen.
- [ ] **Step 4: Run** os mesmos testes. Expected: PASS.
- [ ] **Step 5: Commit** `git add backend/src/billing/plans.catalog.ts backend/src/billing/plans.catalog.spec.ts backend/src/billing/access.util.ts backend/src/billing/access.util.spec.ts` + `feat(billing): catálogo de planos e regras de acesso`.

### Task 2: Schema, migration e `EntitlementsService`

**Files:**
- Modify: `backend/prisma/schema.prisma` (enums `BillingPlan`, `SubscriptionStatus`, `SubscriptionSource`, `BillingInterval`; models `Subscription` e `BillingEvent` da spec seção 6 **mais** `asaasCheckoutLink String?` e `latestInvoiceUrl String?`; relação `subscriptions Subscription[]` em `User`)
- Create: `backend/prisma/migrations/20261113120000_billing_subscriptions/migration.sql` (gerada), `backend/src/billing/plan-limit.exception.ts`, `backend/src/billing/entitlements.service.ts`, `backend/src/config/billing.config.ts`
- Modify: `backend/src/app.module.ts` (registrar `billingConfig` ao lado de `asaasConfig`, linha ~57)
- Test: `backend/src/billing/entitlements.service.spec.ts`, `backend/src/config/billing.config.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`getPlan`, `pickEffectivePlan`).
- Produces:
  - `billingConfig` = `registerAs('billing', () => ({ enabled: process.env.BILLING_ENABLED === 'true' }))`
  - `class PlanLimitException extends ForbiddenException` com `constructor(input: { limit: number; used: number; plan: PlanId })`, corpo conforme Global Constraints e `message` = `Você atingiu o limite de ${limit} anúncios do plano ${label}. Veja os planos em Plano.`
  - `EntitlementsService`: `isEnforced(): boolean`; `resolvePlan(userId: string): Promise<PlanId>` (grátis se flag desligada **não**: devolve o plano real; só `assertCanPublish` e `usage.enforced` olham a flag); `getUsage(userId: string): Promise<{ enforced: boolean; plan: PlanId; ads: { used: number; limit: number | null } }>`; `assertCanPublish(userId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests** (Prisma mockado, padrão dos specs do projeto). `assertCanPublish`: flag desligada nunca lança, mesmo com 50 anúncios; flag ligada, plano grátis e `count` 2 passa; `count` 3 lança `PlanLimitException` com `limit: 3, used: 3, plan: 'FREE'`; `count` 40 também lança (dono com excedente); plano FROTA nunca lança. `count` é chamado com `where: { ownerId, isActive: true, isPublished: true }`. `getUsage`: `limit` null para Frota; `enforced` reflete a flag. `resolvePlan` usa só assinaturas do usuário e `pickEffectivePlan`. `billingConfig`: `'true'` liga; ausente, `'false'` e `'TRUE '` desligam.
- [ ] **Step 2: Run** `cd backend && npx jest src/billing/entitlements.service.spec.ts src/config/billing.config.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Edit the schema** (spec seção 6 + os dois campos), gerar a migration com um Postgres descartável (`embedded-postgres`: aplicar `migrate deploy` até a anterior, depois `prisma migrate dev --name billing_subscriptions --create-only`), conferir que o SQL só **cria** objetos. Implementar `PlanLimitException`, `EntitlementsService` (injeta `PrismaService` e `ConfigService`) e `billingConfig`.
- [ ] **Step 4: Run** os testes da step 2, `npx prisma validate`, `npx tsc --noEmit -p tsconfig.json`. Expected: PASS e `The schema ... is valid`. Rodar `npx prisma migrate diff --from-url <throwaway com todas as migrations> --to-schema-datamodel prisma/schema.prisma --script`: saída `-- This is an empty migration.`
- [ ] **Step 5: Commit** `git add backend/prisma/schema.prisma backend/prisma/migrations/20261113120000_billing_subscriptions backend/src/billing/plan-limit.exception.ts backend/src/billing/entitlements.service.ts backend/src/billing/entitlements.service.spec.ts backend/src/config/billing.config.ts backend/src/config/billing.config.spec.ts backend/src/app.module.ts` + `feat(billing): modelos, migration e EntitlementsService`.

### Task 3: Limite ao criar e ao republicar anúncio

**Files:**
- Modify: `backend/src/vehicles/vehicles.service.ts` (`create` ~L574 e `update` ~L653), `backend/src/vehicles/vehicles.module.ts`, `backend/src/billing/billing.module.ts` (criar só com `providers/exports: [EntitlementsService]`; Task 4 completa)
- Test: `backend/src/vehicles/vehicles.write.spec.ts` (estender)

**Interfaces:**
- Consumes: `EntitlementsService.assertCanPublish(userId)` (Task 2).
- Produces: `VehiclesService` lança `PlanLimitException` (403) em `create` quando `dto.isPublished ?? true` e em `update` quando `dto.isPublished === true` num anúncio que hoje tem `isPublished = false` e `isActive = true`.

- [ ] **Step 1: Write the failing tests** em `vehicles.write.spec.ts`, mockando `EntitlementsService`. `create` com `isPublished` omitido chama `assertCanPublish(ownerId)` **antes** de `prisma.vehicle.create`; `create` com `isPublished: false` (rascunho) não chama; se `assertCanPublish` rejeita, `prisma.vehicle.create` não é chamado. `update`: `isPublished: true` em anúncio despublicado e ativo chama `assertCanPublish`; o mesmo em anúncio já publicado **não** chama (editar anúncio contado nunca bloqueia); `isPublished: true` em anúncio despublicado e `isActive: false` não chama; update sem `isPublished` não chama; rejeição impede `prisma.vehicle.update`.
- [ ] **Step 2: Run** `cd backend && npx jest src/vehicles/vehicles.write.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Injetar `EntitlementsService` em `VehiclesService`; `VehiclesModule` importa `BillingModule`. Em `update`, usar o `Vehicle` que `ensureVehicleOwnership` já devolve para decidir a transição; a checagem acontece antes do `prisma.vehicle.update`.
- [ ] **Step 4: Run** `npx jest src/vehicles` e `npx tsc --noEmit -p tsconfig.json`. Expected: PASS.
- [ ] **Step 5: Commit** `git add backend/src/vehicles/vehicles.service.ts backend/src/vehicles/vehicles.module.ts backend/src/vehicles/vehicles.write.spec.ts backend/src/billing/billing.module.ts` + `feat(billing): limite de anúncios ao criar e republicar`.

### Task 4: `BillingService`, rotas de leitura e concessões do admin

**Files:**
- Create: `backend/src/billing/billing.service.ts`, `backend/src/billing/billing.controller.ts`, `backend/src/billing/dto/create-grant.dto.ts`
- Modify: `backend/src/billing/billing.module.ts`, `backend/src/app.module.ts` (importar `BillingModule`), `docker-compose.yml`, `render.yaml`, `.env.example`, `backend/.env.example` (adicionar `BILLING_ENABLED` e as quatro `BILLING_PRICE_*`)
- Test: `backend/src/billing/billing.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `BillingService.getPlans(): { enabled: boolean; plans: PlanView[] }`; `getMe(userId: string): Promise<BillingMeView>` (forma do Contrato HTTP; `usage` vem de `getUsage`); `listGrants()`, `createGrant(adminId: string, dto: CreateGrantDto)`, `revokeGrant(id: string)`. Controller com `GET plans` (`@Public()`), `GET me`, e as três rotas `admin/grants` com `@Roles(Role.ADMIN)`. `CreateGrantDto { email: string; plan: 'PROFESSIONAL' | 'FLEET'; endsAt?: string }`.

- [ ] **Step 1: Write the failing tests** (porte de `Lumen/backend/src/billing/billing.service.spec.ts`). `getPlans`: `enabled` espelha a flag; FREE vem com `prices: null`. `getMe`: sem assinatura → `plan: 'FREE'`, `status: null`; com concessão `GRANT` sem fim → `plan` da concessão, `currentPeriodEnd: null`; assinatura CANCELED com fim futuro → `plan` pago e `cancelAtPeriodEnd: true`; `latestInvoiceUrl` repassado. `createGrant`: e-mail inexistente → `NotFoundException`; grava `source: 'GRANT'`, `status: 'ACTIVE'`, `grantedByUserId = adminId`, `currentPeriodEnd` de `endsAt` ou `null`. `revokeGrant`: marca `status: 'EXPIRED'` e mantém a linha; id de assinatura `ASAAS` → `BadRequestException`.
- [ ] **Step 2: Run** `cd backend && npx jest src/billing/billing.service.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** serviço, controller (`@ApiTags('billing')`, rota base `billing`) e módulo (importa `PrismaModule` como os outros, exporta `EntitlementsService` e `BillingService`). Porte de `Lumen/backend/src/billing/billing.service.ts`.
- [ ] **Step 4: Run** `npx jest src/billing`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint:ci`, `npm run build`. Expected: tudo verde.
- [ ] **Step 5: Commit** `git add backend/src/billing backend/src/app.module.ts docker-compose.yml render.yaml .env.example backend/.env.example` + `feat(billing): planos, meu plano e concessões do admin`.

---

## Fase 2: cobrança

### Task 5: Mover o `AsaasClient` para um módulo compartilhado

**Files:**
- Move (`git mv`): `backend/src/featured/asaas.client.ts` e `.spec.ts` → `backend/src/asaas/`
- Create: `backend/src/asaas/asaas.module.ts` (provê e exporta `AsaasClient`)
- Modify: `backend/src/featured/featured.module.ts` (importa `AsaasModule` em vez de listar `AsaasClient`), imports de `./asaas.client` em `featured.service.ts`, `featured.controller.ts` e specs do `featured`
- Test: os specs existentes (`asaas.client.spec.ts`, `featured.*.spec.ts`)

**Interfaces:**
- Produces: `AsaasModule`; `AsaasClient` e `AsaasClientError` exportados de `backend/src/asaas/asaas.client.ts` com **comportamento idêntico** ao de hoje.

- [ ] **Step 1: Run** `cd backend && npx jest src/featured` e anotar o total (linha de base).
- [ ] **Step 2: Move** os arquivos com `git mv`, criar o módulo, corrigir imports. `buildUserAgent()` lê `package.json` a dois níveis do arquivo: `src/asaas` e `dist/asaas` mantêm essa profundidade, conferir.
- [ ] **Step 3: Run** `npx jest src/featured src/asaas`, `npx tsc --noEmit -p tsconfig.json`, `npm run build`. Expected: mesmo total da linha de base, tudo verde.
- [ ] **Step 4: Commit** `git add backend/src/asaas backend/src/featured` (inclui a remoção) + `refactor(asaas): AsaasClient vira módulo compartilhado`.

### Task 6: `AsaasClient`: checkout recorrente e assinatura

**Files:**
- Modify: `backend/src/asaas/asaas.client.ts`
- Test: `backend/src/asaas/asaas.client.spec.ts`

**Interfaces:**
- Produces:
  - `interface CreateCheckoutParams { value: number; cycle: 'MONTHLY' | 'YEARLY'; itemName: string; itemDescription: string; externalReference: string; successUrl: string; cancelUrl: string; expiredUrl: string; minutesToExpire: number }`
  - `createCheckout(params: CreateCheckoutParams): Promise<{ id: string; link: string }>`
  - `getSubscription(id: string): Promise<{ id: string; deleted: boolean; nextDueDate: string; externalReference: string | null }>`
  - `findSubscriptionByExternalReference(ref: string): Promise<AsaasSubscription | null>`; `deleteSubscription(id: string): Promise<void>`

- [ ] **Step 1: Write the failing tests** (espionando `request`, como os testes existentes). `createCheckout` faz `POST /checkouts` com corpo contendo exatamente: `billingTypes: ['CREDIT_CARD']`, `chargeTypes: ['RECURRENT']`, `minutesToExpire`, `externalReference`, `callback: { successUrl, cancelUrl, expiredUrl }`, `items: [{ name: itemName, description: itemDescription, quantity: 1, value }]`, `subscription: { cycle, nextDueDate: <YYYY-MM-DD de hoje em America/Sao_Paulo> }`; **sem** `customerData` e **sem** `subscription.value`. Teste com relógio falso em `2026-11-14T01:30:00Z` espera `nextDueDate: '2026-11-13'`. `getSubscription` mapeia `deleted` ausente para `false`. `findSubscriptionByExternalReference` devolve `null` com `data: []`. POST não repete em 5xx (já é a regra do cliente); GET e DELETE repetem.
- [ ] **Step 2: Run** `cd backend && npx jest src/asaas`. Expected: FAIL.
- [ ] **Step 3: Implement** os quatro métodos. Corpo do checkout **validado no sandbox real** (2026-11-13, conta do Lumen): sem `items` o Asaas responde 400 "O campo 'items' é obrigatório"; sem `subscription.nextDueDate` responde 400 "O campo nextDueDate deve ser informado"; o valor cobrado e exibido vem de `items` (`subscription.value` é ignorado, mesmo com valor diferente); `localhost` nas URLs de retorno é recusado. Referência: `Lumen/backend/src/billing/asaas-client.ts`.
- [ ] **Step 4: Run** `npx jest src/asaas src/featured` e `npx tsc --noEmit -p tsconfig.json`. Expected: PASS.
- [ ] **Step 5: Commit** `git add backend/src/asaas/asaas.client.ts backend/src/asaas/asaas.client.spec.ts` + `feat(asaas): checkout recorrente e assinatura no AsaasClient`.

### Task 7: Assinar, sincronizar e cancelar

**Files:**
- Create: `backend/src/billing/billing-payments.service.ts`, `backend/src/billing/dto/create-checkout.dto.ts`
- Modify: `backend/src/billing/billing.controller.ts` (rotas `POST checkout`, `sync`, `cancel`), `backend/src/billing/billing.module.ts` (importa `AsaasModule`)
- Test: `backend/src/billing/billing-payments.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 1, 2 e 6.
- Produces:
  - `BillingPaymentsService.checkout(userId: string, dto: CreateCheckoutDto): Promise<{ link: string }>`; `sync(userId: string): Promise<void>`; `cancel(userId: string): Promise<void>`; método **público** `reconcileSubscription(local: Subscription): Promise<void>` (a Task 8 o reutiliza)
  - `CreateCheckoutDto { plan: 'PROFESSIONAL' | 'FLEET'; interval: 'MONTHLY' | 'YEARLY' }`
  - `@Throttle({ default: { ttl: 3600000, limit: 5 } })` em `checkout` e limite 10 em `sync`

- [ ] **Step 1: Write the failing tests** (Asaas e Prisma mockados; porte de `Lumen/backend/src/billing/billing-payments.service.spec.ts`). `checkout`: flag desligada → `BadRequestException`; já tem `ACTIVE`/`PAST_DUE` de plano igual ou maior → `BadRequestException`; `PENDING` com menos de 60 min do **mesmo plano e ciclo** e com `asaasCheckoutLink` → devolve o link sem chamar o Asaas; `PENDING` de **outro ciclo ou plano** → cria checkout novo; caso normal cria `Subscription` `PENDING`, chama `createCheckout` com `value` do catálogo, `externalReference` igual ao id local, `minutesToExpire: 60`, URLs `${FRONTEND_URL}/plano?checkout=sucesso|cancelado|expirado`, grava `asaasCheckoutId` e `asaasCheckoutLink`. `reconcileSubscription`: `deleted: true` → `CANCELED`; `nextDueDate` maior que o `currentPeriodEnd` (ou este nulo) → `ACTIVE`, `currentPeriodEnd = nextDueDate`, `pastDueSince: null`; senão `PAST_DUE` com `pastDueSince` preservado ou agora. `sync`: usuário `ACTIVE` com `currentPeriodEnd` futuro **não** chama o Asaas e não muda o status; `PAST_DUE` sempre reconsulta; linha sem `asaasSubscriptionId` busca por `findSubscriptionByExternalReference(local.id)` e grava o id achado. `cancel`: chama `deleteSubscription`, marca `cancelAtPeriodEnd: true` e `status: 'CANCELED'`; não altera `currentPeriodEnd`.
- [ ] **Step 2: Run** `cd backend && npx jest src/billing/billing-payments.service.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** (porte das partes `checkout`, `sync`, `cancel`, `reconcileSubscription` do Lumen, trocando `INDIVIDUAL` por `PROFESSIONAL`/`FLEET`). `itemName` = `Plano ${label} do Triluga` e `itemDescription` = `Assinatura mensal` ou `Assinatura anual`.
- [ ] **Step 4: Run** `npx jest src/billing`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint:ci`. Expected: PASS.
- [ ] **Step 5: Commit** `git add backend/src/billing` + `feat(billing): assinar, sincronizar e cancelar assinatura`.

### Task 8: Webhook do Asaas e convivência com o do destaque

**Files:**
- Modify: `backend/src/billing/billing-payments.service.ts` (método `processWebhookEvent`), `backend/src/billing/billing.controller.ts` (rota `POST webhooks/asaas`), `backend/src/featured/featured.service.ts` (`handleAsaasWebhook`, ~L291)
- Test: `backend/src/billing/billing-payments.service.spec.ts` (estender), `backend/src/featured/featured.service.spec.ts` (estender)

**Interfaces:**
- Consumes: `reconcileSubscription` (Task 7).
- Produces: `processWebhookEvent(token: string | undefined, payload: Record<string, unknown>): Promise<{ ok: true }>`; rota `@Public() @SkipThrottle() @HttpCode(200) @Post('webhooks/asaas')` lendo o header `asaas-access-token`.

- [ ] **Step 1: Write the failing tests.** Billing: token ausente, errado ou servidor sem `ASAAS_WEBHOOK_TOKEN` → `ForbiddenException` antes de tocar no banco; mesmo `id` de evento duas vezes → segunda chamada retorna `{ ok: true }` sem reprocessar; `CHECKOUT_PAID` resolve a assinatura local por `externalReference`, grava `asaasSubscriptionId`/`asaasCustomerId` e reconcilia; `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` reconciliam; `PAYMENT_OVERDUE` → `PAST_DUE` e grava `latestInvoiceUrl`; `SUBSCRIPTION_DELETED`/`SUBSCRIPTION_INACTIVATED` → `CANCELED`; `PAYMENT_REFUNDED` encerra na hora (`status: 'EXPIRED'`, `currentPeriodEnd` = agora) sem consultar o Asaas; evento desconhecido é registrado e ignorado; pagamento **sem** `payment.subscription` é ignorado; casa por `asaasSubscriptionId`/`asaasCustomerId`, nunca por `externalReference` do pagamento; o `payload` gravado em `BillingEvent` não contém `cpfCnpj`, `email`, `phone`, `mobilePhone` nem chaves de cartão (`creditCard*`); erro ao processar relança (5xx) e deixa `processedAt` nulo. Destaque: payload com `payment.subscription` preenchido retorna `{ ok: true, activated: 0 }` **sem** consultar `featuredOrder` e **sem** `logger.warn`.
- [ ] **Step 2: Run** `cd backend && npx jest src/billing src/featured`. Expected: FAIL.
- [ ] **Step 3: Implement** o webhook (porte de `processWebhookEvent` e dos `handle*` do Lumen, com a lista de chaves sensíveis ampliada para as acima) e o `return noop` antecipado no handler do destaque quando `nonEmptyString(payment.subscription)`, antes de qualquer busca.
- [ ] **Step 4: Run** `npx jest` (suíte completa), `npx tsc --noEmit -p tsconfig.json`, `npm run lint:ci`, `npm run build`. Expected: tudo verde.
- [ ] **Step 5: Commit** `git add backend/src/billing backend/src/featured/featured.service.ts backend/src/featured/featured.service.spec.ts` + `feat(billing): webhook do Asaas e convivência com o do destaque`.

---

## Fase 3: frontend e lançamento

### Task 9: Serviço, modelos e aviso de limite ao publicar

**Files:**
- Create: `frontend/src/app/core/services/billing-api.service.ts`, `frontend/src/app/core/utils/plan-limit.utils.ts`
- Modify: `frontend/src/app/core/models/domain.models.ts`, `frontend/src/app/features/owner-dashboard/owner-dashboard-page.base.ts` (erros de `saveVehicle` ~L844 e L913, e `saveVehicleAndFeatured`), `frontend/src/app/features/owner-dashboard/owner-dashboard-desktop.component.html` e `owner-dashboard-mobile.component.html`
- Test: `frontend/src/app/core/services/billing-api.service.spec.ts`, `frontend/src/app/core/utils/plan-limit.utils.spec.ts`, `frontend/src/app/features/owner-dashboard/owner-dashboard-page.base.spec.ts` (estender)

**Interfaces:**
- Produces: modelos `BillingPlanId`, `BillingPlansResponse`, `BillingMe` (formas do Contrato HTTP); `BillingApiService` com `getPlans()`, `getMe()`, `checkout(plan, interval): Observable<{ link: string }>`, `sync()`, `cancel()`, `listGrants()`, `createGrant(body)`, `revokeGrant(id)`; `isPlanLimitError(error: unknown): boolean` (true quando `error.error.code === 'PLAN_LIMIT'`).

- [ ] **Step 1: Write the failing tests.** Serviço: cada método chama o verbo e a URL do Contrato HTTP (`HttpTestingController`). `isPlanLimitError`: true para `{ status: 403, error: { code: 'PLAN_LIMIT' } }`; false para 403 sem código, 400 e `null`. Base do dono: quando o `create` falha com `PLAN_LIMIT`, `vehicleError` recebe a `message` do servidor e `planLimitReached` vira `true`; outro erro mantém `planLimitReached` falso.
- [ ] **Step 2: Run** `cd frontend && CHROME_BIN=$(ls ~/.cache/puppeteer/chrome/*/chrome-linux64/chrome | head -1) npx ng test --watch=false --browsers=ChromeHeadless`. Expected: FAIL nos testes novos.
- [ ] **Step 3: Implement.** Quando `planLimitReached`, os dois templates mostram, junto do erro, um link para `/plano` com o texto "Ver planos". Quando o `getMe()` responde `usage.enforced`, o contador "X de Y anúncios" aparece no cabeçalho do formulário de publicar (Y vira "ilimitado" se `limit` for nulo).
- [ ] **Step 4: Run** a suíte e `npx ng build`. Expected: só as 3 falhas conhecidas de `RegisterPageComponent` (`formatPhone is not a function`); build limpo.
- [ ] **Step 5: Commit** `git add frontend/src/app/core frontend/src/app/features/owner-dashboard` + `feat(billing): aviso de limite de anúncios ao publicar`.

### Task 10: Página `/plano`

**Files:**
- Create: `frontend/src/app/features/billing/plan-page/plan-page.component.ts`, `plan-page.base.ts`, `plan-page-desktop.component.{ts,html,scss}`, `plan-page-mobile.component.{ts,html,scss}`
- Modify: `frontend/src/app/app.routes.ts` (rota `plano` com `canActivate: [authGuard]`, carregando o componente de página)
- Test: `frontend/src/app/features/billing/plan-page/plan-page.base.spec.ts`

**Interfaces:**
- Consumes: `BillingApiService` e modelos (Task 9).
- Produces: componente de página que escolhe desktop/mobile igual a `owner-dashboard-page.component.ts` (`matchMedia('(max-width: 767px)')`); `PlanPageBase` com `me`, `plans`, `busy`, `error`, `confirming` e as ações `subscribe(plan, interval)`, `cancel()`, `sync()`.

- [ ] **Step 1: Write the failing tests** na base: `subscribe` chama `checkout` e navega para `link` (`window.location.assign`, injetado para teste); ao carregar com `?checkout=sucesso`, entra em `confirming` e consulta `getMe()` a cada 3 s por até 60 s, parando quando `status` vira `ACTIVE`; `?checkout=cancelado` e `expirado` não consultam e mostram a mensagem correspondente; `cancel()` chama `cancel` e recarrega `getMe()`; com `me.status === 'PAST_DUE'` e `latestInvoiceUrl` presente, expõe `invoiceUrl` para o botão "Regularizar pagamento"; com `enabled: false`, a página mostra "Planos ainda não disponíveis" e nenhum botão de assinar.
- [ ] **Step 2: Run** a suíte Karma (comando da Task 9). Expected: FAIL.
- [ ] **Step 3: Implement** seguindo o design system MD3 (`DESIGN_SYSTEM.md`) e a estrutura de `owner-dashboard-*`. A tela mostra uso ("2 de 3"), os planos com seletor mensal/anual, "Assinar", "Cancelar" (com "acesso até DD/MM") e, em atraso, "Regularizar pagamento". Datas com `formatDate` do projeto (cuidado com UTC: data só-dia não pode mostrar o dia anterior).
- [ ] **Step 4: Run** a suíte e `npx ng build`. Verificar no navegador headless (puppeteer-core com API falsa, como no preço por diária) desktop e mobile, claro e escuro, estados: grátis, pendente, ativo, em atraso, cancelado, flag desligada. Expected: build limpo, só as 3 falhas conhecidas.
- [ ] **Step 5: Commit** `git add frontend/src/app/features/billing frontend/src/app/app.routes.ts` + `feat(billing): página /plano`.

### Task 11: Admin, preços na landing e link de entrada

**Files:**
- Modify: `frontend/src/app/features/admin/admin-page.component.{ts,html}` (bloco "Conceder plano"), `frontend/src/app/features/home/` (faixa de preços, só quando `getPlans().enabled`), o menu/cabeçalho do usuário logado (link "Plano")
- Test: `frontend/src/app/features/admin/admin-page.component.spec.ts` (criar se não existir), spec do componente da home alterado

**Interfaces:**
- Consumes: `BillingApiService.listGrants/createGrant/revokeGrant/getPlans` (Task 9).

- [ ] **Step 1: Write the failing tests.** Admin: lista as concessões; conceder envia `{ email, plan, endsAt? }` e recarrega a lista; revogar chama `revokeGrant(id)`; erro 404 de e-mail inexistente mostra a mensagem. Home: com `enabled: false` nenhuma faixa de preços é renderizada; com `enabled: true` mostra Profissional e Frota com preço mensal.
- [ ] **Step 2: Run** a suíte Karma. Expected: FAIL.
- [ ] **Step 3: Implement.** A faixa da home e o link "Plano" só aparecem com `enabled`.
- [ ] **Step 4: Run** a suíte e `npx ng build`. Expected: só as 3 falhas conhecidas.
- [ ] **Step 5: Commit** `git add frontend/src/app/features/admin frontend/src/app/features/home` (+ arquivos do menu alterados, por caminho explícito) + `feat(billing): concessão de plano no admin e preços na landing`.

### Task 12: Passada ponta a ponta, docs e versões

**Files:**
- Create: `docs/releases/v2.10.0.md`, `docs/runbooks/assinaturas-deploy.md`, `docs/HANDOFF.md` (criar; regra do dono: todo projeto tem handoff)
- Modify: `backend/package.json` (2.28.0 → 2.29.0), `frontend/package.json` (2.27.0 → 2.28.0), `README.md` (seção de billing e variáveis), `docs/qa-playbook.md` (casos de assinatura)

- [ ] **Step 1: Ponta a ponta com Asaas falso.** Postgres descartável (`embedded-postgres` de `/home/caminhao/codeStage/Lumen/backend/node_modules`), `migrate deploy`, backend real com `BILLING_ENABLED=true`, Asaas falso local (`ASAAS_BASE_URL`). Percorrer: criar 3 anúncios → o 4º dá `PLAN_LIMIT` → `POST /billing/checkout` → webhook simulado `CHECKOUT_PAID` com o token → `GET /billing/me` mostra o plano → publicar o 4º → `cancel` → `PAYMENT_REFUNDED` → volta ao grátis sem apagar anúncio. Conferir no banco os estados e que `BillingEvent.payload` não tem dado pessoal.
- [ ] **Step 2: Sandbox real do Asaas.** Chave só em variável de ambiente (`ASAAS_API_KEY`), nunca em arquivo ou chat. `FRONTEND_URL` com domínio **público** em https (o Asaas recusa `localhost` nas URLs de retorno). Criar checkout pelo backend e abrir a página hospedada; pagar com o cartão de teste e um CPF válido de gerador; se a página recusar, criar cliente e assinatura direto pela API do sandbox com `externalReference` = id local e rodar `POST /billing/sync` (foi o caminho que funcionou no Lumen). Registrar no relatório o que **não** foi visto: webhook real depende de túnel público.
- [ ] **Step 3: Verificação completa.** `cd backend && npx jest && npx tsc --noEmit -p tsconfig.json && npm run lint:ci && npm run build`; `cd frontend && npx ng build` e Karma (só as 3 falhas conhecidas); `grep` confirmando que nenhuma chave aparece em arquivos rastreados.
- [ ] **Step 4: Docs e versões.** Release com o que mudou, variáveis novas e a migration; runbook de deploy (preflight read-only, `pg_dump` obrigatório, ordem backend+frontend juntos, registrar **dois** webhooks no painel do Asaas com o mesmo `ASAAS_WEBHOOK_TOKEN`, só ligar `BILLING_ENABLED` depois de Termos, Política de Privacidade e reembolso publicados, rollback); handoff com estado, o que não foi verificado e as decisões abertas (preços finais, conta de produção e se ela precisa de ativação do checkout recorrente, PIX depois, Termos).
- [ ] **Step 5: Commit** `git add docs/releases/v2.10.0.md docs/runbooks/assinaturas-deploy.md docs/HANDOFF.md README.md docs/qa-playbook.md backend/package.json frontend/package.json` + `docs/chore: release v2.10.0 (assinaturas), runbook e versões`. Rodar `graphify update .` uma vez depois.
