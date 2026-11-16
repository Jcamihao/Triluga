# Plano: segurança contra ataques e DDoS, com Cloudflare

Data: 2026-11-16. Pedido do dono: proteger o app contra ataques de hacker e DDoS, usando a Cloudflare (plano gratuito) na frente do VPS. Este plano é a fonte única da ordem de trabalho desta frente. Nada aqui foi executado ainda; o dono aprova com "segue" antes de cada tarefa.

## Objetivo e princípio

Reduzir o que um atacante consegue fazer sem custo para ele. Duas camadas: (1) o código e o nginx deixam de depender de sorte (IP real, limites, portas fechadas); (2) a Cloudflare absorve o tráfego volumétrico antes que ele chegue ao VPS. O princípio que pesa nas decisões: **a Cloudflare só protege se o atacante não conseguir falar direto com o VPS**, então fechar o acesso direto é tão importante quanto ligar o proxy.

## Estado atual (levantamento feito em 2026-11-16)

Verificado lendo o código e os arquivos de configuração. Nada foi testado em produção.

Já existe:
- `helmet()` e CORS restrito a `FRONTEND_URL` (`backend/src/main.ts`), inclusive no gateway do chat (`chat.gateway.ts`).
- `ValidationPipe` com `whitelist` e `forbidNonWhitelisted`; `CsrfGuard`, `RolesGuard` e `ThrottlerGuard` globais (`app.module.ts`).
- Throttler global de 20 req/min por cliente; login, registro, forgot, reset e resend-verification em 5 req/min; billing em 5 e 10 por hora.
- Os dois webhooks do Asaas já têm `@SkipThrottle()` (o token é a autenticação), então o throttler não bloqueia pagamento legítimo.
- Upload limitado a 10 MB por arquivo e 8 arquivos; imagem reprocessada para webp no `storage.service.ts`.
- nginx com TLS 1.2 e 1.3, redirecionamento de HTTP para HTTPS, `client_max_body_size 20m` e timeout longo só no WebSocket.

Lacunas:
1. **Portas expostas no host (REFUTADA no VPS atual, ainda vale no repositório).** `docker-compose.yml` publica postgres (5435), redis (6382), minio, backend (3002) e frontend (4202) sem prefixo `127.0.0.1`. O Docker publica essas portas em todas as interfaces e passa por cima do `ufw`. Se o firewall do provedor não bloquear, banco e Redis estão acessíveis da internet e o atacante ignora o nginx e a Cloudflare. **Conferido em 2026-11-16: no VPS as portas estão fechadas por um override não versionado; o repositório continua inseguro por si só.**
2. **Sem `trust proxy` no Nest.** Atrás do nginx, `req.ip` é o IP do proxy (loopback ou gateway do Docker), então o throttler enxerga todos os visitantes como um só. Consequência provável: o limite de 20 req/min e o de 5 req/min do login são compartilhados por todo mundo (um atacante trava o login de todos, e o limite não protege contra ninguém). **Presumido; conferir contando `status=429` nos logs de produção.**
3. **nginx sem `limit_req`, `limit_conn`, timeouts de cabeçalho e corpo, `server_tokens off` e HSTS.** Aberto a slowloris e a flood de conexões.
4. **Swagger público** em `/api/docs`, inclusive em produção.
5. **`x-request-id` do cliente é aceito sem validação** (`main.ts`) e vai direto para o log: permite forjar linhas de log.
6. **Throttle é por IP e só por rota sensível**; endpoints caros e públicos (busca, FIPE, CEP, geocoding, denúncias, mensagens do chat, analytics) usam só o limite global. O chat por WebSocket não passa pelo throttler.
7. **Sem CDN, WAF nem proteção volumétrica.**
8. Não revisado ainda: trava de login por conta (hoje só por IP), enumeração de contas em register e forgot-password, política de senha, força dos segredos JWT, flags do cookie de refresh, SSH do VPS, `npm audit`.

## Decisões do dono (perguntar, não decidir)

1. Posso acessar o VPS por SSH para conferir portas e aplicar o firewall? O deploy continua só com pedido explícito.
2. Os limites propostos (abaixo) servem? Eles mudam a experiência de quem usa o app atrás do mesmo IP (empresa, escola, rede móvel).
3. Cloudflare: conta e acesso ao DNS são do dono. As tarefas da Fase C são ações dele.
4. HSTS: começar com `max-age` curto (1 dia) e subir depois de uma semana sem problema. Sem `preload` por enquanto.

## Fases e tarefas

Ordem obrigatória: **0 → A → B → C → D**. Ligar o proxy da Cloudflare antes de A e B faria todo visitante chegar com IP da Cloudflare. Cada tarefa fecha com docs, tag quando houver mudança de produto, commit e push (regra do `~/.claude/CLAUDE.md`). Sem deploy sem pedido. A mudança de segurança como um todo vira a release **v2.11.0**.

Modelos: dev haiku, revisão e correção sonnet (obrigatória: é segurança), conferência minha por amostra. Um subagente por vez.

### Fase 0: fechar a exposição direta (urgente, barata)

**Tarefa 0.1: conferir o que está aberto. FEITA em 2026-11-16** (relatório em `docs/reports/seguranca/exposicao-2026-11-16.md`). Resultado: no VPS só 22, 80 e 443 escutam em todas as interfaces; as demais portas estão em `127.0.0.1` por causa de um `docker-compose.override.yml` **não versionado** que só existe no servidor, e o `ufw` está em deny. A suspeita de banco exposto não se confirmou.

**Tarefa 0.2: tirar a dependência do arquivo que só existe no VPS. FEITA em 2026-11-16** (commit `37657ba`; revisão sonnet em `docs/reports/seguranca/review-0-2-compose-loopback.md`). As seis portas de `docker-compose.yml` (postgres, redis, minio API e console, backend, frontend) agora publicam em `127.0.0.1`; `docker compose config` mostra `host_ip: 127.0.0.1` em todas, inclusive com variável de porta trocada e com o overlay de assessment. **Decisão:** `restart: unless-stopped` não entrou no compose do repositório (faria containers subirem sozinhos em máquina de dev); continua só no override do VPS. O teste real com iPhone na LAN exige um override local descrito em `docs/ios-capacitor.md`. **Não verificado:** `docker compose up` real com acesso pelo navegador (incluindo o encaminhamento de localhost do WSL2) e o comportamento no VPS depois do deploy, que é do dono; o override do VPS fica redundante e pode ser removido depois.

**Tarefa 0.3: firewall do host. JÁ ATENDIDA** (`ufw` com deny de entrada e só 22, 80 e 443). Na Fase C, 80 e 443 passam a aceitar só IPs da Cloudflare. Item novo, a decidir pelo dono: instalar `fail2ban` para o SSH (hoje inativo; a senha já está desligada, só chave).

### Fase A: backend (haiku + sonnet)

**Tarefa A.1: `trust proxy`. FEITA em 2026-11-16** (dev `a1fcfcc`; revisão sonnet `b898ac0` e `2c0ff5b`, 23 mutantes, 23 mortos; relatório em `docs/reports/seguranca/review-a1-trust-proxy.md`; jest completo 29 suítes / 685 testes, tsc e lint:ci limpos, conferido pelo agente principal). `TRUST_PROXY_HOPS` (inteiro de 0 a 5; valor inválido derruba o boot; padrão 0 no código, 1 no `docker-compose.yml`) alimenta `app.set('trust proxy', n)` por `applyTrustProxy` em `backend/src/common/utils/trust-proxy.util.ts`. Achados da revisão que viram requisito de outras tarefas: (1) com 1 salto, se o backend for alcançável sem o nginx, um `X-Forwarded-For` forjado zera o limite por IP: **a Tarefa 0.2 passa a ser pré-requisito de qualquer deploy com 1 salto**; (2) atrás da Cloudflare, 1 salto chaveia no IP da borda e muitos visitantes dividem um balde: **a Tarefa B.1 (`real_ip_header CF-Connecting-IP` no nginx) é obrigatória antes de ligar o proxy da Cloudflare**, e o salto continua 1 porque o nginx devolve o IP real em `$remote_addr`; (3) cabeçalho ausente ou vazio cai no IP do socket (um balde só); (4) `1.2.3.4` e `::ffff:1.2.3.4` são baldes diferentes (a grafia vem do nginx); (5) nenhum outro código em `backend/src` lê IP além do `ThrottlerGuard`; (6) não verificado: se o `ThrottlerGuard` global roda em contexto WebSocket (entra na Tarefa A.4).

**Tarefa A.2: Swagger só quando ligado. FEITA em 2026-11-16** (dev `6b3c346`). `SWAGGER_ENABLED` (padrão **desligado**, só `true` liga; o container de produção não define `NODE_ENV`, então o critério não é o ambiente). Desligado, `/api/docs`, `/api/docs-json`, `/api/docs-yaml` e variações dão 404. `docker-compose.yml` passa `false`; os `.env.example` de desenvolvimento trazem `true` (**copiar esses arquivos para produção liga o Swagger**; o `.env.production.example` traz `false`).

**Tarefa A.3: `x-request-id` validado. FEITA em 2026-11-16** (dev `0d3d3a0`). Só `^[A-Za-z0-9._-]{8,64}$` é aceito; o resto vira UUID. O middleware de request foi extraído para `backend/src/common/middleware/request-context.middleware.ts`.

**Revisão sonnet de A.2 e A.3** (`3f00ad3`, `7275f90`, `eefa349`, `11d6e65`, `cdffeb8`; relatório em `docs/reports/seguranca/review-a2-a3-swagger-requestid.md`): 63 mutantes, 61 mortos e 2 equivalentes; jest completo 35 suítes / 781 testes, tsc e lint:ci limpos, conferido pelo agente principal. **Bug real achado e corrigido:** o `@IsEmail` aceita e-mail com quebra de linha dentro de aspas (`"a\nrequest_completed status=200"@x.com`) e o `auth.service` logava o e-mail cru, então um anônimo forjava linhas de log com um POST de login. Novo `sanitizeForLog` (`backend/src/common/utils/log-safe.util.ts`) aplicado em `auth.service`, `email.service`, `storage.service` e `chat.gateway`. Pendências geradas: **A.6** (nova): o cadastro ainda aceita e grava e-mail com quebra de linha, restringir o validador de e-mail; `featured.service` tem um `safeLog` local duplicado; avaliar um `ConsoleLogger` próprio que escape controles em toda mensagem (não auditei os 110 pontos de log).

**Tarefa A.4: limites por tipo de endpoint.** Números **aprovados pelo dono em 2026-11-16**: geral 120 req/min por cliente (hoje 20); `GET /lookups/*` 30/min (chamam serviços externos: CEP, geocoding, FIPE); `POST /reports` 5/hora; mensagem de chat 30/min (tanto `POST /chats/:id/messages` quanto o evento `chat:send` do WebSocket); login, registro, forgot, reset e resend como hoje (5/min); billing como hoje (5 e 10 por hora); webhooks do Asaas seguem com `@SkipThrottle()`. Proposta minha, **a confirmar com o dono**: `POST /analytics/*` 60/min (rotas públicas de rastreio, vetor de spam). Rastreador que usa o `userId` quando o token é válido e o IP quando não é (atrás de NAT, usuários logados deixam de dividir o balde; as rotas públicas continuam por IP). Chat por WebSocket: o `ThrottlerGuard` global provavelmente não cobre os handlers do gateway (achado 6 da A.1, não verificado); investigar e, se não cobrir, limitar por usuário no gateway com resposta de erro no próprio evento. Teste de cada limite e do rastreador; a revisão sonnet confere se o balde por usuário não abre brecha (um atacante com muitas contas não pode contornar os limites por IP das rotas de autenticação).

**Tarefa A.5: revisão de autenticação (primeiro investigar, depois decidir).** Relatório curto sobre trava de login por conta, enumeração em register e forgot-password, política de senha, entropia exigida dos segredos JWT na subida do app e flags do cookie de refresh. Correções só depois de o dono ver o relatório.

Revisão sonnet de A.1 a A.4: mutantes nas condições dos limites e do `trust proxy`, relatório em `docs/reports/seguranca/`.

### Fase B: nginx (haiku + sonnet)

Arquivo: `docker/nginx/triluga.conf`. Teste: `nginx -t` num container descartável e `curl` contra um nginx local de teste.

**Tarefa B.1: IP real e cabeçalhos.** `set_real_ip_from` com as faixas da Cloudflare (lista oficial de `https://www.cloudflare.com/ips-v4` e `ips-v6`, versionada num `include`) e `real_ip_header CF-Connecting-IP`. Nos `location` do proxy: `X-Forwarded-For $remote_addr` (substitui, não acrescenta) e `X-Real-IP $remote_addr`. Isso é seguro antes de ligar a Cloudflare: sem ela, `$remote_addr` já é o visitante.

**Tarefa B.2: limites de requisição e conexão.** `limit_req_zone` por `$binary_remote_addr`: zona `api` (10 r/s, burst 30), zona `auth` (1 r/s, burst 5) para `/api/v1/auth/`, `limit_conn` por IP. Resposta 429. **Os dois webhooks do Asaas ficam fora dos limites** (`/api/v1/billing/webhooks/asaas` e `/api/v1/featured/webhook/asaas`).

**Tarefa B.3: timeouts e endurecimento.** `client_header_timeout`, `client_body_timeout`, `send_timeout`, `keepalive_timeout` curtos; `server_tokens off`; `client_max_body_size` por `location` (20m só no upload de imagem, 1m no resto); HSTS com `max-age` curto; mantém o timeout longo só no `/socket.io/`.

### Fase C: Cloudflare (ações do dono; eu escrevo o roteiro em `docs/runbooks/cloudflare.md`)

1. Adicionar `triluga.com.br` na Cloudflare e trocar os nameservers no registrador.
2. Conferir os registros DNS (`@`, `www`, `api`) e ligar o proxy (nuvem laranja) neles.
3. SSL/TLS em **Full (strict)**; "Always Use HTTPS" ligado.
4. Regras: cache **bypass** para `/api/*`; regra de exceção da WAF e do Bot Fight para os dois caminhos de webhook do Asaas; regra de rate limit para `/api/v1/auth/*`; Bot Fight Mode e regras gerenciadas da WAF ligados.
5. **Trancar a origem:** `ufw` aceitando 80 e 443 só das faixas da Cloudflare (script que busca as faixas oficiais e roda por cron semanal). Opcional e melhor: Authenticated Origin Pulls (mTLS).
6. Conferir a renovação do certificado: `certbot renew --dry-run` (a validação HTTP-01 passa pela Cloudflare).
7. Botão de emergência documentado: "Under Attack Mode".

### Fase D: verificação

Reaproveitar os scripts de `backend/scripts/assessment/`. Checklist com evidência (saída colada em `docs/reports/seguranca/verificacao.md`): IP real chega ao throttler (dois IPs diferentes, dois contadores); login limita por visitante; `429` aparece no nginx antes de chegar ao Nest em rajada; scan de fora não vê as portas 3002, 4202, 5435, 6382; acesso direto ao IP do VPS nas portas 80 e 443 é recusado depois da Fase C; chat por WebSocket funciona atrás da Cloudflare; os dois webhooks do Asaas passam; `certbot renew --dry-run` passa; `/api/docs` retorna 404.

## Riscos e limites

- A Cloudflare gratuita absorve ataque volumétrico, mas não garante nada contra um ataque dirigido de camada 7 bem feito; as regras de rate limit e o modo "Under Attack" são a resposta.
- Se o IP do VPS já vazou (histórico de DNS), trocar o IP do servidor depois de trancar a origem.
- Limites baixos demais derrubam usuários legítimos atrás de NAT; começar folgado e apertar com dado do log.
- Qualquer mudança em nginx ou compose só vale depois do deploy, que é do dono. Até lá, o servidor continua como está.
- O que só o ambiente real mostra: portas realmente abertas, 429 em produção, comportamento do WebSocket e do certbot atrás da Cloudflare.

## Onde ficam os resultados

Relatórios em `docs/reports/seguranca/`, roteiro da Cloudflare em `docs/runbooks/cloudflare.md`, estado atual em `docs/HANDOFF.md`.
