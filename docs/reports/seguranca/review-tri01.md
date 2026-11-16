# Revisão da Tarefa TRI-01 (exposição de hash de senha/CPF do autor)

Data: 2026-11-16. Revisor: Claude Sonnet 5. Item de segurança (exposição de hash de senha e CPF de usuário real em produção). Commit revisado: `35868ea` (dev, haiku). Commits do revisor: ver seção final.

## Escopo

- `backend/src/common/constants/public-author.constant.ts` (`PUBLIC_AUTHOR_SELECT`, mais `PUBLIC_OWNER_SELECT` adicionado nesta revisão)
- `backend/src/reviews/reviews.service.ts` (`listByVehicle`)
- `backend/src/vehicles/vehicles.service.ts` (`findOne`, `mapVehicleDetail`, `mapOwnerSummary`)
- Varredura em todo `backend/src` por outros `include` de `User`/`Profile` completos que alimentem resposta pública ou semi-pública (`chat`, `profiles`, `admin`, `auth`, `favorites`, `notifications`, `privacy`, `users`).

Fora do escopo: nginx, Cloudflare, VPS, rotação de segredo.

## Método

1. Leitura do diff inteiro (`git show 35868ea`).
2. Leitura completa de `mapVehicleDetail`, `mapOwnerSummary` e `findOne` em `vehicles.service.ts`, antes e depois da mudança, para confirmar ou refutar a afirmação do dev sobre vazamento real vs. defesa em profundidade.
3. Grep em todo `backend/src` por `profile: true` / `include` de autor, e leitura de cada ocorrência e do seu controller (guard `@Public()` ou `@Roles`) para separar exposição pública real de exposição interna/admin/self.
4. 17 mutantes no select/constant e nos dois usos, rodados em primeiro plano com `cd backend && npx jest src/reviews src/vehicles --runInBand`, restaurados com `git checkout -- <arquivo>` na mesma chamada.
5. Suíte completa, `tsc --noEmit`, `lint:ci`, `build`.

## Achado 1: vazamento real confirmado, mas só em `reviews.listByVehicle`

Confirmado por leitura de código, não só pela palavra do dev.

- **`GET /reviews/vehicle/:vehicleId` (`reviews.controller.ts`, `@Public()`, sem guard) vazava de fato.** `ReviewsService.listByVehicle` (antes da correção) devolvia o resultado do Prisma **sem nenhum mapper**: `return this.prisma.review.findMany({ include: { author: { include: { profile: true } } }, ... })`. O objeto `author` ia inteiro para o JSON da resposta HTTP: `passwordHash`, `refreshTokenHash`, `emailVerificationToken`, `tokenVersion`, `email`, `documentNumber` (CPF), `addressLine`, `phone`, `driverLicenseNumber`. Esta é a exposição real e grave do TRI-01. A correção do dev (`select: PUBLIC_AUTHOR_SELECT`) fecha exatamente este buraco.
- **`VehiclesService.findOne` (detalhe público do anúncio) NÃO vazava na resposta, antes ou depois da mudança.** `mapVehicleDetail` (linha 834-843, inalterada pela correção) já reduzia `review.author` a `{ id, fullName }` antes de montar o payload que vai para `cacheQueueService.setJson` e para o cliente. Troquei o `include` do autor por `select: PUBLIC_AUTHOR_SELECT` e comparei o `mapVehicleDetail` de antes e depois: idêntico, só lê `review.author.id` e `review.author.profile?.fullName`. A troca aqui é defesa em profundidade (reduz o que entra na memória do processo e no cache, não o que sai na resposta), confirmando a afirmação do dev.

## Achado 2: mesmo padrão no `owner` do anúncio (CPF do dono em memória), owner.phone é decisão de produto

`findOne` também tinha `owner: { include: { profile: true, userReviewsReceived: {...} } }` — CPF, hash de senha etc. do **dono** do veículo (não o autor da review) entravam na memória e no payload interno antes de `mapOwnerSummary` reduzir. `mapOwnerSummary` (linha 972-1008, não tocada pelo dev) já devolvia só `{ id, fullName, avatarUrl, city, state, phone, ratingAverage, reviewsCount }` — sem CPF, sem hash. Mesmo padrão do Achado 1: não é vazamento real na resposta, é defesa em profundidade.

Aplicado o mesmo tratamento: criei `PUBLIC_OWNER_SELECT` (mesmo arquivo de constantes) e troquei o `include` do `owner` em `findOne` por `select: PUBLIC_OWNER_SELECT`. Trivial e seguro porque `PUBLIC_OWNER_SELECT` pede exatamente os campos que `mapOwnerSummary` já lia (`id`, `profile.{fullName,avatarUrl,city,state,phone}`, `userReviewsReceived.rating`) — nenhuma mudança de forma na resposta. Testado (ver mutante 13-17).

**`owner.phone` continua exposto no detalhe público do anúncio — isto é intencional (contato do dono), não é bug.** Confirmado em `mapOwnerSummary`: `phone: owner.profile?.phone ?? null` sempre esteve lá, antes e depois de qualquer correção. Não removi. **Decisão de produto para o dono**, não decido sozinho.

Não estendi o mesmo `select` a outros usos de `owner: { include: { profile: true, ... } } }` no mesmo arquivo (`create`, `update`, `findSimilar`, listagens) nem em `favorites.service.ts`/`chat.service.ts`/`profiles.service.ts`, que repetem o padrão idêntico. Todos já passam por um mapper que reduz a resposta (confirmado abaixo), então não há vazamento real; estender o `select` para lá é refatoração maior, toca ~10 pontos de consulta sem cobertura de teste dedicada, e fica fora do escopo que a tarefa pediu (TRI-01 = `reviews.listByVehicle` + `vehicles.findOne`). Fica registrado como seguimento de defesa em profundidade, a decidir pelo dono se quer um item TRI próprio para isso.

## Achado 3: varredura por outras exposições públicas — nenhuma outra encontrada

Grep em `backend/src` por `profile: true` / `include` de autor achou estes arquivos, todos verificados:

| Arquivo | Uso | Exposição | Veredito |
|---|---|---|---|
| `chat/chat.service.ts` (7 ocorrências) | `sender`/`participants.user` com `profile: true` | Só para o OUTRO participante autenticado da conversa (`ensureParticipant` exige membership); `mapMessage`/`mapConversationSummary` reduzem a `{id, email, fullName, avatarUrl}` antes de responder | Esperado, não é bug (nome+avatar+email para quem já está na conversa). Fora do escopo do TRI-01. |
| `profiles/profiles.service.ts` `getPublicProfile` | `user`/`userReview.author` com `profile: true` | Rota `@Public()`, mas o mapper reduz a `{id, fullName, avatarUrl, bio, city, state}` — sem CPF, sem hash | Defesa em profundidade possível, não vazamento real. Não corrigido (mesmo raciocínio do Achado 2: fora do escopo pedido). |
| `favorites/favorites.service.ts` | `owner` com `profile: true` | Rota autenticada, só os favoritos do próprio usuário; mapper reduz a `{id, fullName, avatarUrl, city, state}` | Não é exposição pública nem vazamento. |
| `notifications/notification-processor.service.ts` | `user` com `profile: true` | Job interno de fila (push/e-mail), nunca vira resposta HTTP | Não é vetor de exposição. |
| `users/users.service.ts` | `profile: true` em `findById`/`findByEmail`/etc. | Usado por auth/admin; nenhum controller devolve o resultado cru — sempre passa por `sanitizeUser`/`sanitizeSessionProfile`, que corta `passwordHash` e os campos de documento | Não é vazamento. |
| `admin/admin.service.ts` | `owner`/`profile: true` | Controller com `@Roles(Role.ADMIN)` na classe inteira | Admin-only, fora do escopo de exposição pública. |
| `privacy/privacy.service.ts` `exportMyData` | `user` com `profile: true` | Exportação de dados do PRÓPRIO usuário (LGPD), autenticado | Esperado (é o próprio usuário baixando os próprios dados). |

Não achei nenhuma outra exposição pública real (sem login) de hash de senha, CPF ou endereço além da já corrigida em `reviews.listByVehicle`.

## Mutantes

17 mutantes (mínimo pedido: 15), todos no select/constant e no uso em `reviews.service.ts`/`vehicles.service.ts`. Rodados em primeiro plano, `git checkout -- <arquivo>` sempre na mesma chamada do `jest`.

| # | Mutante | Resultado |
|---|---|---|
| 1 | `PUBLIC_AUTHOR_SELECT` sem `avatarUrl` | MORTO |
| 2 | `PUBLIC_AUTHOR_SELECT` sem `fullName` | MORTO |
| 3 | `PUBLIC_AUTHOR_SELECT` com `documentNumber` (CPF) reintroduzido | MORTO |
| 4 | `PUBLIC_OWNER_SELECT` sem `phone` | MORTO |
| 5 | `PUBLIC_OWNER_SELECT` sem `city`/`state` | MORTO |
| 6 | `PUBLIC_OWNER_SELECT` com `documentNumber` (CPF) reintroduzido | MORTO |
| 7 | `PUBLIC_OWNER_SELECT` com `passwordHash` irmão de `id` | MORTO |
| 8 | `reviews.service.ts`: `author` volta a `include: { profile: true }` (reversão total, vulnerabilidade original) | MORTO |
| 9 | `reviews.service.ts`: `author: true` (atalho equivalente a include completo) | MORTO |
| 10 | `reviews.service.ts`: `select` do autor cai para `{ id: true }` (perde o profile) | MORTO |
| 11 | `vehicles.service.ts` `findOne`: `reviews.author` volta a `include: { profile: true }` | MORTO |
| 12 | `vehicles.service.ts` `findOne`: `reviews.author: true` | MORTO |
| 13 | `vehicles.service.ts` `findOne`: `owner` volta a `include: { profile: true, userReviewsReceived: {...} } }` (reversão total) | MORTO |
| 14 | `vehicles.service.ts` `findOne`: `owner: true` | MORTO |
| 15 | `vehicles.service.ts` `findOne`: `owner.select` esquece `userReviewsReceived` | **SOBREVIVEU na 1ª rodada** — morto depois de acrescentar asserção de `ratingAverage`/`reviewsCount` do owner no teste |
| 16 | `vehicles.service.ts` `findOne`: `owner.select` sem `fullName` (override local, não na constante) | MORTO |
| 17 | `vehicles.service.ts` `findOne`: `owner.select` sem `phone` (override local) | MORTO |

Mutante 15 não era equivalente: sem `userReviewsReceived` no select, `owner.ratingAverage`/`owner.reviewsCount` voltam silenciosamente a `0`/`0` (bug funcional, não de segurança) e nenhum teste existente cobria esse valor. Acrescentei `ratingAverage: 4, reviewsCount: 1` à asserção `toMatchObject` em `vehicles.public-author.spec.ts`, que agora mata o mutante.

17/17 mortos na rodada final. `git diff --stat -- backend/src` ficou vazio depois de cada mutante (confirmado a cada passo); nenhum processo `jest`/`node` órfão ao final (`ps aux` limpo).

### Incidente durante a revisão (registrado para transparência)

No mutante 2, o primeiro `git checkout -- backend/src/common/constants/public-author.constant.ts` restaurou o arquivo para o **HEAD** (versão do dev, sem `PUBLIC_OWNER_SELECT`) em vez da minha correção real, porque eu ainda não tinha dado `git add` nela — `git checkout --` sem stage volta para o commit, não para o estado de trabalho anterior. Reescrevi o arquivo com `PUBLIC_OWNER_SELECT` de volta, confirmei testes verdes, e a partir daí passei a `git add` os três arquivos reais antes de rodar qualquer mutante, para que `git checkout --` restaure do índice (staged) e nunca do HEAD. Não houve perda de trabalho no commit nem no repositório — só um retrabalho de alguns minutos durante a sessão.

## Testes e build

- `cd backend && npx jest --runInBand`: **41 suítes / 811 testes, todos verdes** (baseline do dev: 41/808; +3 pelos testes novos de `owner`).
- `npx tsc --noEmit -p tsconfig.json`: sem erros.
- `npm run lint:ci`: sem erros, sem warnings.
- `npm run build`: build limpo.

## Achados para o dono decidir

1. **`owner.phone` exposto no detalhe público do anúncio** (`GET /vehicles/:slugOrId`): é contato do dono, decisão de produto já existente, não bug. Mantido como está.
2. **CPF do dono do anúncio em memória do processo** antes desta revisão (mesmo padrão do CPF do autor da review): corrigido em `findOne` com `PUBLIC_OWNER_SELECT`. O mesmo padrão se repete em `create`, `update`, `findSimilar` de `vehicles.service.ts` e em `favorites.service.ts`, `chat.service.ts`, `profiles.service.ts` (`getPublicProfile`) — todos já filtrados por mapper antes da resposta, logo sem vazamento real, mas candidatos a defesa em profundidade. Não toquei: é refatoração maior (~10 pontos de consulta), sem teste dedicado por ponto, fora do escopo pedido para o TRI-01. Sugiro um item próprio (TRI de defesa em profundidade) se o dono quiser essa varredura completa.
3. **Chat expõe `email` do outro participante** (`chat.service.ts`, `mapMessage`/`mapConversationSummary`): só para quem já está autenticado e participando da conversa, não é exposição pública. Fora do escopo de segurança pedido, registrado para o dono avaliar se é intencional (contato) ou deveria ser removido.

## Limites desta revisão

- Não executei a aplicação real (sem banco rodando); toda a confirmação foi por leitura de código e por testes com mock do Prisma (`pickSelect`), que simula a seleção de campos mas não é o Prisma real.
- Não revisei lint/tsc/build fora de `backend` (sem alterações no frontend nesta tarefa).
- Não fiz varredura de todo `backend/src` por TODOS os `include` possíveis de qualquer relação (só os que batem com os greps de autor/profile/owner pedidos); é possível que exista algum outro ponto fora desse padrão de nomenclatura.

## Commits

- `35868ea` (dev, haiku): correção original de `reviews.listByVehicle` e `vehicles.findOne` (autor da review).
- Commit desta revisão (sonnet): `PUBLIC_OWNER_SELECT`, troca do `include` do `owner` em `findOne`, testes novos (`vehicles.public-author.spec.ts`) e este relatório.
