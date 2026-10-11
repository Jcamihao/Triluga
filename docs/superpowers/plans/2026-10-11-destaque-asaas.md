# Destaque pago via Asaas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o EfiPay pelo Asaas na cobrança PIX do destaque de anúncio, removendo o EfiPay por completo e fechando a falha do webhook sem token.

**Architecture:** Um `AsaasClient` enxuto (cópia do padrão do Lumen) é injetado no `FeaturedService`. `createOrder` cria o pedido `PENDING`, depois cliente + cobrança PIX + QR no Asaas. Um webhook novo (`POST /featured/webhook/asaas`) valida o header `asaas-access-token` (falha fechada) e ativa o pedido por `externalReference = orderId`. Uma migration renomeia `txid` → `paymentId` e remove `pixKey`.

**Tech Stack:** NestJS 10, Prisma 5.22 (migrations), Jest + ts-jest (`rootDir: src`, `*.spec.ts`), Angular 16 standalone, `node:https` (sem SDK).

**Spec:** `docs/superpowers/specs/2026-10-11-destaque-asaas-design.md`

## Global Constraints

- Planos e preços inalterados: `7d` R$ 29,90 · `15d` R$ 49,90 · `30d` R$ 89,90 (`featured.constants.ts`).
- Variáveis novas: `ASAAS_API_KEY`, `ASAAS_BASE_URL` (padrão `https://api-sandbox.asaas.com/v3`), `ASAAS_WEBHOOK_TOKEN`, `ASAAS_TIMEOUT_MS` (padrão `10000`). Nenhuma `EFIPAY_*` sobra em código, exemplo ou doc atual (notas de `docs/releases/` antigas ficam como histórico).
- Sem Asaas configurado (`ASAAS_API_KEY` vazio), `POST /featured/orders` responde **503**; não existe mais fallback de chave PIX estática.
- Webhook: **token ausente na env ou diferente do header → 403**. Token vazio na env nunca autoriza (nem com header vazio).
- Webhook ativa só pedido `PENDING` e só se `payment.value` == `order.price` (comparar em centavos, `Math.round(v * 100)`).
- `Profile.documentNumber` é obrigatório para pagar: ausente → **400** "Complete seu CPF/CNPJ no perfil para pagar o destaque."
- Rota do webhook usa `@Public()` (já isenta de CSRF). A rota antiga `webhook/pix` é removida.
- Migrations via `prisma migrate` (nada de `db push`). Sem `git add -A`: o working tree pode ter arquivos de outras frentes; sempre `git add` de caminhos explícitos.
- Versões ao final: backend `2.27.0`, frontend `2.26.7`.
- O corpo exato das chamadas Asaas (campos, formato do QR) vem da API pública documentada e **deve ser confirmado no sandbox** antes de produção; os testes usam cliente falso.

## Review Focus

1. Token do webhook vazio na env **e** header vazio/ausente → deve ser 403 (nunca `'' === ''` autorizando). Teste na Task 3.
2. Pedido `CANCELLED` que recebe pagamento depois (usuário cancelou, mas pagou) → não ativa; loga com orderId. Teste na Task 3.
3. Payload de webhook malformado (sem `payment`, `externalReference` nulo, evento desconhecido) → 200 `{ ok: true, activated: 0 }`, nunca 500. Teste na Task 3.
4. Falha do Asaas no meio de `createOrder` (cliente criado, cobrança falha) → pedido `CANCELLED`, 503, nada fica `PENDING` órfão. Teste na Task 2.
5. Cobrança nunca é duplicada por retry: POST não repete em timeout/5xx (GET/DELETE repetem). Teste na Task 1.

---

### Task 1: AsaasClient e configuração

**Files:**
- Create: `backend/src/featured/asaas.client.ts`
- Create: `backend/src/config/asaas.config.ts`
- Create: `backend/src/featured/asaas.client.spec.ts`
- Modify: `backend/src/app.module.ts` (registrar `asaasConfig` ao lado de `efipayConfig`, linhas ~35 e ~57)

**Interfaces:**
- Produces (em `asaas.client.ts`):
  - `class AsaasClientError extends Error { statusCode?: number }`
  - `interface AsaasPixPayment { id: string; value: number; status: string }`
  - `interface AsaasPixQrCode { encodedImage: string; payload: string; expirationDate: string }`
  - `@Injectable() class AsaasClient` com construtor `(configService: ConfigService)` e métodos:
    - `isConfigured(): boolean` (apiKey não vazia)
    - `findCustomerByExternalReference(externalReference: string): Promise<{ id: string } | null>`
    - `createCustomer(p: { name: string; cpfCnpj: string; email: string; externalReference: string }): Promise<{ id: string }>`
    - `createPixPayment(p: { customer: string; value: number; dueDate: string; description: string; externalReference: string }): Promise<AsaasPixPayment>`
    - `getPixQrCode(paymentId: string): Promise<AsaasPixQrCode>`
    - `deletePayment(paymentId: string): Promise<void>`
  - Config key `asaas` com `apiKey`, `baseUrl`, `webhookToken`, `timeoutMs` (mesmo formato do Lumen `Lumen/backend/src/config/asaas.config.ts`).

- [ ] **Step 1: Write the failing tests in `asaas.client.spec.ts`.** Stub o transporte HTTP (injetar o `performRequest` privado via `jest.spyOn(client as any, 'performRequest')`) e use `ConfigService` falso. Testes e asserções:
  - `isConfigured returns false when apiKey is empty` / `true when set`.
  - `createPixPayment sends POST /payments with billingType PIX and the order externalReference` → `performRequest` chamado com `('POST', '/payments', { customer, billingType: 'PIX', value, dueDate, description, externalReference })`.
  - `getPixQrCode calls GET /payments/{id}/pixQrCode`.
  - `findCustomerByExternalReference returns null when data is empty, first item otherwise` (`GET /customers?externalReference=<encoded>` devolve `{ data: [...] }`).
  - `deletePayment calls DELETE /payments/{id}`.
  - `GET retries on 5xx up to 3 attempts then throws AsaasClientError with statusCode` (respostas 500, 500, 500).
  - `POST does not retry on 5xx or network error` → `performRequest` chamado **1 vez** (evita cobrança duplicada).
  - `4xx is never retried and exposes statusCode`.

- [ ] **Step 2: Run to verify failure.**
  Run: `cd backend && npx jest src/featured/asaas.client.spec.ts`
  Expected: FAIL (módulo `asaas.client` não existe).

- [ ] **Step 3: Implement `AsaasClient` e `asaasConfig`.** Copie o núcleo `request/performRequest/delay` e o cabeçalho `access_token` de `Lumen/backend/src/billing/asaas-client.ts`, com **uma diferença**: `request` só entra no laço de retry quando `method` é `GET` ou `DELETE`; para `POST` faz uma única tentativa. Mantenha `MAX_ATTEMPTS = 3` e backoff `250ms * attempt`. Reutilize o formato de `asaas.config.ts` do Lumen (cópia direta). `createPixPayment` retorna `{ id, value, status }` extraídos da resposta; `findCustomerByExternalReference` devolve `data[0] ?? null`.

- [ ] **Step 4: Register `asaasConfig`** em `app.module.ts` (mantendo `efipayConfig` até a Task 2 removê-lo).

- [ ] **Step 5: Run to verify pass + lint.**
  Run: `cd backend && npx jest src/featured/asaas.client.spec.ts && npm run lint:ci`
  Expected: todos os testes PASS; lint sem erros.

- [ ] **Step 6: Commit.**
  ```bash
  git add backend/src/featured/asaas.client.ts backend/src/featured/asaas.client.spec.ts backend/src/config/asaas.config.ts backend/src/app.module.ts
  git commit -m "feat(featured): AsaasClient e config (PIX, cliente, QR, delete)"
  ```

---

### Task 2: Migration, createOrder/cancelOrder no Asaas e remoção do EfiPay (backend)

**Files:**
- Create: `backend/prisma/migrations/20261011120000_featured_asaas_payment/migration.sql`
- Modify: `backend/prisma/schema.prisma` (model `FeaturedOrder`, linhas ~537-558)
- Modify: `backend/src/featured/featured.service.ts` (construtor, `createOrder`, `cancelOrder`; remover `handlePixWebhook` — o novo entra na Task 3)
- Modify: `backend/src/featured/featured.module.ts` (trocar `EfipayService` por `AsaasClient`)
- Modify: `backend/src/featured/featured.controller.ts` (remover a rota `webhook/pix`)
- Modify: `backend/src/app.module.ts` (remover `efipayConfig` e seu import)
- Modify: `backend/src/email/email.service.ts` (remover `sendFeaturedOrderStaticPixAlert`, ~linha 197)
- Modify: `backend/package.json` + `backend/package-lock.json` (remover `sdk-typescript-apis-efi`)
- Delete: `backend/src/featured/efipay.service.ts`, `backend/src/config/efipay.config.ts`
- Test: `backend/src/featured/featured.service.spec.ts` (criar)

**Interfaces:**
- Consumes: `AsaasClient` (Task 1).
- Produces: `FeaturedService` com construtor `(prisma: PrismaService, asaas: AsaasClient, config: ConfigService)` (remova `EmailService` do construtor se ficar sem uso); `createOrder(userId: string, dto: CreateFeaturedOrderDto)` retorna `{ order, payment: { amount: number; description: string; pixCopiaECola: string; qrCodeImage: string | null } }` (sem `pixKey`, `pixKeyType`, `instructions` de caso manual; mantém um `instructions: string` com o texto "Escaneie o QR Code ou copie o código PIX... O destaque será ativado automaticamente após a confirmação."); `cancelOrder(userId, orderId)`.
- `FeaturedOrder` no Prisma: `paymentId String? @unique` (era `txid`), sem `pixKey`.

- [ ] **Step 1: Write the failing tests in `featured.service.spec.ts`.** Monte `FeaturedService` com `prisma` falso (objetos com `jest.fn()` para `vehicle.findUnique`, `featuredOrder.findFirst/create/update/findUnique`, `user`/`profile` conforme a implementação ler o perfil), `asaas` falso e `ConfigService` falso. Testes:
  - `createOrder creates PENDING order, asaas customer+payment+qr, and stores paymentId and pixCopiaECola` (asserir `asaas.createPixPayment` com `externalReference` = id do pedido, `value` do plano `29.9`, `dueDate` = amanhã `YYYY-MM-DD`; `order.update` com `{ paymentId, pixCopiaECola }`; retorno `payment.qrCodeImage` começa com `data:image/png;base64,`).
  - `createOrder reuses existing asaas customer` (`findCustomerByExternalReference` retorna `{id}` → `createCustomer` não é chamado) e `creates one when absent` (com `externalReference = userId`, `cpfCnpj` do perfil).
  - `createOrder returns 400 when profile has no documentNumber` (mensagem exata do Global Constraints; nenhum pedido criado).
  - `createOrder returns 503 when asaas is not configured` (`isConfigured() === false`; nenhum pedido criado).
  - `createOrder rejects vehicle that already has PENDING/ACTIVE order` (400, mensagem existente) e `rejects foreign vehicle` (403).
  - **Review Focus 4:** `createOrder cancels the order and throws 503 when asaas fails after creating the order` (`createPixPayment` rejeita → `order.update({ status: 'CANCELLED' })` e `ServiceUnavailableException`); e quando `getPixQrCode` falha depois de criar a cobrança → `deletePayment(payment.id)` chamado e pedido `CANCELLED`.
  - `cancelOrder on PENDING order deletes the asaas payment and marks CANCELLED`; `cancelOrder still cancels when deletePayment throws` (erro engolido e logado); `cancelOrder rejects non-PENDING and foreign orders` (400 / 403).

- [ ] **Step 2: Run to verify failure.**
  Run: `cd backend && npx jest src/featured/featured.service.spec.ts`
  Expected: FAIL (construtor/símbolos ainda do EfiPay).

- [ ] **Step 3: Schema + migration.** Em `schema.prisma`: renomear `txid` para `paymentId` (mantendo `@unique`) e remover `pixKey`. Antes de escrever o SQL, confirme o nome do índice com `grep -rn "txid" backend/prisma/migrations`. O `migration.sql` deve, nesta ordem: (1) `UPDATE "FeaturedOrder" SET "status" = 'CANCELLED' WHERE "status" = 'PENDING';` (2) `ALTER TABLE "FeaturedOrder" RENAME COLUMN "txid" TO "paymentId";` (3) renomear o índice único `FeaturedOrder_txid_key` → `FeaturedOrder_paymentId_key`; (4) `ALTER TABLE "FeaturedOrder" DROP COLUMN "pixKey";`. Rode `cd backend && npx prisma validate && npx prisma generate`.

- [ ] **Step 4: Implement `createOrder` / `cancelOrder` on Asaas** em `featured.service.ts`, seguindo a ordem da spec (§2): validações atuais → `asaas.isConfigured()` (503 `ServiceUnavailableException`) → ler `profile.documentNumber`, nome e e-mail (400 se sem documento) → criar pedido `PENDING` → achar/criar cliente (`externalReference = userId`) → `createPixPayment` (`dueDate` amanhã, `description` `Destaque Triluga — <título> (<plano>)`) → `getPixQrCode` → `update` do pedido com `paymentId` e `pixCopiaECola`. Qualquer falha após criar o pedido: best-effort `deletePayment` se a cobrança existir, `update status CANCELLED`, `ServiceUnavailableException('Não foi possível gerar o PIX agora. Tente novamente em instantes.')`. `cancelOrder`: se `order.paymentId`, `deletePayment` dentro de try/catch (loga `warn`), depois `CANCELLED`. Remova `handlePixWebhook` e o uso de `EfipayService`/`EmailService`.

- [ ] **Step 5: Remove EfiPay.** Apague `efipay.service.ts` e `efipay.config.ts`; ajuste `featured.module.ts` (provider `AsaasClient`), `app.module.ts`, `featured.controller.ts` (rota `webhook/pix` e import de `Query` se ficar sem uso), `email.service.ts` (método do alerta estático). `cd backend && npm uninstall sdk-typescript-apis-efi`. Confirme: `grep -rniE "efipay|sdk-typescript-apis-efi" backend/src backend/package.json` não retorna nada.

- [ ] **Step 6: Run to verify pass.**
  Run: `cd backend && npx jest src/featured && npx tsc --noEmit -p tsconfig.json && npm run lint:ci && npm run build`
  Expected: testes PASS; type-check, lint e build sem erro.

- [ ] **Step 7: Commit.**
  ```bash
  git add backend/prisma backend/src backend/package.json backend/package-lock.json
  git commit -m "feat(featured): cobrança PIX via Asaas; remove EfiPay e fallback estático

  Migration: txid -> paymentId, drop pixKey, cancela PENDING antigos."
  ```

---

### Task 2b — correções da revisão

Decisões aplicadas sobre a Task 2 após revisão independente (riscos de dinheiro):

1. `cancelOrder` só ignora 404 do Asaas ao apagar a cobrança; qualquer outro erro mantém o pedido `PENDING` e responde 503; o cancelamento usa `updateMany` com guarda `status = PENDING` (count 0 → 400, o webhook pode ter ativado no meio).
2. O cron horário passa a ser `FeaturedService.cancelStalePendingOrders()`, que apaga a cobrança Asaas antes de cancelar (mesmo helper do `cancelOrder`); se o Asaas falhar, pula o pedido e tenta de novo na próxima hora.
3. Check de "já existe PENDING/ACTIVE" + criação do pedido rodam em `$transaction` com `pg_advisory_xact_lock(hashtext(vehicleId))` (sem índice parcial único: o Prisma não declara e o `db push` o derrubaria); chamadas ao Asaas ficam fora da transação.
4. Falha 4xx do Asaas ao achar/criar o cliente (exceto 401/403/429, que são problema nosso) → 400 "CPF/CNPJ inválido. Corrija no perfil e tente novamente." com rollback do pedido; demais falhas seguem 503.
5. `qrCodeImage`: usa `encodedImage` como veio se já começar com `data:`, senão prefixa `data:image/png;base64,`; vazio → `null`.
6. `dueDate` = amanhã no Brasil (UTC-3), calculado de `Date.now() - 3h + 1 dia` em UTC, sem depender do fuso do servidor.

---

### Task 3: Webhook do Asaas

**Files:**
- Modify: `backend/src/featured/featured.service.ts` (adicionar `handleAsaasWebhook`; reutiliza `doActivateOrder`)
- Modify: `backend/src/featured/featured.controller.ts` (rota nova)
- Test: `backend/src/featured/featured.service.spec.ts` (acrescentar bloco `describe('handleAsaasWebhook')`)

**Interfaces:**
- Consumes: `FeaturedService.doActivateOrder(orderId)` (existente, privado), config `asaas.webhookToken`.
- Produces: `FeaturedService.handleAsaasWebhook(token: string, payload: { event?: string; payment?: { id?: string; value?: number; externalReference?: string | null } } | null): Promise<{ ok: true; activated: number }>`; rota `POST /featured/webhook/asaas` com `@Public()` e `@Headers('asaas-access-token') token: string`.

- [ ] **Step 1: Write the failing tests** (`describe('handleAsaasWebhook')`, pedidos falsos com `price: 29.9`, `status` variável):
  - `rejects with 403 when token is wrong`, `when header is missing`, `when ASAAS_WEBHOOK_TOKEN is not configured`, e **`when both env token and header are empty strings`** (Review Focus 1).
  - `activates a PENDING order on PAYMENT_RECEIVED` e `on PAYMENT_CONFIRMED` (ativação chamada 1 vez; retorno `{ ok: true, activated: 1 }`).
  - `finds the order by payment.externalReference, falling back to paymentId`.
  - `is idempotent: second delivery for an ACTIVE order activates nothing` (`activated: 0`).
  - `does not activate when payment.value differs from order.price` (ex.: 10 vs 29.9; loga erro com orderId e valores); `treats 29.9 and 29.90 as equal` (comparação em centavos).
  - **Review Focus 2:** `does not activate a CANCELLED order that was paid later` (loga `warn` com orderId).
  - **Review Focus 3:** `returns { ok: true, activated: 0 } for unknown event, missing payment, null externalReference, unknown order, and null payload` (sem lançar).

- Pagamento recebido para pedido CANCELLED deve ser logado com `error` (orderId, paymentId, valor) para reconciliação manual.

- [ ] **Step 2: Run to verify failure.**
  Run: `cd backend && npx jest src/featured/featured.service.spec.ts -t handleAsaasWebhook`
  Expected: FAIL (`handleAsaasWebhook` não existe).

- [ ] **Step 3: Implement `handleAsaasWebhook`.** Token: `expected = config.get('asaas.webhookToken')`; se `!expected || token !== expected` → `ForbiddenException('Invalid webhook token')` (comparação direta basta; usar `crypto.timingSafeEqual` só se o tamanho for igual, caso contrário falha). Só os eventos `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` seguem; localizar pedido por `externalReference` (id) e, na falta, por `paymentId`; aplicar as regras de status e de valor (centavos); erro em `doActivateOrder` é logado e **não** vira 500.

- [ ] **Step 4: Add the controller route** `@Public() @Post('webhook/asaas')` com `@ApiOperation({ summary: 'Webhook Asaas — confirmação de pagamento PIX do destaque' })`, lendo `@Headers('asaas-access-token') token: string` e `@Body() payload: any`, delegando a `handleAsaasWebhook(token ?? '', payload)`.

- [ ] **Step 5: Run to verify pass.**
  Run: `cd backend && npx jest src/featured && npx tsc --noEmit -p tsconfig.json && npm run lint:ci`
  Expected: todos PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add backend/src/featured/featured.service.ts backend/src/featured/featured.controller.ts backend/src/featured/featured.service.spec.ts
  git commit -m "feat(featured): webhook Asaas com token obrigatório e checagem de valor"
  ```

---

### Task 3b — correções da revisão de segurança do webhook

1. `@SkipThrottle()` na rota do webhook: o token é a autenticação e uma rajada do Asaas não pode receber 429.
2. Cruzamento cobrança x pedido: `payment.id` diferente de `order.paymentId` (ambos presentes) → não ativa, loga `error` com os dois ids; `order.paymentId` nulo ou `payment.id` ausente → segue por `externalReference` + valor.
3. Logs de strings não confiáveis (`externalReference`, `paymentId`, evento) passam por `safeLog`: sem caracteres de controle e truncados em 64 chars.
4. Eventos `PAYMENT_REFUNDED`/`DELETED`/`REVERSED` e `PAYMENT_CHARGEBACK*`: não alteram estado; localizam o pedido e logam `error` (orderId, paymentId, evento) para reconciliação; pedido inexistente → `warn`; sempre 200 noop.
5. `FeaturedService.onModuleInit` loga `warn` quando `asaas.apiKey` está definida mas `asaas.webhookToken` vazio (webhooks seriam recusados com 403 em silêncio).
6. `FeaturedService.expireFeaturedListings(now)` (transação única): pedidos `ACTIVE` vencidos → `EXPIRED` e veículos com `featuredUntil` vencido perdem `isFeatured`/`featuredUntil`; destaque manual do admin (`featuredUntil` nulo) é preservado (`not: null`). Cron horário em `ListingExpiryService` loga `featured_listings_expired orders=N vehicles=M` só quando algo expirou.

---

### Task 4: Frontend — tela de pagamento sem ramo estático e com erros visíveis

**Files:**
- Modify: `frontend/src/app/core/models/domain.models.ts` (linhas ~366-393: `FeaturedOrderPayment` e `FeaturedOrder`)
- Modify: `frontend/src/app/features/owner-dashboard/components/owner-dashboard-list.component.html` (bloco do modal de destaque, ~linhas 820-880)
- Modify: `frontend/src/app/features/owner-dashboard/components/vehicle-wizard.component.html` (~linhas 120-185)
- Modify: `frontend/src/app/features/owner-dashboard/owner-dashboard-page.base.ts` (`submitPromote` ~1230; `saveVehicleAndFeatured` ~834-851)

**Interfaces:**
- Consumes: resposta de `POST /featured/orders` da Task 2 (`payment.pixCopiaECola: string`, `payment.qrCodeImage: string | null`, `payment.amount`, `payment.description`, `payment.instructions`).
- Produces: `FeaturedOrderPayment { amount: number; description: string; instructions: string; pixCopiaECola: string; qrCodeImage: string | null }`; `FeaturedOrder` sem `pixKey` e com `paymentId: string | null` no lugar de `txid`; propriedade `protected promoteError = ''` no base.

- [ ] **Step 1: Update the models** conforme Interfaces (remover `pixKey`, `pixKeyType`; `txid` → `paymentId`).

- [ ] **Step 2: Remove the static-PIX branch** nos dois templates: apagar o `ng-container` "Static PIX key fallback", simplificar o bloco do QR para sempre mostrar QR + copia-e-cola (sem `*ngIf` em `pixCopiaECola`), e fixar o aviso azul/`pending` (sem alternância âmbar). Trocar o comentário "Dynamic QR Code (Efipay)" por "QR Code PIX".

- [ ] **Step 3: Show server errors.** Em `submitPromote`: `promoteError = ''` ao iniciar; no `error` handler, `promoteError = error?.error?.message || 'Não foi possível gerar o PIX agora.'`; exibir `promoteError` no modal (abaixo do botão "Continuar para pagamento", em `text-error`) e limpá-lo em `openPromoteModal`/`closePromoteModal`. Em `saveVehicleAndFeatured`, o `error` do `createOrder` passa a compor `vehicleFeedback = 'Anúncio publicado! ' + (error?.error?.message || 'O destaque não pôde ser criado agora.')`.

- [ ] **Step 4: Verify.**
  Run: `cd frontend && npx ng build 2>&1 | grep -iE "error|Build at"`
  Expected: só a linha `Build at:`; e `grep -rnE "pixKey|txid|Efipay|staticPix" frontend/src/app` não retorna nada.

- [ ] **Step 5: Commit.**
  ```bash
  git add frontend/src/app/core/models/domain.models.ts frontend/src/app/features/owner-dashboard
  git commit -m "feat(destaque): tela PIX sem fallback estático e com mensagens de erro do servidor"
  ```

---

### Task 5: Configuração, docs, versões e verificação final

**Files:**
- Modify: `docker-compose.yml` (bloco `environment` do backend, ~linhas 66-85: acrescentar `ASAAS_API_KEY: ${ASAAS_API_KEY:-}`, `ASAAS_BASE_URL: ${ASAAS_BASE_URL:-https://api-sandbox.asaas.com/v3}`, `ASAAS_WEBHOOK_TOKEN: ${ASAAS_WEBHOOK_TOKEN:-}`, `ASAAS_TIMEOUT_MS: ${ASAAS_TIMEOUT_MS:-10000}`)
- Modify: `.env.example`, `.env.production.example`, `backend/.env.example` (adicionar as 4 variáveis com comentário curto; nenhuma tinha `EFIPAY_*` — confirmar com `grep -ri efipay`)
- Modify: `README.md` (linhas 34 e 74: EfiPay → Asaas; endpoints: adicionar a rota do webhook; seção Deploy: lembrar os segredos e o webhook)
- Create: `docs/releases/v2.8.0.md` (destaques: Asaas no lugar do EfiPay, webhook seguro, migration; passos de produção da spec §Produção)
- Modify: `backend/package.json` (`2.27.0`), `frontend/package.json` (`2.26.7`) e README badge de versão `2.8.0`; tabela de releases.

**Interfaces:**
- Consumes: tudo das Tasks 1–4.
- Produces: nada novo; fecha a entrega.

- [ ] **Step 1: Compose e exemplos.** Aplicar as edições acima. Registrar na nota de release que o compose **não repassava `EFIPAY_*` antes** (então a produção provavelmente operava no fallback estático) e que agora as `ASAAS_*` precisam estar no `.env` da VPS.

- [ ] **Step 2: README e release notes.** Trocar menções, documentar `POST /featured/webhook/asaas` (header `asaas-access-token`), os 3 passos de produção (chave sandbox → conta de produção CPF/MEI → segredos + webhook no painel) e o `prisma migrate deploy`.

- [ ] **Step 3: Bump de versões** nos dois `package.json`.

- [ ] **Step 4: Verificação final completa.**
  Run: `cd backend && npx jest && npx tsc --noEmit -p tsconfig.json && npm run lint:ci && npm run build; cd ../frontend && npx ng build 2>&1 | grep -iE "error|Build at"; cd .. && grep -rniE "efipay" --include=*.ts --include=*.html --include=*.yml --include=*.example --include=*.json . 2>/dev/null | grep -v "node_modules\|/dist/\|package-lock\|docs/releases\|docs/superpowers"`
  Expected: todos os testes PASS, type-check/lint/builds sem erro, e o `grep` final **vazio**.

- [ ] **Step 5: Commit.**
  ```bash
  git add docker-compose.yml .env.example .env.production.example backend/.env.example README.md docs/releases/v2.8.0.md backend/package.json frontend/package.json
  git commit -m "docs/chore: variáveis ASAAS, README, release v2.8.0; bump backend 2.27.0, frontend 2.26.7"
  ```

---

## Pós-entrega (fora do plano, com o dono)

1. Chave Asaas **sandbox** → validar de ponta a ponta (formato do QR, `externalReference` no webhook, header do webhook) e ajustar os testes se a API divergir.
2. Conta de produção no Asaas (CPF ou MEI/CNPJ), segredos na VPS, cadastro do webhook em `/api/v1/featured/webhook/asaas`.
3. Agente de infra: `git pull`, `docker compose up --build -d`, `prisma migrate deploy`.
