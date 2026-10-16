# Preço por diária, tempo mínimo e estimativa semanal/mensal — design

Data: 2026-10-15 · Status: aguardando revisão do dono

## 1. Objetivo

Voltar o preço do anúncio para **valor por diária**, permitir que o dono escolha um **tempo mínimo de aluguel** (ou nenhum), e mostrar ao interessado, de forma **explícita**, quanto pagaria por **semana** e por **mês** — deixando claro que o pagamento é combinado **entre as pessoas**, sem o Triluga no meio.

Sucesso = cada anúncio mostra a diária e a estimativa certa em todas as telas; os preços atuais não mudam de valor real; clientes antigos (PWA em cache, app iOS desatualizado) não mostram preço errado.

## 2. Decisões tomadas (com o dono, 2026-10-15)

| Tema | Decisão |
|---|---|
| Preço | **Diária** (volta a ser o preço de verdade) |
| Semanal e mensal | **Calculados** da diária: semana = × 7, mês = × 30; sem preço próprio e sem desconto |
| Tempo mínimo | Escolhido no cadastro entre opções prontas: **sem mínimo, 3 dias, 1 semana, 2 semanas, 1 mês, 3 meses** |
| Anúncios existentes | **Convertidos sozinhos: valor semanal ÷ 7**, arredondado a centavos |
| Intermediação | O Triluga **não** intermedeia: o cálculo é estimativa, com aviso claro |

Esta decisão substitui a antiga ("o preço é semanal, é intencional"); o `weeklyRate` deixa de existir como campo.

## 3. Fora do escopo

Desconto para semana/mês, preço semanal ou mensal definido pelo dono, **filtro de busca por tempo mínimo**, valor livre de tempo mínimo (as opções são fixas), qualquer mudança em pagamento (o aluguel segue combinado entre as partes).

## 4. Modelo de dados

- `Vehicle.dailyRate` (Decimal(10,2), obrigatório, indexado) passa a ser a **diária real**.
- **Novo** `Vehicle.minRentalDays Int?` — `null` = sem tempo mínimo; valores aceitos: **3, 7, 14, 30, 90** (validado por lista fixa; guardado em dias, então liberar outros valores depois não exige migration).
- `Vehicle.weeklyRate` **removido** (após a conversão).

### Migration (uma só)
1. `UPDATE "Vehicle" SET "dailyRate" = ROUND(COALESCE("weeklyRate","dailyRate") / 7, 2);` — `weeklyRate` é a fonte do preço hoje (campo obrigatório na criação; o filtro e a ordenação leem ele). O `COALESCE` cobre linhas antigas sem `weeklyRate`.
2. `ALTER TABLE "Vehicle" ADD COLUMN "minRentalDays" INTEGER;`
3. `ALTER TABLE "Vehicle" DROP COLUMN "weeklyRate";`
4. **Alertas de busca** (`SearchAlert.filters` é JSON com `minPrice`/`maxPrice` em valor semanal): converter esses dois campos ÷ 7 (`jsonb_set`). O `queryHash` **não** é recalculado (depende do código); consequência aceita: a pessoa pode criar um alerta equivalente a um antigo sem o sistema perceber o duplicado.

**Verificações obrigatórias antes do deploy (na produção, só leitura):** quantos anúncios têm `dailyRate` ≠ `weeklyRate` (se houver, qual dos dois o dono enxerga hoje na tela — a conversão parte do `weeklyRate`; confirmar), quantos alertas têm faixa de preço, e o dump do banco. Diferença de arredondamento: R$ 699/semana vira R$ 99,86/dia e a estimativa semanal mostra R$ 699,02 — documentado.

## 5. Cálculo e API

**Uma única função no backend** calcula `weeklyEstimate = round(dailyRate × 7, 2)` e `monthlyEstimate = round(dailyRate × 30, 2)` (mês de 30 dias, dito na tela); web, iOS, chat, favoritos e alertas usam a mesma. Se há `minRentalDays`, também `minPeriodTotal = round(dailyRate × minRentalDays, 2)`.

**Respostas** de anúncio (detalhe, listagem, favoritos, chat, perfil público): `dailyRate`, `minRentalDays`, `weeklyEstimate`, `monthlyEstimate` e `minPeriodTotal`. **Compatibilidade por uma versão:** continuam devolvendo `weeklyRate` (= `weeklyEstimate`), para um frontend antigo — que lê `weeklyRate ?? dailyRate` e escreve "/semana" — **seguir mostrando o preço certo**.

**Requisições** de criação/edição: `dailyRate` (obrigatório) e `minRentalDays` (opcional). Por uma versão, `weeklyRate` ainda é aceito quando `dailyRate` não vem (convertido ÷ 7); se vêm os dois, `dailyRate` vale.

**Busca:** novos parâmetros `minDailyRate` / `maxDailyRate` filtram a diária. Os antigos `minPrice` / `maxPrice` continuam por uma versão com o **significado antigo (semanal, convertido ÷ 7)** e saem na seguinte — mudar o significado sem trocar o nome faria clientes antigos buscarem errado em silêncio. A ordenação por preço passa a usar `dailyRate`. Alertas de busca comparam a diária com o filtro (já convertido pela migration).

## 6. Experiência

- **Cadastro (passo de preço):** campo "Valor da diária", seletor de tempo mínimo (inclui "Sem tempo mínimo") e, ao vivo, a **prévia do que o interessado verá** (semana, mês e, se houver mínimo, o total do período mínimo). A sugestão da FIPE usa a regra atual dividida por 7 (continua sendo uma regra **sem validação de mercado**).
- **Card e listagens:** "R$ 100/dia"; selo "mín. 1 semana" quando houver mínimo.
- **Detalhe do anúncio e comparador:** bloco **"Quanto você pagaria (estimativa)"**: diária, 7 dias, 30 dias e, se houver mínimo, "Período mínimo: 1 mês — R$ 3.000,00".
- **Aviso fixo, sempre visível junto ao bloco:** "Valores estimados a partir da diária. O pagamento e as condições são combinados e feitos diretamente entre você e o anunciante; o Triluga não participa nem intermedeia."
- Desktop e mobile (o Triluga duplica os dois).

## 7. Onde mexe (≈ 30 arquivos, 71 ocorrências de `weeklyRate`/`dailyRate`)

Backend: `vehicles.service` (filtro linha ~180, ordenação ~269/271, criação ~596, edição ~653, mapeamentos), `create-vehicle.dto`, `list-vehicles-query.dto`, `search-alerts.service` (comparação ~302), `favorites.service`, `chat.service`, `profiles.service`, FIPE (`lookups.service`), `seed.js`, `scripts/add-random-cars.js`, schema + migration. Frontend: cards, detalhe (desktop/mobile), comparador, favoritos, chat, painel do dono (lista e passo de preço), perfil público, filtros de busca, `domain.models.ts`, `vehicles-api.service.ts`, prévia do anúncio.

## 8. Entrega, testes e riscos

- **Backend e frontend no mesmo deploy:** entregar só um lado mostraria preço errado. A compatibilidade da seção 5 cobre o intervalo em que um cliente antigo ainda estiver aberto.
- **Testes:** unidade do cálculo (arredondamento, semana, mês, mínimo); validação de `minRentalDays`; compatibilidade (`weeklyRate` na entrada e na saída; `minPrice`/`maxPrice` legados); migration **testada em cópia de um dump real**; busca e ordenação por diária; alerta; passada em navegador real (desktop e mobile) nas telas listadas, inclusive com um anúncio sem mínimo e outro com mínimo de 1 mês.
- **Riscos:** (1) conversão errada de dados se `dailyRate` e `weeklyRate` divergirem — por isso a verificação prévia; (2) cache de PWA antigo — coberto pela compatibilidade de resposta, mas a busca por faixa de preço de um cliente antigo usa os parâmetros legados (semanal), que continuam funcionando por uma versão; (3) o app iOS publicado na loja só atualiza quando o usuário atualiza.
- **Rollback:** a migration descarta `weeklyRate`; o rollback exige restaurar o dump (ou recriar a coluna a partir de `dailyRate × 7`). Decidir com o dono antes do deploy.

## 9. Relação com as assinaturas

Sem conflito de regra, mas as duas mexem em `VehiclesService` e no passo de cadastro. **Ordem recomendada: preço por diária primeiro, assinaturas depois**; o plano de implementação das assinaturas precisa partir do código já alterado.

## 10. Premissas a confirmar

- O dono enxerga hoje, na tela, o `weeklyRate` (a conversão parte dele).
- Mês de 30 dias para a estimativa mensal.
- As opções de tempo mínimo: sem mínimo, 3 dias, 1 semana, 2 semanas, 1 mês, 3 meses.
