# Deploy do Triluga v2.9.0 (preço por diária) — roteiro para o agente de infra

Escrito para: o agente que opera a VPS (`31.220.104.87`, compose project `triluga` em `/root/Triluga`). Script de apoio: [`preco-diaria-deploy.sh`](./preco-diaria-deploy.sh). Contexto da entrega: [`docs/releases/v2.9.0.md`](../releases/v2.9.0.md), spec e plano em `docs/superpowers/` (`2026-10-15-preco-diaria-*`).

**Esta entrega altera dados de preço de todos os anúncios e remove uma coluna do banco (`Vehicle.weeklyRate`).** Siga na ordem, pare se qualquer verificação falhar e avise o dono.

## 0. Regras
- A VPS é compartilhada com Lumen e SelahIA e tem outro agente atuando. **Não faça dois deploys ao mesmo tempo** e não toque em nada que não seja o Triluga.
- Nenhuma chave ou segredo entra neste roteiro nem nos logs. Esta entrega **não** mexe no `.env`.
- Backend e frontend vão **juntos**, no mesmo deploy. Nunca suba só um.
- Antes de qualquer mudança no nginx (não esperada aqui): backup do arquivo (`cp arq arq.bak-$(date +%s)`) e `nginx -t`.
- Rode `deploy` em `nohup`/`tmux` (o build é longo). Copie o script com `scp` e rode com `bash` — nada de heredoc via ssh.

## 1. Por que o rollback é especial
A migration `20261015120000_vehicle_daily_rate_min_rental`:
1. cria `Vehicle.minRentalDays`;
2. **sobrescreve** `dailyRate = ROUND(COALESCE(weeklyRate, dailyRate) / 7, 2)`;
3. **apaga** a coluna `weeklyRate` (`DROP COLUMN`, irreversível);
4. converte as chaves `minPrice`/`maxPrice` dos alertas de busca para `minDailyRate`/`maxDailyRate` (valores inválidos são descartados em silêncio) **sem** recalcular o `queryHash`.

Consequências:
- **O `pg_dump` é gate obrigatório**: o `deploy` do script não roda sem `ACK_DUMP=1`, gera o dump, testa (`gzip -t`, confere que contém `weeklyRate`) e só então segue. Adiar o `DROP COLUMN` para outra versão não tornaria o rollback "só de código", porque o `dailyRate` já foi sobrescrito.
- **Código antigo não funciona com o banco novo** (ele lê/escreve `weeklyRate`). Por isso, ao contrário do v2.8.0, o script **não** faz rollback automático de código quando o healthcheck falha.
- Recriar `weeklyRate = dailyRate x 7` a partir do banco novo é aproximado (699 vira 99,86 vira 699,02) e só serve como último recurso, nunca como plano.

## 2. Pré-requisitos (dono + infra)
1. **Código na VPS.** O clone `/root/Triluga` puxa do GitHub, então o dono precisa autorizar o push dos commits do preço (`3f1f7ae` … `9f6f88a`, mais o commit de release deste roteiro).
   - Se aprovou o `HEAD` inteiro: `git push origin master` e, na VPS, `cd /root/Triluga && git pull --ff-only origin master`.
   - Se aprovou só até um SHA: `git push origin <SHA>:refs/heads/release/v2.9.0` e, na VPS, `git fetch origin && git checkout release/v2.9.0`.
   - O deploy leva o `HEAD` do clone inteiro: o dono precisa confirmar o SHA, inclusive se há commits de **outras frentes** entre o último deploy e o SHA escolhido. SHA a implantar: `__________`.
   - Fazer o `pull`/`checkout` **antes** do preflight não altera os containers em execução; só atualiza os arquivos (o preflight lê a lista de migrations do código novo).
2. **Nenhuma variável nova** no `.env`. Confirme só que o `.env` atual continua íntegro (`chmod 600`).
3. **Avisar o dono** de que, depois do deploy, o app iOS e o PWA já instalados continuam funcionando apenas pela camada de compatibilidade (`weeklyRate`, `minPrice`, `maxPrice`).

## 3. Execução

### 3.1 Preflight (somente leitura)
```bash
scp docs/runbooks/preco-diaria-deploy.sh root@<vps>:/root/
ssh root@<vps>
cd /root && bash preco-diaria-deploy.sh preflight
```
O que ele confere (todas as consultas são `SELECT`/`SHOW`):

| # | Verificação | Consulta | Se falhar |
|---|---|---|---|
| a | PostgreSQL >= 13 (a migration usa `trim_scale`) | `SHOW server_version;` / `SHOW server_version_num;` | **Pare.** Não faça o deploy. |
| b | `_prisma_migrations` existe e todas as migrations anteriores constam concluídas | `SELECT count(*) FROM _prisma_migrations;` e uma checagem por migration do diretório | Se faltar alguma (prod nasceu parcialmente de `db push`): avalie com o dono e, só se o esquema já a contém, `prisma migrate resolve --applied <nome>` **antes** do deploy; senão o `migrate deploy` tenta reexecutá-la. Se a tabela não existir: o caminho P3005 do `backend/Dockerfile` marcaria tudo como aplicado sem executar — **não faça o deploy sem avaliar**. |
| c | Preços: total / sem semanal / semanal diferente | `SELECT count(*) total, count(*) FILTER (WHERE "weeklyRate" IS NULL) sem_semanal, count(*) FILTER (WHERE "weeklyRate" IS NOT NULL AND "weeklyRate" <> "dailyRate") semanal_diferente FROM "Vehicle";` | **Se `semanal_diferente > 0` ou `sem_semanal > 0`: PARE e MOSTRE AO DONO.** A conversão assume que o preço visível hoje é `weeklyRate ?? dailyRate`. O script imprime até 20 linhas divergentes (`LIMIT 20`) e marca FALHA; só rode `deploy` com `ACK_OWNER=1` depois de o dono ver e aprovar. |
| d | Alertas com `minPrice`/`maxPrice` | `SELECT count(*) FROM "SearchAlert" WHERE filters ? 'minPrice' OR filters ? 'maxPrice';` | Informativo. |
| e | Alertas com preço **inválido** (não casa `^\s*-?[0-9]+(\.[0-9]+)?\s*$` ou é `null`) | contagem + até 20 linhas | Informe o dono: a migration descarta esses valores; se só um lado era válido, o alerta fica **mais largo** (notifica mais). Não bloqueia. |
| f | Alertas **equivalentes** após a conversão, do mesmo usuário | agrupamento por `userId` + filtros + valores convertidos | Informe o dono: como o `queryHash` não é recalculado, cada um continua gerando notificação própria (duplicata). Não bloqueia. |
| g | Código novo no servidor, compose válido, nenhum outro deploy rodando, disco | — | Corrija antes. |

Mostre a saída completa do preflight ao dono se houver qualquer `[PARE]`, `[FALHA]` ou `[ATENÇÃO]`.

### 3.2 Deploy
```bash
ACK_DUMP=1 nohup bash preco-diaria-deploy.sh deploy > deploy.log 2>&1 &
# se o preflight mandou PARAR por divergência de preço e o dono aprovou: ACK_OWNER=1 ACK_DUMP=1 ...
tail -f deploy.log
```
O `deploy` faz, nesta ordem (qualquer falha aborta **antes** de trocar algo):
1. reexecuta o preflight;
2. `pg_dump` em `/root/backups/triluga-pre-deploy-<TS>.sql.gz`, verificado (`gzip -t`, tamanho > 0, contém `weeklyRate`);
3. snapshot dos preços (`id|weeklyRate|dailyRate`) em `/root/backups/triluga-prices-<TS>.psv` — é com ele que o `smoke` compara "antigo ÷ 7";
4. tags `triluga-backend:pre-<TS>` e `triluga-frontend:pre-<TS>` das imagens atuais (`<TS>` também fica em `/root/.triluga-deploy-ts`);
5. `docker compose build backend frontend`;
6. `docker compose up -d --no-deps backend frontend` (os **dois juntos**; o CMD do backend roda `prisma migrate deploy`, log silencioso = sucesso);
7. healthcheck em `GET /api/v1/vehicles` (até ~2 min).

Se o healthcheck falhar o script **para e instrui**, sem reverter sozinho (veja a seção 1). Leia `docker compose logs --tail 100 backend | grep -iE 'migrat|error'` e decida com a seção 6.

### 3.3 Smoke (somente leitura)
```bash
PUBLIC_API=https://<dominio-da-api>/api/v1 bash preco-diaria-deploy.sh smoke
```
Precisa terminar com `== smoke OK ==`. Ele confere:
- versão do backend rodando = `backend/package.json` (2.28.0);
- `GET /vehicles`, busca nova `?minDailyRate=1&maxDailyRate=100000`, busca **legada** `?minPrice=7&maxPrice=700000` e `?maxPrice=` vazio, todas 200; e a busca pública (se `PUBLIC_API` definido);
- `GET /vehicles/<id>` de um anúncio ativo traz `dailyRate`, `weeklyEstimate`, `monthlyEstimate`, `minRentalDays`, `minPeriodTotal` e `weeklyRate` (compat);
- esquema: `Vehicle` tem `dailyRate` e `minRentalDays` e **não** tem `weeklyRate`; migration concluída; nenhum alerta com `minPrice`/`maxPrice`;
- **5 anúncios**: `dailyRate` novo ≈ (`weeklyRate` antigo, ou `dailyRate` antigo se não havia semanal) ÷ 7, usando o snapshot do passo 3 do deploy;
- sem `ERROR` nos logs dos últimos 10 min.

### 3.4 Anúncio de teste (manual, com a conta de teste do dono)
1. No app, **criar** um anúncio de teste com **diária 100** e tempo mínimo **1 mês**, anotar o `id`.
2. `bash preco-diaria-deploy.sh check-test <id>` — esperado no banco `100.00|30`; na API `dailyRate 100`, `weeklyEstimate 700`, `monthlyEstimate 3000`, `minRentalDays 30`, `minPeriodTotal 3000`.
3. Abrir o detalhe no app e conferir a estimativa **e o aviso** ("Valores estimados a partir da diária...").
4. **Remover** o anúncio de teste (pelo app, ou admin `DELETE /admin/vehicles/:id`) e confirmar: `docker compose exec -T postgres psql -U triluga -d triluga -At -c "SELECT count(*) FROM \"Vehicle\" WHERE id='<id>';"` → `0`.

## 4. Conferência visual (dono ou infra, 5 minutos)
- Home/busca: cards com **R$ X/dia**; anúncios com mínimo mostram "mín. ...".
- Busca: o controle de preço é por dia; abrir uma URL antiga `/search?minPrice=700&maxPrice=1400` converte para `minDailyRate=100&maxDailyRate=200`.
- Lista do dono e edição: campo "diária" e seletor de tempo mínimo.
- Conferir 1 ou 2 anúncios reais conhecidos: o valor antes era "R$ N /semana"; agora é "R$ N/7 /dia" e a estimativa de 7 dias mostra N (pode variar centavos: 699 vira 99,86 vira 699,02 — é esperado).

## 5. Depois
- Avisar o dono com: SHA implantado, `<TS>`, caminhos do dump e do snapshot, resultado do preflight (alertas descartados/duplicados) e do smoke.
- Manter o dump e as tags `pre-<TS>` até a versão que remove a camada de compatibilidade.
- Atualizar a memória/registro de infra (versão em produção: backend 2.28.0, frontend conforme `frontend/package.json`).
- A camada legada (`weeklyRate`, `minPrice`, `maxPrice`) fica por **uma** versão; a remoção depende de o app iOS novo estar publicado e o PWA ter atualizado.

## 6. Rollback
Decida com o dono antes: reverter volta o app ao preço semanal e **perde tudo o que foi criado/alterado depois do dump** (anúncios, mensagens, favoritos, cadastros, pedidos de destaque).

- **Falhou antes da migration rodar** (build falhou, ou o container não chegou a subir; `_prisma_migrations` ainda sem a migration e `weeklyRate` existe): só código, `CONFIRM=1 bash preco-diaria-deploy.sh rollback-code <TS>`.
- **A migration rodou** (o caso normal de qualquer problema depois do deploy): **rollback completo**, `CONFIRM=1 bash preco-diaria-deploy.sh rollback-full <TS>`:
  1. confere que o dump e as imagens `pre-<TS>` existem (senão não faz nada);
  2. para `backend` e `frontend`;
  3. `DROP DATABASE triluga WITH (FORCE)` e `CREATE DATABASE triluga`;
  4. restaura `/root/backups/triluga-pre-deploy-<TS>.sql.gz` com `ON_ERROR_STOP=1`;
  5. volta as tags `pre-<TS>` para `latest` e recria os dois serviços.
  Confira depois: `Vehicle.weeklyRate` existe de novo e a contagem de anúncios bate com o preflight.
- **Reverter só o código com a migration aplicada** deixa o banco sem `weeklyRate` e o backend antigo falha em todas as rotas de anúncio. Não faça.
- Se a restauração falhar no meio: mantenha o backend **parado**, não improvise, e avise o dono com a mensagem de erro.
