# Revisão das tarefas A.2 (Swagger) e A.3 (x-request-id)

Data: 2026-11-16. Revisor: Claude Sonnet 5.5. Dev: Claude Haiku 5.5 (commits 6b3c346 e 0d3d3a0).
Item de segurança: revisão com mutantes e caça a falhas fora do escopo literal.

## Escopo

- A.2: `isSwaggerEnabled`, `swaggerEnabled` em `app.config.ts`, condição do Swagger em `main.ts`, compose, `.env.example` e docs.
- A.3: `resolveRequestId`, `requestContextMiddleware` e a chamada em `main.ts`.
- Extra pedido: outros pontos que logam ou ecoam texto controlado pelo cliente.

## Método

1. Leitura integral dos dois commits do dev.
2. Busca por outros caminhos de documentação (`SwaggerModule`, `api-json`, `docs-json`, `jsonDocumentUrl`) e por logs com valores do cliente.
3. Teste empírico do que o Node aceita na URL e nos headers (socket cru contra `http.createServer`, Node 20.20.2).
4. Mutantes (63) um a um, sempre em primeiro plano, com restauração por `git checkout` na mesma execução. Specs rodadas por mutante: `src/common`, `src/config`, `src/main.spec.ts`, `src/auth` (`--runInBand`). Um mutante (remover `next()`) pendurou os testes; o runner passou a matar o grupo de processos após 75 s e tratar isso como morto.
5. Para cada sobrevivente não equivalente, teste novo que o mata, provado por nova execução do mutante.

## Achados

### A.2 Swagger

- Único ponto de montagem é `main.ts` (`SwaggerModule.setup('api/docs', ...)`), dentro da condição. Não há outro `SwaggerModule` fora de specs, nem `jsonDocumentUrl` customizado. Com `@nestjs/swagger` 7.4.2 a UI e os esquemas JSON e YAML saem todos do mesmo `setup`; desligado, nenhum existe.
- O Swagger não herda o prefixo global: o caminho é `/api/docs`, e `/api/v1/docs` nunca existe. Teste novo cobre 12 caminhos (docs, docs/, docs-json, docs-yaml, assets da UI, variantes sob `/api/v1`, `/api-json`) e todos dão 404 desligado. Ligado, o teste confere UI com e sem barra final, JSON e YAML.
- Padrão fail closed confirmado: sem a variável, `NODE_ENV=development` sozinho não liga, valor string `'true'` em `app.swaggerEnabled` não liga (a condição exige booleano `true`).
- `isSwaggerEnabled('true\n')` é `true` por causa do `trim`. Aceitável: só liga com a palavra `true` escrita pelo operador; o `trim` evita que `.env` com CRLF ou espaço desligue por engano em dev, e a falha segura continua sendo desligar. Registrado como decisão consciente, coberta por teste.
- Risco operacional (não é código): `.env.example` e `backend/.env.example` trazem `SWAGGER_ENABLED=true`. Quem copiar o exemplo de dev para produção liga o Swagger. O compose tem padrão `false` e `.env.production.example` traz `false`; o certo em produção é partir do arquivo de produção. Sugestão: no deploy, conferir a ausência/`false` da variável.
- `backend/scripts/assessment/load.cjs` usa `/api/docs` como sonda de saúde. Desligado dá 404, que o script trata como saudável (só conta >= 500), então não quebra.

### A.3 x-request-id

- Node já recusa com 400 caracteres de controle, tab, DEL e bytes altos na URL; CR/LF percent-encoded continuam codificados em `originalUrl` (nada decodifica). Logo `path=${originalUrl}` não é forjável. Fica só o inchaço: URL de até ~16 KB entra no log (limite do Node).
- Header `x-request-id` duplicado chega como `abc12345, def67890` (vírgula e espaço), que a regex rejeita e vira UUID. Teste novo cobre. Header de 10 KB passa pelo Node, a regex rejeita e vira UUID; 20 KB o Node recusa com 431 antes do middleware. O header de resposta só carrega o valor validado ou o UUID.
- Um header com byte alto (latin1) chega como string com caractere não ASCII; a regex rejeita.
- A regex ancorada, sem `trim` e sem flag `m`, está correta. Teste novo percorre os 256 códigos de caractere mais separadores Unicode, em três posições, e exige rejeição de tudo fora de `[A-Za-z0-9._-]`.

### Log forjável fora do x-request-id (corrigido, commit 3f00ad3)

- Bug claro: o `@IsEmail` (class-validator) aceita parte local entre aspas com quebra de linha, por exemplo `"a\nrequest_completed status=200"@x.com`. Verificado. O `auth.service` logava `dto.email` cru (`login_attempt`, `login_user_not_found`, `register_attempt`, `forgot_password_email_not_found`) e `user.email` do banco (`register_success`, `login_*`, `refresh_success`). Um anônimo forjava linha de log com uma requisição de login.
- Correção: novo `sanitizeForLog` (`common/utils/log-safe.util.ts`) troca controles C0, DEL, C1 e separadores de linha Unicode por `_` e corta em 200 caracteres. Aplicado em auth, `email.service` (destinatário, assunto, erro), `storage.service` (`file.originalname`, que o multer pode decodificar de `filename*=` com `%0A`, e `url`) e `chat.gateway` (`conversationId` do cliente em `socket_send_attempt`, logado antes de qualquer validação).
- Não corrigido, só registrado: `featured.service.ts` já tem um `safeLog` local equivalente (duplicação; poderia usar o utilitário novo). Há mensagens de erro de terceiros (Asaas, SMTP, Redis) e `JSON.stringify(job.data)` em `cache-queue.service.ts` (debug, JSON escapa quebras de linha) interpolados em logs; a origem não é o cliente HTTP diretamente. Recomendação estrutural: um `ConsoleLogger` próprio que escape controles em toda mensagem, para cobrir logs futuros em vez de depender de cada chamada. E-mail com quebra de linha também é aceito no cadastro e fica gravado no banco; vale restringir o validador (outro item).
- `HttpExceptionLoggingFilter` registra só `requestId`, método, `originalUrl`, status e `userId` (sub do JWT); o corpo da resposta devolve `path` (`originalUrl`) e a mensagem da exceção, ambos já seguros ou controlados pelo servidor.

## Mutantes

Legenda: MORTO = algum teste falhou. "tsc" = morto por erro de compilação do ts-jest. Equivalente = sem efeito observável.

Antes dos testes novos sobreviveram: R15, R17, R20, W3, W4, W6, W7, W8, W9, W10, W11, W15 (os W15/W6 sobreviveram porque os testes só usavam `url === originalUrl`). Depois, todos mortos, exceto os equivalentes R17 e R20.

| id | arquivo:linha | mutação | resultado | teste que mata |
|----|---------------|---------|-----------|----------------|
| S1 | swagger.util.ts:11 | undefined retorna true | MORTO | app.config.spec "sem a variável", integração 404 |
| S2 | swagger.util.ts:14 | sem trim | MORTO | swagger.util.spec `" true "`, `"\ttrue\n"` |
| S3 | swagger.util.ts:14 | sem toLowerCase | MORTO | swagger.util.spec `"TRUE"`, `"True"` |
| S4 | swagger.util.ts:14 | `!== 'false'` | MORTO | swagger.util.spec desligados (`""`, `"1"`, `"yes"`) |
| S5 | swagger.util.ts:14 | `trim() !== ''` | MORTO | app.config.spec `"false"` |
| S6 | swagger.util.ts:14 | `startsWith('true')` | MORTO | swagger.util.spec `"truee"`, `"true1"` |
| C1 | app.config.ts:33 | `true` fixo | MORTO | app.config.spec "fail closed" |
| C2 | app.config.ts:33 | `NODE_ENV !== 'production'` | MORTO | app.config.spec NODE_ENV=development |
| C3 | app.config.ts:33 | `Boolean(env)` | MORTO | app.config.spec `"false"` |
| C4 | app.config.ts:33 | linha removida | MORTO (tsc) | app.config.spec não compila |
| M1 | main.ts:53 | `!== true` | MORTO | main.spec swagger (4 casos) |
| M2 | main.ts:53 | `!= null` | MORTO | main.spec swagger desligado |
| M3 | main.ts:53 | default `true` | MORTO | main.spec "ausente" |
| M4 | main.ts:53 | condição `true` | MORTO | main.spec (vários) |
| M5 | main.ts:53 | sem `=== true` | MORTO | main.spec string `"true"` |
| M6 | main.ts:24 | remove `app.use(requestContextMiddleware)` | MORTO | main.spec "primeiro app.use" |
| M7 | main.ts:59 | caminho `docs` | MORTO | main.spec "monta em api/docs" |
| M8 | main.ts:24 | middleware depois de outros `use` | MORTO | main.spec "primeiro app.use" |
| R1 | request-id.util.ts:5 | sem `^` | MORTO | middleware.spec unicode; request-id.spec |
| R2 | request-id.util.ts:5 | sem `$` | MORTO | request-id.spec 65 caracteres |
| R3 | request-id.util.ts:5 | `{1,64}` | MORTO | request-id.spec 7 caracteres |
| R4 | request-id.util.ts:5 | `{8,}` | MORTO | request-id.spec 65 caracteres |
| R5 | request-id.util.ts:5 | `{8,65}` | MORTO | request-id.spec 65 caracteres |
| R6 | request-id.util.ts:5 | espaço na classe | MORTO | request-id.spec espaço |
| R7 | request-id.util.ts:19 | `test(raw.trim())` | MORTO | request-id.spec espaço nas pontas |
| R8 | request-id.util.ts:19 | sem `typeof` | MORTO (tsc) | request-id.spec não compila |
| R9 | request-id.util.ts:23 | devolve `raw` | MORTO | request-id.spec (26 casos) |
| R10 | request-id.util.ts:5 | flag `m` | MORTO | request-id.spec "LF no fim" |
| R11 | request-id.util.ts:5 | `\n` na classe | MORTO | request-id.spec quebra de linha |
| R12 | request-id.util.ts:5 | `%` na classe | MORTO | request-id.spec percent-encoded |
| R13 | request-id.util.ts:5 | sem `.` | MORTO | request-id.spec pontos |
| R14 | request-id.util.ts:5 | `\s` na classe | MORTO | request-id.spec espaços |
| R15 | request-id.util.ts:5 | ESC na classe | SOBREVIVEU, depois MORTO | request-id.spec varredura 0 a 255 |
| R16 | request-id.util.ts:5 | faixa Latin-1 na classe | MORTO | request-id.spec unicode |
| R17 | request-id.util.ts:5 | flag `i` | SOBREVIVEU (equivalente) | a classe já tem maiúsculas e minúsculas |
| R18 | request-id.util.ts:19 | `test(raw as string)` | MORTO (tsc) | não compila |
| R19 | request-id.util.ts:19 | `typeof` mais `trim` | MORTO | request-id.spec espaço |
| R20 | request-id.util.ts:5 | flag `s` | SOBREVIVEU (equivalente) | regex sem `.` |
| R21 | request-id.util.ts:19 | `test(String(raw))` | MORTO (tsc) | não compila |
| R22 | request-id.util.ts:23 | UUID mais `\n` | MORTO | request-id.spec (28 casos) |
| W1 | request-context.middleware.ts:21 | não seta o header | MORTO | middleware.spec "ecoa no response" |
| W2 | request-context.middleware.ts:16 | usa header cru | MORTO | middleware.spec "espaço no meio" |
| W3 | request-context.middleware.ts:23 | remove log de início | SOBREVIVEU, depois MORTO | middleware.spec "loga o início" |
| W4 | request-context.middleware.ts:47 | remove log de fim (2xx) | SOBREVIVEU, depois MORTO | middleware.spec "loga o fim" |
| W5 | request-context.middleware.ts:32 | nível sempre `log` | MORTO (tsc) | middleware.spec não compila |
| W6 | request-context.middleware.ts:24 | início com `req.url` | SOBREVIVEU, depois MORTO | middleware.spec "URL original" |
| W7 | request-context.middleware.ts:32 | `> 500` | SOBREVIVEU, depois MORTO | middleware.spec status 500 |
| W8 | request-context.middleware.ts:32 | `> 400` | SOBREVIVEU, depois MORTO | middleware.spec status 400 |
| W9 | request-context.middleware.ts:29 | usuário padrão `x` | SOBREVIVEU, depois MORTO | middleware.spec "usuário anônimo" |
| W10 | request-context.middleware.ts:20 | sem `req.startedAt` | SOBREVIVEU, depois MORTO | middleware.spec "guarda requestId e startedAt" |
| W11 | request-context.middleware.ts:19 | sem `req.requestId` | SOBREVIVEU, depois MORTO | middleware.spec "guarda requestId" |
| W12 | request-context.middleware.ts:50 | sem `next()` | MORTO (timeout) | middleware.spec |
| W13 | request-context.middleware.ts:38 | `error` vira `warn` | MORTO | middleware.spec status 500 |
| W14 | request-context.middleware.ts:43 | `warn` vira `log` | MORTO | middleware.spec status 400 |
| W15 | request-context.middleware.ts:35 | fim com `req.url` | SOBREVIVEU, depois MORTO | middleware.spec "loga o fim" |
| L1 | auth.service.ts (login_attempt) | sem sanitize | MORTO | auth.service.log-safe.spec |
| L2 | auth.service.ts (login_user_not_found) | sem sanitize | MORTO | auth.service.log-safe.spec |
| L3 | log-safe.util.ts:14 | faixa só até `\u0009` | MORTO | log-safe.util.spec LF, CR |
| L4 | log-safe.util.ts:14 | sem faixa C1 | MORTO | log-safe.util.spec NEL |
| L5 | log-safe.util.ts:14 | sem U+2028/2029 | MORTO | log-safe.util.spec |
| L6 | log-safe.util.ts:15 | sem `slice` | MORTO | log-safe.util.spec corte |
| L7 | log-safe.util.ts:14 | troca por vazio | MORTO | log-safe.util.spec comprimento |
| L8 | log-safe.util.ts | limite 2000 | MORTO | log-safe.util.spec corte |

Total: 63 mutantes. Equivalentes: 2 (R17, R20). Mortos: 61 (5 por tsc: C4, R8, R18, R21, W5). Sobreviventes reais: 0. Doze sobreviveram à entrega do dev; todos foram mortos por teste novo.

A árvore `backend/src` ficou sem diff após cada rodada e ao final.

## Resultados finais

- `npx jest --runInBand`: 35 suites, 781 testes verdes (linha de base 33 suites, 754 testes).
- `npx tsc --noEmit -p tsconfig.json`: sem erros. `npm run lint:ci`: sem avisos. `npm run build`: ok.

## Commits desta revisão

- 3f00ad3: sanitização de logs (correção).
- Teste de rotas do Swagger desligado e ligado.
- Teste do request id, caractere a caractere.
- Teste do middleware (logs, níveis, contexto).
- Este relatório.

## Limites

- Os testes de integração montam um Nest mínimo; o `main.ts` real com `AppModule` exige banco e não foi subido. A mesma sequência (prefixo, middleware, Swagger condicional) é coberta por `main.spec.ts` com app falso.
- O que só o ambiente real mostra: se o container de produção recebe `SWAGGER_ENABLED` de algum arquivo `.env` inesperado; se o proxy (Cloudflare, nginx) remove ou reescreve `x-request-id` e limita headers antes do Node; o tamanho real máximo de URL aceito pelo proxy.
- Não auditei todos os 110 pontos de log; olhei os que interpolam valores que podem vir do cliente. Mensagens de erro de terceiros ficam como risco residual baixo (ver achados).
- Há alteração não commitada em `docs/superpowers/plans/2026-11-16-seguranca-cloudflare.md` que não é desta revisão; deixei intacta.
