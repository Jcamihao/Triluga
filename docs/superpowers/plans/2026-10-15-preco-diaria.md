# Preço por diária, tempo mínimo e estimativa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o preço semanal por **diária**, acrescentar `minRentalDays` e mostrar a estimativa semanal/mensal explícita (com aviso), convertendo os dados existentes e mantendo clientes antigos corretos por uma versão.

**Architecture:** Funções puras num único módulo de backend (`rental-pricing.ts`) calculam diária, estimativas e regras de compatibilidade; todos os mapeadores de resposta, o filtro, a ordenação, os alertas e a FIPE passam por ele. O frontend consome os campos prontos da API, com um componente compartilhado para o bloco de estimativa. Uma migration converte `weeklyRate ÷ 7` e remove a coluna.

**Tech Stack:** NestJS 10 + Prisma 5.22 (migrations) + class-validator, Jest/ts-jest (`rootDir: src`); Angular 16 standalone, Karma/Jasmine, Tailwind + SCSS.

**Spec:** `docs/superpowers/specs/2026-10-15-preco-diaria-design.md` (ler inteira; já inclui a regra "weeklyRate na requisição = cliente legado" e as chaves de alerta `minDailyRate`/`maxDailyRate`).

## Global Constraints

- Opções de tempo mínimo (dias): **3, 7, 14, 30, 90**; vazio/`null` = sem tempo mínimo. Qualquer outro valor → 400.
- **Semana = diária × 7; mês = diária × 30**; arredondamento a 2 casas (`round2`).
- Conversão de dados: `dailyRate = ROUND(COALESCE("weeklyRate","dailyRate") / 7, 2)` (o preço **visível hoje** é `weeklyRate ?? dailyRate`).
- `weeklyRate` na **requisição** = cliente legado → vale ÷ 7 e um `dailyRate` junto é **ignorado**; clientes novos nunca o enviam. Na **resposta**, `weeklyRate` continua existindo por uma versão, igual a `weeklyEstimate` (nunca `null`).
- Parâmetros de busca novos: `minDailyRate`, `maxDailyRate`. Os antigos `minPrice`/`maxPrice` continuam por uma versão com significado **semanal** (÷ 7); se vêm os dois pares, os novos vencem.
- Filtros de alerta guardados passam a usar `minDailyRate`/`maxDailyRate`; chaves legadas na entrada são convertidas (÷ 7).
- Aviso fixo, texto exato: **"Valores estimados a partir da diária. O pagamento e as condições são combinados e feitos diretamente entre você e o anunciante; o Triluga não participa nem intermedeia."**
- Opções de exibição do mínimo: `3 dias`, `1 semana`, `2 semanas`, `1 mês`, `3 meses`, `Sem tempo mínimo`.
- Repositório compartilhado com outra frente: **nunca** `git commit --amend`, `reset`, `rebase`, `stash`, troca de branch ou `git add -A`; `git add` só de caminhos explícitos; conferir `git log -1` antes de commitar; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` em linha própria.
- Backend e frontend **vão no mesmo deploy**; entregas intermediárias ficam só em commits locais.
- Versões ao final (minor): backend **2.28.0**, frontend = próxima minor sobre o valor em `frontend/package.json` na hora (outra frente também bumpa).

## Review Focus

1. Cliente legado manda `weeklyRate` **e** `dailyRate` na criação → vale `weeklyRate ÷ 7`; o `dailyRate` é ignorado. (Task 1 e 3)
2. Linha antiga com `weeklyRate NULL` na migration → converte a partir do `dailyRate` (o que a tela mostrava como "/semana"). (Task 2)
3. Arredondamento: 699/semana → 99,86/dia → estimativa semanal 699,02; diária mínima 1,00; `minRentalDays` inválido (5, -1, 0) → 400; `null` aceito na edição para **remover** o mínimo. (Task 1 e 3)
4. Busca com filtros novos **e** legados juntos → os novos vencem; `minPrice=0`/`maxPrice=0` não podem ser ignorados por serem "falsy" (o código atual usa `if (query.minPrice || query.maxPrice)`). (Task 1 e 5)
5. Alertas antigos (migration) e alertas criados por clientes legados (`minPrice`/`maxPrice` na entrada) acabam armazenados com as chaves novas e valores diários. (Task 2 e 5)

---

### Task 1: Núcleo de preço no backend

**Files:**
- Create: `backend/src/vehicles/rental-pricing.ts`
- Test: `backend/src/vehicles/rental-pricing.spec.ts`

**Interfaces:**
- Produces (todas exportadas de `rental-pricing.ts`):
  - `MIN_RENTAL_DAYS_OPTIONS: readonly [3, 7, 14, 30, 90]`, `DAYS_PER_WEEK = 7`, `DAYS_PER_MONTH = 30`
  - `round2(n: number): number`
  - `weeklyEstimate(dailyRate: number): number` · `monthlyEstimate(dailyRate: number): number`
  - `minPeriodTotal(dailyRate: number, minRentalDays: number | null | undefined): number | null`
  - `dailyFromLegacyWeekly(weekly: number): number` (= `round2(weekly / 7)`)
  - `resolveWriteDailyRate(input: { dailyRate?: number | null; weeklyRate?: number | null }): number | undefined` — `weeklyRate` presente → `dailyFromLegacyWeekly(weeklyRate)` (ignora `dailyRate`); senão `dailyRate`; senão `undefined`
  - `resolveDailyRateBounds(q: { minDailyRate?: number; maxDailyRate?: number; minPrice?: number; maxPrice?: number }): { min?: number; max?: number }` — novos vencem; legado `minPrice`/`maxPrice` via `dailyFromLegacyWeekly`; testa `!== undefined` (zero é valor válido)
  - `interface VehiclePricing { dailyRate: number; weeklyRate: number; weeklyEstimate: number; monthlyEstimate: number; minRentalDays: number | null; minPeriodTotal: number | null }`
  - `buildPricing(vehicle: { dailyRate: unknown; minRentalDays?: number | null }): VehiclePricing` (`Number(dailyRate)`; `weeklyRate` = `weeklyEstimate`)

- [ ] **Step 1: Escrever os testes que falham** em `rental-pricing.spec.ts` (nomes e valores):
  - `weeklyEstimate e monthlyEstimate`: `weeklyEstimate(100)=700`, `monthlyEstimate(100)=3000`, `weeklyEstimate(99.86)=699.02`, `monthlyEstimate(22.84)=685.2`.
  - `dailyFromLegacyWeekly`: `(700)=100`, `(699)=99.86`, `(1)=0.14`.
  - `minPeriodTotal`: `(100, 30)=3000`, `(100, null)=null`, `(100, undefined)=null`, `(99.86, 3)=299.58`.
  - `resolveWriteDailyRate` (Review Focus 1): `{weeklyRate:700}=100`; `{weeklyRate:700, dailyRate:700}=100` (dailyRate ignorado); `{dailyRate:120}=120`; `{}=undefined`; `{weeklyRate:null, dailyRate:120}=120`.
  - `resolveDailyRateBounds` (Review Focus 4): `{minPrice:700,maxPrice:1400}={min:100,max:200}`; `{minDailyRate:50,minPrice:700}={min:50}`; `{minPrice:0}={min:0}`; `{}={}`.
  - `buildPricing({dailyRate:'100.00', minRentalDays:30})` com string/Decimal-like (objeto com `toString`/`valueOf`) → `{dailyRate:100, weeklyRate:700, weeklyEstimate:700, monthlyEstimate:3000, minRentalDays:30, minPeriodTotal:3000}`; sem mínimo → `minRentalDays:null, minPeriodTotal:null`.

- [ ] **Step 2: Rodar e ver falhar.** Run: `cd backend && npx jest src/vehicles/rental-pricing.spec.ts` · Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** o módulo com as assinaturas acima (funções puras, sem Nest/Prisma).
- [ ] **Step 4: Rodar e ver passar + lint.** Run: `cd backend && npx jest src/vehicles/rental-pricing.spec.ts && npm run lint:ci` · Expected: PASS, lint limpo.
- [ ] **Step 5: Commit.** `git add backend/src/vehicles/rental-pricing.ts backend/src/vehicles/rental-pricing.spec.ts && git commit -m "feat(preco): núcleo de preço por diária (estimativas e regras de compatibilidade)"`

---

### Task 2: Schema, migration, seed e scripts

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `Vehicle`: remover `weeklyRate`, adicionar `minRentalDays Int?`)
- Create: `backend/prisma/migrations/20261015120000_vehicle_daily_rate_min_rental/migration.sql`
- Modify: `backend/prisma/seed.js` (remover `weeklyRate` das ~11 linhas; manter `dailyRate`), `backend/scripts/add-random-cars.js` (já usa só `dailyRate`; conferir)

**Interfaces:**
- Produces: tabela `Vehicle` com `minRentalDays INTEGER NULL` e sem `weeklyRate`; `SearchAlert.filters` com chaves `minDailyRate`/`maxDailyRate` (valores diários) no lugar de `minPrice`/`maxPrice`.

- [ ] **Step 1: Escrever a migration** (conferir o nome real da tabela/colunas em `schema.prisma` e nas migrations anteriores antes de escrever; `SearchAlert.filters` é `Json` → `jsonb`). SQL, nesta ordem: (1) `ALTER TABLE "Vehicle" ADD COLUMN "minRentalDays" INTEGER;` (2) `UPDATE "Vehicle" SET "dailyRate" = ROUND(COALESCE("weeklyRate","dailyRate") / 7, 2);` (3) `ALTER TABLE "Vehicle" DROP COLUMN "weeklyRate";` (4) para `SearchAlert` com `filters ? 'minPrice' OR filters ? 'maxPrice'`: remover essas duas chaves e inserir `minDailyRate`/`maxDailyRate` = `ROUND((valor)::numeric / 7, 2)` (chave ausente não vira `null`: usar `jsonb_strip_nulls`). **Não** recalcular `queryHash` (limitação aceita na spec §4). Sem `CHECK` no banco (Prisma não o conhece; a validação fica no DTO). Idempotência não é exigida; a tabela `Vehicle` existe em todos os ambientes.
- [ ] **Step 2: Atualizar `schema.prisma` e o seed**, depois `cd backend && npx prisma validate && npx prisma generate`.
- [ ] **Step 3: Testar a migration num Postgres descartável** (padrão já usado neste repositório: `embedded-postgres` do `/home/caminhao/codeStage/Lumen/backend/node_modules`, porta livre, dados no scratchpad; **nunca** contra outro banco; matar por PID, nunca `pkill -f`). Montar o esquema **antigo** com `git show HEAD:backend/prisma/schema.prisma` (arquivo temporário no scratchpad) via `prisma db push` no banco descartável, inserir: veículo A `weeklyRate=700, dailyRate=700`; B `weeklyRate=NULL, dailyRate=159.9`; C `weeklyRate=699, dailyRate=699`; alertas: `{minPrice:400,maxPrice:900,city:"X"}`, `{maxPrice:700}`, `{city:"Y"}`. Aplicar **só o SQL da nova migration**. Esperado: A=100.00, B=22.84, C=99.86; `weeklyRate` inexistente; `minRentalDays` null; alertas → `{minDailyRate:57.14,maxDailyRate:128.57,city:"X"}`, `{maxDailyRate:100}`, `{city:"Y"}` (sem chaves antigas). `prisma migrate diff --from-url <banco> --to-schema-datamodel schema.prisma` deve dar vazio. Registrar a saída no relatório.
- [ ] **Step 4: Verificação.** Run: `cd backend && npx tsc --noEmit -p tsconfig.json` · Expected: **erros de compilação apontando os usos de `weeklyRate`** (serão resolvidos nas Tasks 3–5; este commit **não** deve ser deployado sozinho). Não corrigir esses usos aqui.
- [ ] **Step 5: Commit.** `git add backend/prisma/schema.prisma backend/prisma/migrations/20261015120000_vehicle_daily_rate_min_rental backend/prisma/seed.js backend/scripts/add-random-cars.js && git commit -m "feat(preco): migration diária + minRentalDays (weeklyRate ÷ 7, alertas convertidos)"`

---

### Task 3: Escrita de anúncios (DTOs, criar e editar)

**Files:**
- Modify: `backend/src/vehicles/dto/create-vehicle.dto.ts` (linhas ~96-110), `backend/src/vehicles/vehicles.service.ts` (`create` ~596-597, `update` ~653-654)
- Test: `backend/src/vehicles/vehicles.write.spec.ts` (criar; fakes escritos à mão para `PrismaService`, cache e alertas)

**Interfaces:**
- Consumes: `resolveWriteDailyRate`, `MIN_RENTAL_DAYS_OPTIONS` (Task 1).
- Produces: `CreateVehicleDto` com `dailyRate?: number` (`@ValidateIf(o => o.weeklyRate === undefined)` + `@IsNumber({maxDecimalPlaces:2}) @Min(1)`), `weeklyRate?: number` (legado, `@IsOptional()`, `@Min(1)`, descrição "Legado: valor semanal; convertido ÷ 7"), `minRentalDays?: number | null` (`@IsOptional() @IsIn([...MIN_RENTAL_DAYS_OPTIONS])`). `UpdateVehicleDto` continua `PartialType`.

- [ ] **Step 1: Escrever testes que falham** (`vehicles.write.spec.ts`, Prisma falso capturando o `data` do `vehicle.create`/`update`):
  - `create com dailyRate novo grava dailyRate e minRentalDays` (`dailyRate:120, minRentalDays:30` → `data.dailyRate=120, data.minRentalDays=30`).
  - **(Review Focus 1)** `create legado: weeklyRate 700 e dailyRate 700 → dailyRate 100`; `create legado só com weeklyRate`.
  - `create sem tempo mínimo → data.minRentalDays = null`.
  - `update` não envia `weeklyRate` ao Prisma (o spread `...dto` hoje passaria o campo removido): `data` **não** tem a chave `weeklyRate`; `update({ minRentalDays: null })` → `data.minRentalDays = null` (remove o mínimo); `update({})` não altera `dailyRate` nem `minRentalDays` (chaves ausentes).
  - Validação do DTO com `class-validator`/`plainToInstance`: `minRentalDays: 5` → erro; `0`, `-1`, `'30'` (string não numérica) → erro; `3,7,14,30,90` e `null` → ok; sem `dailyRate` **e** sem `weeklyRate` → erro; `dailyRate: 0.5` → erro (`Min(1)`).
- [ ] **Step 2: Rodar e ver falhar.** Run: `cd backend && npx jest src/vehicles/vehicles.write.spec.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar** o DTO e a escrita: em `create`, `dailyRate = resolveWriteDailyRate(dto)` (se `undefined` → `BadRequestException`), `minRentalDays: dto.minRentalDays ?? null`; em `update`, **desestruturar** `const { weeklyRate, dailyRate, minRentalDays, ...rest } = dto` e montar `data` explicitamente (`dailyRate` só se `resolveWriteDailyRate` devolver valor; `minRentalDays` só se a chave veio, aceitando `null`).
- [ ] **Step 4: Rodar e ver passar.** Run: `cd backend && npx jest src/vehicles && npm run lint:ci` · Expected: PASS.
- [ ] **Step 5: Commit.** `git add backend/src/vehicles/dto/create-vehicle.dto.ts backend/src/vehicles/vehicles.service.ts backend/src/vehicles/vehicles.write.spec.ts && git commit -m "feat(preco): criar/editar anúncio por diária com tempo mínimo (weeklyRate legado ÷ 7)"`

---

### Task 4: Respostas (vehicles, favoritos, chat, perfil público)

**Files:**
- Modify: `backend/src/vehicles/vehicles.service.ts` (`mapVehicleSummary` ~750, mapeadores ~403 e ~765), `backend/src/favorites/favorites.service.ts` (~128), `backend/src/chat/chat.service.ts` (~557), `backend/src/profiles/profiles.service.ts` (~149)
- Test: `backend/src/vehicles/vehicles.pricing-shape.spec.ts`

**Interfaces:**
- Consumes: `buildPricing`, `VehiclePricing` (Task 1).
- Produces: todos os objetos de anúncio devolvidos pela API trazem **exatamente** os campos de `VehiclePricing` (`...buildPricing(vehicle)` no lugar de `dailyRate`/`weeklyRate`); `weeklyRate` nunca é `null`. As consultas Prisma que fazem `select` explícito passam a selecionar `minRentalDays` (e não selecionar `weeklyRate`).

- [ ] **Step 1: Testes que falham**: para cada serviço (vehicles `mapVehicleSummary`/detail, favoritos, chat, perfil), com entidade falsa `{ dailyRate: '100.00', minRentalDays: 30, ...}` o resultado contém `dailyRate:100, weeklyRate:700, weeklyEstimate:700, monthlyEstimate:3000, minRentalDays:30, minPeriodTotal:3000`; sem mínimo → `minRentalDays:null, minPeriodTotal:null`. Onde o mapeador é privado, expor por teste de integração do método público com Prisma falso (não tornar público só para testar).
- [ ] **Step 2: Rodar e ver falhar.** Run: `cd backend && npx jest src/vehicles/vehicles.pricing-shape.spec.ts` · Expected: FAIL.
- [ ] **Step 3: Implementar**: trocar os pares `dailyRate`/`weeklyRate` por `...buildPricing(entidade)`; `grep -rn "weeklyRate" backend/src --include=*.ts` deve restar apenas em `rental-pricing.ts`, DTOs (legado), o serviço de alertas (Task 5), FIPE (Task 5) e specs.
- [ ] **Step 4: Rodar.** Run: `cd backend && npx jest src && npx tsc --noEmit -p tsconfig.json && npm run lint:ci` · Expected: PASS; o `tsc` só pode acusar os usos que a Task 5 resolve (alertas/ordenação/filtro) — se acusar outra coisa, corrigir aqui.
- [ ] **Step 5: Commit.** `git add backend/src/vehicles backend/src/favorites backend/src/chat backend/src/profiles && git commit -m "feat(preco): respostas com diária, estimativas e tempo mínimo (weeklyRate legado derivado)"`

---

### Task 5: Busca, ordenação, alertas e FIPE

**Files:**
- Modify: `backend/src/vehicles/dto/list-vehicles-query.dto.ts` (~81-90), `backend/src/vehicles/vehicles.service.ts` (filtro ~178-185, ordenação ~268-271), `backend/src/search-alerts/search-alerts.service.ts` (`normalizeFilters` ~188-222, comparação ~302-312, interface ~19-20), `backend/src/search-alerts/dto/create-search-alert.dto.ts` (exemplo ~15), `backend/src/lookups/lookups.service.ts` (~263-276)
- Test: `backend/src/vehicles/vehicles.search.spec.ts`, `backend/src/search-alerts/search-alerts.pricing.spec.ts`, `backend/src/lookups/lookups.fipe.spec.ts`

**Interfaces:**
- Consumes: `resolveDailyRateBounds`, `dailyFromLegacyWeekly` (Task 1).
- Produces: query com `minDailyRate?`/`maxDailyRate?` (`@IsOptional() @Type(() => Number) @IsNumber({maxDecimalPlaces:2})`) e `minPrice`/`maxPrice` com a descrição "Legado: valor semanal (÷ 7)"; filtro Prisma `dailyRate: { gte, lte }`; `sort=price_asc|price_desc` por `dailyRate`; filtros de alerta normalizados com `minDailyRate`/`maxDailyRate` (entrada legada `minPrice`/`maxPrice` ÷ 7); resposta FIPE com `suggestedDailyRateMin`/`suggestedDailyRateMax` **além** dos campos semanais atuais.

- [ ] **Step 1: Testes que falham**:
  - Filtro: `{minDailyRate:50,maxDailyRate:200}` → `where.dailyRate = {gte:50, lte:200}`; legado `{minPrice:700,maxPrice:1400}` → `{gte:100, lte:200}`; **(Review Focus 4)** novos + legados → os novos; `{minPrice:0}` → `gte:0` presente; sem filtros → sem cláusula. Ordenação `price_asc` → `orderBy {dailyRate:'asc'}`.
  - Alertas: **(Review Focus 5)** `normalizeFilters({minPrice:700,maxPrice:1400})` → `{minDailyRate:100,maxDailyRate:200}` sem as chaves antigas; `normalizeFilters({minDailyRate:50})` preservado; correspondência: veículo `dailyRate 100` casa com `minDailyRate 50/maxDailyRate 150` e não casa com `maxDailyRate 90`.
  - FIPE: preço 50000 → `suggestedDailyRateMin = Math.max(1, Math.round(50000*0.01/7)) = 71`, `Max = Math.round(50000*0.02/7) = 143`; os campos semanais atuais (`suggestedWeeklyRateMin/Max`, arredondados a 10) **inalterados**.
- [ ] **Step 2: Rodar e ver falhar.** Run: `cd backend && npx jest src/vehicles/vehicles.search.spec.ts src/search-alerts src/lookups` · Expected: FAIL.
- [ ] **Step 3: Implementar** (o filtro usa `!== undefined`; extrair a montagem da cláusula de preço para uma função pequena em `rental-pricing.ts` ou no serviço para ser testável sem banco).
- [ ] **Step 4: Verificação completa do backend.** Run: `cd backend && npx jest && npx tsc --noEmit -p tsconfig.json && npm run lint:ci && npm run build && grep -rn "weeklyRate" src --include=*.ts | grep -v "spec\|rental-pricing\|create-vehicle.dto"` · Expected: tudo verde; o `grep` final lista **só** os campos legados deliberados (FIPE `suggestedWeeklyRate*` não casa porque o padrão é `weeklyRate`).
- [ ] **Step 5: Commit.** `git add backend/src && git commit -m "feat(preco): busca, ordenação, alertas e FIPE por diária (parâmetros legados por uma versão)"`

---

### Task 6: Frontend — núcleo (modelos, API, utilitário e bloco de estimativa)

**Files:**
- Modify: `frontend/src/app/core/models/domain.models.ts` (tipos de veículo ~174-228 e ~342; `CreateVehiclePayload` ~304-313), `frontend/src/app/core/services/vehicles-api.service.ts` (~152 e params de busca)
- Create: `frontend/src/app/shared/utils/rental-pricing.util.ts`, `frontend/src/app/shared/utils/rental-pricing.util.spec.ts`, `frontend/src/app/shared/components/rental-estimate/rental-estimate.component.ts` (standalone, template e estilos inline ou arquivos irmãos no padrão dos outros componentes shared)

**Interfaces:**
- Produces:
  - `rental-pricing.util.ts`: `DAYS_PER_WEEK = 7`, `DAYS_PER_MONTH = 30`, `MIN_RENTAL_OPTIONS: { value: number | null; label: string }[]` (os 6 rótulos do Global Constraints, `null` = "Sem tempo mínimo"), `weeklyEstimate(daily: number): number`, `monthlyEstimate(daily: number): number`, `minPeriodTotal(daily: number, days: number | null | undefined): number | null`, `minRentalLabel(days: number | null | undefined): string`, `RENTAL_DISCLAIMER: string` (texto exato do Global Constraints), `dailyFromLegacyWeekly(weekly: number): number`.
  - `RentalEstimateComponent` (`selector: 'app-rental-estimate'`): `@Input() dailyRate: number`, `@Input() minRentalDays: number | null = null`, `@Input() compact = false`; mostra "Quanto você pagaria (estimativa)": Diária, 7 dias, 30 dias e, se houver mínimo, "Período mínimo: <rótulo> — R$ total"; sempre o `RENTAL_DISCLAIMER` abaixo; moeda em pt-BR (`currency:'BRL'`).
  - Modelos: veículos ganham `weeklyEstimate: number`, `monthlyEstimate: number`, `minRentalDays: number | null`, `minPeriodTotal: number | null`; `weeklyRate` sai dos tipos novos; `CreateVehiclePayload` = `dailyRate: number` (obrigatório) + `minRentalDays?: number | null`, **sem** `weeklyRate`; a chamada `create`/`update` envia `dailyRate` e `minRentalDays`.

- [ ] **Step 1: Escrever o spec do utilitário** (Jasmine, valores iguais aos do backend): `weeklyEstimate(100)=700`, `monthlyEstimate(100)=3000`, `weeklyEstimate(99.86)=699.02`, `minPeriodTotal(100,30)=3000`, `minPeriodTotal(100,null)=null`, `minRentalLabel(7)='1 semana'`, `minRentalLabel(90)='3 meses'`, `minRentalLabel(null)='Sem tempo mínimo'`, `MIN_RENTAL_OPTIONS.length===6`.
- [ ] **Step 2: Rodar e ver falhar.** Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` (se o ambiente exigir `--no-sandbox`, acrescentar um launcher customizado em `karma.conf.js`, sem alterar o comportamento padrão) · Expected: FAIL (util inexistente).
- [ ] **Step 3: Implementar** util, componente e ajuste de modelos/serviço; a busca (Task 10) é separada.
- [ ] **Step 4: Verificar.** Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build 2>&1 | grep -iE "error|Build at"` · Expected: testes PASS; o build pode acusar usos de `weeklyRate` que as Tasks 7–10 resolvem; **nenhum erro fora de `weeklyRate`**.
- [ ] **Step 5: Commit.** `git add frontend/src/app/core frontend/src/app/shared/utils frontend/src/app/shared/components/rental-estimate && git commit -m "feat(preco): utilitário, modelos e bloco de estimativa por diária no frontend"`

---

### Task 7: Frontend — cards e listagens

**Files:**
- Modify: `shared/components/vehicle-card/vehicle-card.component.{html,ts}` (linhas ~164 e ~145), `features/favorites/favorites-desktop.component.html` (~58,100) e `favorites-page.base.ts` (~192), `features/chat/chat-{mobile,desktop}.component.html` (~284, ~446), `features/user-profile/user-profile-page.component.html` (~256, ~564), `features/owner-dashboard/components/owner-dashboard-list.component.html` (~358-365, ~697-704) — todos sob `frontend/src/app/`

**Interfaces:**
- Consumes: modelos e `minRentalLabel` (Task 6).
- Produces: onde havia `weeklyRate ?? dailyRate` + "/semana" passa a mostrar `dailyRate` + "/dia"; um selo discreto "mín. <rótulo>" quando `minRentalDays` existe (sem selo quando é `null`); texto de compartilhamento do card (`vehicle-card.component.ts` ~145) usa a diária.

- [ ] **Step 1:** Trocar cada ponto listado (grep guia: `grep -rnE "weeklyRate|/semana" frontend/src/app` deve restar só em Tasks 8–10). Manter o padrão visual dos cards.
- [ ] **Step 2: Verificar.** Run: `cd frontend && npx ng build 2>&1 | grep -iE "error|Build at"` · Expected: só `Build at:` para os arquivos desta task (erros restantes só nos arquivos das Tasks 8–10).
- [ ] **Step 3: Verificação visual** (Chrome headless com API simulada, padrão do repositório: `puppeteer-core` em `/home/caminhao/codeStage/PraiseApp/node_modules`, Chrome em `~/.cache/puppeteer`, scripts **só** no scratchpad, `--no-sandbox`, `setBypassServiceWorker(true)`, interceptar `:3002` com CORS por eco de origem + `allow-credentials`): home/busca com 2 cards (um sem mínimo, um com "mín. 1 semana"), favoritos, perfil público e lista do dono; capturas desktop (1440) e mobile (390); descrever o que se vê.
- [ ] **Step 4: Commit.** `git add <arquivos desta task> && git commit -m "feat(preco): cards e listagens mostram diária e tempo mínimo"`

---

### Task 8: Frontend — detalhe do anúncio e comparador

**Files:**
- Modify: `features/vehicle/vehicle-detail-page.base.ts` (getter `weeklyRateValue` ~498 → diária), `vehicle-detail-desktop.component.html` (~289-291), `vehicle-detail-mobile.component.html` (~147-155), `features/compare/compare-page.base.ts` (~85), `compare-desktop.component.html` (~79, ~105), `compare-mobile.component.html` (~177)

**Interfaces:**
- Consumes: `RentalEstimateComponent` e util (Task 6).
- Produces: o detalhe mostra "R$ X/dia" no destaque de preço e, abaixo, `<app-rental-estimate [dailyRate] [minRentalDays]>` com o aviso; o comparador troca a linha "Preço semanal" por linhas **Diária**, **Estimativa 7 dias**, **Estimativa 30 dias** e **Tempo mínimo**, com o aviso uma vez ao pé da tabela.

- [ ] **Step 1:** Implementar. O bloco de estimativa deve estar visível **sem rolagem extra** perto do preço no mobile (conferir na captura).
- [ ] **Step 2: Verificar.** Run: `cd frontend && npx ng build 2>&1 | grep -iE "error|Build at"`.
- [ ] **Step 3: Verificação visual** (mesmo harness): detalhe sem mínimo e com mínimo de 1 mês (`R$ 3.000,00`), desktop e mobile; comparador com 2 veículos; o **texto exato do aviso** presente na página (`document.body.innerText.includes(...)` com o texto do Global Constraints).
- [ ] **Step 4: Commit.** `git add <arquivos desta task> && git commit -m "feat(preco): detalhe e comparador com estimativa semanal/mensal e aviso"`

---

### Task 9: Frontend — cadastro do anúncio (painel do dono)

**Files:**
- Modify: `features/owner-dashboard/owner-dashboard-page.base.ts` (rascunho ~1428; FIPE ~467; receita estimada ~530; checagens ~641-644, ~706, ~907, ~1456-1482, ~1536-1587), `components/announce-photos-price-step.component.html` (~227, ~262-267), `components/announce-preview-card.component.ts` (~40), `core/services/fipe-api.service.ts` (modelo FIPE)

**Interfaces:**
- Consumes: util, `MIN_RENTAL_OPTIONS`, `RentalEstimateComponent` (Task 6); backend FIPE `suggestedDailyRateMin/Max` (Task 5).
- Produces: `vehicleDraft.dailyRate: number` e `vehicleDraft.minRentalDays: number | null`; campo "Valor da diária (R$)" com `aria-label`; seletor "Tempo mínimo de aluguel" com as 6 opções (valor inicial `null` = sem mínimo); prévia ao vivo com `<app-rental-estimate>` (o dono vê exatamente o que o interessado verá); "Usar valor sugerido" usa `suggestedDailyRateMin`; mensagens de validação trocam "preço por semana" por "valor da diária"; edição de anúncio existente carrega `dailyRate` e `minRentalDays`; o payload enviado **não** contém `weeklyRate`; a "receita mensal estimada" (hoje `weeklyRate*4`) passa a `monthlyEstimate(dailyRate)` com o rótulo "estimativa (30 dias)".

- [ ] **Step 1:** Implementar. Campo vazio/≤0 impede publicar (mensagem em pt-BR); trocar de "tempo mínimo" para "Sem tempo mínimo" envia `null`.
- [ ] **Step 2: Verificar.** Run: `cd frontend && npx ng build 2>&1 | grep -iE "error|Build at" && grep -rnE "weeklyRate|preço por semana|por semana" src/app/features/owner-dashboard` · Expected: só `Build at:`; o `grep` vazio.
- [ ] **Step 3: Verificação visual** (mesmo harness, usuário autenticado como nas verificações anteriores: `sessionStorage` `triluga.accessToken`/`triluga.user`/`triluga.sessionHint`): passo de preço com diária 100 e mínimo "1 mês" mostra a prévia (7 dias R$ 700,00; 30 dias R$ 3.000,00; "Período mínimo: 1 mês — R$ 3.000,00") e o aviso; capturar o **corpo do POST** enviado e confirmar `dailyRate:100, minRentalDays:30` e ausência de `weeklyRate`.
- [ ] **Step 4: Commit.** `git add <arquivos desta task> && git commit -m "feat(preco): cadastro do anúncio por diária com tempo mínimo e prévia da estimativa"`

---

### Task 10: Frontend — busca e filtros

**Files:**
- Modify: `features/search/search-page.base.ts` (`SearchQuery` ~28-29, leitura de params ~131-132, slider ~306-325, pills ~365, `hasFilters` ~509, saída de filtros e alertas ~539-540), `features/search/search-desktop.component.html` (~145-164, ~325-326), `shared/components/filter-modal/filter-modal.component.{ts,html}` (~19-20, ~63-65, ~84-85, ~139-172; html ~166-197), `core/services/vehicles-api.service.ts` (parâmetros)

**Interfaces:**
- Consumes: `dailyFromLegacyWeekly` (Task 6).
- Produces: `SearchQuery.minDailyRate/maxDailyRate: string` (URL `?minDailyRate=&maxDailyRate=`); **URLs antigas** com `minPrice`/`maxPrice` (semanais) são convertidas ao ler (`dailyFromLegacyWeekly`, arredondado a inteiro) para os campos novos; faixa do controle de preço **0 a R$ 300 por dia** ("R$ 300+" no topo, passo 10), padrão do modal **R$ 10 – R$ 80**; pills e rótulos dizem "/dia"; a API é chamada com `minDailyRate`/`maxDailyRate`; alertas salvos enviam `minDailyRate`/`maxDailyRate` no `filters`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2: Verificar.** Run: `cd frontend && npx ng build 2>&1 | grep -iE "error|Build at" && grep -rnE "minPrice|maxPrice" src/app | grep -v "spec"` · Expected: build limpo; o `grep` só pode listar a leitura de **URL legada** e o comentário que a explica.
- [ ] **Step 3: Verificação visual/funcional** (mesmo harness): abrir `/search?minPrice=700&maxPrice=1400` e conferir que a requisição à API leva `minDailyRate=100&maxDailyRate=200`; mover o controle e conferir a URL `minDailyRate`; salvar alerta e conferir o corpo (`minDailyRate`/`maxDailyRate`, sem `minPrice`).
- [ ] **Step 4: Commit.** `git add <arquivos desta task> && git commit -m "feat(preco): busca e filtros por diária (URLs antigas convertidas)"`

---

### Task 11: Documentação, runbook de deploy, versões e verificação final

**Files:**
- Create: `docs/releases/v2.9.0.md`, `docs/runbooks/preco-diaria-deploy.md`
- Modify: `README.md` (tabela de releases, badge de versão, trechos que falam de preço semanal), `docs/qa-playbook.md` e demais `docs/*.md` que citem preço semanal (`grep -rniE "semanal|por semana|weeklyRate" docs README.md | grep -v "docs/releases\|docs/superpowers"`), `backend/package.json` (+ os dois campos de versão do topo de `backend/package-lock.json`) → **2.28.0**, `frontend/package.json` → minor seguinte ao valor atual

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Release notes `v2.9.0.md`**: o que muda para o usuário (diária, tempo mínimo, estimativa e aviso), para a API (campos novos, `weeklyRate` legado por uma versão, parâmetros `minDailyRate`/`maxDailyRate`, legado `minPrice`/`maxPrice`), a migration (conversão ÷ 7, `COALESCE`, alertas, `queryHash` não recalculado) e as limitações (arredondamento 699 → 99,86 → 699,02; app iOS e PWA antigos dependem da compatibilidade; filtro por tempo mínimo fica para depois).
- [ ] **Step 2: Runbook `preco-diaria-deploy.md`** (executado pelo agente de infra): **preflight só leitura** — `SELECT count(*) total, count(*) FILTER (WHERE "weeklyRate" IS NULL) sem_semanal, count(*) FILTER (WHERE "weeklyRate" IS NOT NULL AND "weeklyRate" <> "dailyRate") semanal_diferente FROM "Vehicle";`, amostra das linhas divergentes (`LIMIT 20`) e `SELECT count(*) FROM "SearchAlert" WHERE filters ? 'minPrice' OR filters ? 'maxPrice';` — **se `semanal_diferente > 0` ou `sem_semanal > 0`, parar e mostrar ao dono antes de seguir** (a conversão assume que o preço visível é `weeklyRate ?? dailyRate`); `pg_dump` + tags `pre-<TS>` das imagens; deploy **dos dois serviços juntos** (mesmo padrão do `triluga-deploy-v2.8.0.md`: `build backend frontend`, `up -d --no-deps backend frontend`, healthcheck); verificações pós-deploy (consulta de 5 anúncios mostrando `dailyRate` ≈ antigo ÷ 7, `GET /api/v1/vehicles/<id>` com `weeklyEstimate`, uma busca `?minDailyRate=`, uma criação de anúncio de teste e sua remoção); **rollback**: restaurar o dump + imagens `pre-<TS>` (reverter só o código deixa o banco sem `weeklyRate`; recriar a coluna por `dailyRate × 7` é aproximado e só como último recurso).
  **Preflight extra (revisão independente da migration, 56b40e4):** (a) `SHOW server_version;` ≥ 13 (a migration usa `trim_scale`); (b) `SELECT count(*) FROM _prisma_migrations;` e conferir que as migrations anteriores constam (prod nasceu parcialmente de `db push`; se faltarem, `prisma migrate resolve --applied` antes do deploy, senão o `migrate deploy` tenta reexecutá-las); (c) contar alertas cujo `minPrice`/`maxPrice` **não** casa com `^\s*-?[0-9]+(\.[0-9]+)?\s*$` (a migration descarta esses valores em silêncio; se só um lado era válido, o alerta fica mais largo) e alertas equivalentes duplicados (cada um gera notificação própria, pois o `queryHash` não é recalculado); (d) o `pg_dump` é **gate obrigatório** antes do `migrate deploy`: o rollback exige o dump porque `dailyRate` é sobrescrito (adiar o `DROP COLUMN` não tornaria o rollback só de código).
- [ ] **Step 3: Docs e versões** conforme Files.
- [ ] **Step 4: Verificação final completa (saída real):** `cd backend && npx jest && npx tsc --noEmit -p tsconfig.json && npm run lint:ci && npm run build && npx prisma validate`; `cd ../frontend && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build 2>&1 | grep -iE "error|warning|Build at"`; `grep -rnE "weeklyRate" frontend/src/app` → vazio; `grep -rn "weeklyRate" backend/src --include=*.ts | grep -v "spec\|rental-pricing\|create-vehicle.dto"` → vazio; repetir o teste de migration do Task 2 contra o Postgres descartável; **uma passada de ponta a ponta** com backend real + Postgres descartável + o frontend compilado: criar anúncio pelo app (diária 100, mínimo 1 mês), abrir o detalhe, buscar por faixa, e confirmar no banco `dailyRate=100.00`, `minRentalDays=30`.
- [ ] **Step 5: Commit.** `git add docs README.md backend/package.json backend/package-lock.json frontend/package.json && git commit -m "docs/chore: release v2.9.0 (preço por diária), runbook de deploy e versões"`
