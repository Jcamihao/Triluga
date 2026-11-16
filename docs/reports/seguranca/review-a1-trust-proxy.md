# Revisão da Tarefa A.1 (trust proxy)

Data: 2026-11-16. Revisor: Claude Sonnet 5.5. Item de segurança. Commit revisado: `a1fcfcc` (dev, haiku). Commits do revisor: `b898ac0` (testes e `applyTrustProxy`) e o commit deste relatório.

## Escopo

- `backend/src/common/utils/trust-proxy.util.ts` (`parseTrustProxyHops`, `applyTrustProxy`)
- `backend/src/config/app.config.ts` (`trustProxyHops`)
- `backend/src/main.ts` (chamada no bootstrap)
- `docker-compose.yml`, `.env.example`, `backend/.env.example`, `backend/README.md`
- Outros usos de IP no backend.

Fora do escopo: nginx, Cloudflare, VPS (sem acesso).

## Método

1. Leitura do diff inteiro e de `main.ts`, `app.module.ts`, `chat.gateway.ts`, `@nestjs/throttler` 6.5.0 (`getTracker` devolve `req.ip`) e `express` 4.22.1 / `proxy-addr` 2.0.7.
2. Sonda em Express puro (hops 0, 1 e 2) com 15 formas de `X-Forwarded-For` (vazio, vírgulas, lixo, IPv6, IPv4 mapeado, `[v6]`, `ip:porta`) para ver o que vira `req.ip`.
3. Testes novos e 23 mutantes, rodados em primeiro plano, cada um restaurado com `git checkout` na mesma chamada.

## Achados

### Corrigidos (dentro da A.1)

1. **`main.ts` e `app.config.ts` não tinham teste.** Mutantes que removiam `app.set`, o parse ou trocavam o default sobreviveriam. Extraí `applyTrustProxy(app, configService)` para `trust-proxy.util.ts` (o `main.ts` só a chama) e adicionei:
   - `src/main.spec.ts`: sobe o `bootstrap` com `NestFactory` e `AppModule` falsos e prova que `set('trust proxy', n)` ocorre antes de `setGlobalPrefix`, `use`, CORS, pipes, filtros e `listen`, e que sem config vale 0.
   - `src/config/app.config.spec.ts`: ausente e vazio dão 0; `0/1/3` viram número; `abc`, `6`, `-1`, `true` lançam (boot falha).
2. **Teste de integração não passava pela função real.** Agora `createApp` usa `applyTrustProxy`, então o teste de integração também quebra se a função quebrar.
3. **Asserção frágil no spec do dev:** `toThrow(raw)` falha para entradas com caractere de controle (a mensagem usa `JSON.stringify`). Trocada por `toThrow(JSON.stringify(raw))`.
4. **Entradas inválidas adicionais** no parse: `"0 1"`, `"1\n2"`, `"1,2"`, `"+1"`, `"٣"` (árabe), `"１"` (full-width), `"1​"`, `"0\u0000"`, `"false"`, `"loopback"`. Todas lançam. Veredito do parse: correto. A regex `^[0-5]$` em JS não aceita `\n` final (diferente de Python). `"1\n"` e NBSP nas pontas são aceitos por causa do `trim()`, o que é inofensivo.

### Sem bug, mas relevantes para as próximas fases

A. **`trust proxy = 1` só é seguro se ninguém alcança a API sem passar pelo nginx.** Com hops=1, o Express usa a entrada mais à direita do `X-Forwarded-For` como `req.ip`, sem validar formato. Atrás do nginx com `$proxy_add_x_forwarded_for`, a entrada mais à direita é sempre o `$remote_addr` do nginx e o cliente só controla o que fica à esquerda (provado nos testes). Mas, medido na sonda: se alguém bate direto na porta da API, `X-Forwarded-For: qualquer-coisa` vira `req.ip` e **zera o limite por IP** (cada request com um valor diferente cai num balde novo). O `docker-compose.yml` publica `${BACKEND_HOST_PORT:-3002}:3000` em todas as interfaces. Na VPS o plano diz que a porta está fechada por override não versionado (não verifiquei). Recomendação: publicar como `127.0.0.1:${BACKEND_HOST_PORT:-3002}:3000` no compose versionado ou manter firewall.

B. **Atrás da Cloudflare, hops=1 está errado, precisa de 2.** Cloudflare envia `X-Forwarded-For: <cliente>` e o nginx anexa o IP da borda: `cliente, borda`. Com hops=1, `req.ip` é o IP da borda da Cloudflare e muitos visitantes dividem o mesmo balde (teste "hops=2 (Cloudflare + nginx)" mostra o terceiro request de visitantes diferentes tomando 429 com hops=1). Com hops=2 a chave é o cliente real. Alternativa: `real_ip_header CF-Connecting-IP` no nginx com os ranges da Cloudflare, mantendo hops=1. O valor muda na fase da Cloudflare; hoje (sem Cloudflare) 1 está certo. Enquanto a Cloudflare não estiver na frente, `TRUST_PROXY_HOPS=2` seria errado (usaria a entrada forjável).

C. **Cabeçalho ausente, vazio ou só vírgula com hops=1** cai no IP do socket (nginx ou gateway do Docker): um balde só para esses requests. Atrás do nginx isso não ocorre (ele sempre anexa). Não é bypass nem tranca ninguém: o teste prova que esgotar esse balde não afeta clientes com IP real anexado.

D. **Mesmo cliente, duas grafias:** `203.0.113.9` e `::ffff:203.0.113.9` são chaves diferentes no throttler (string crua). Se o nginx escuta em dual-stack, a grafia é decidida pelo nginx e fica estável; o cliente não escolhe. Efeito máximo: se a grafia mudar, o cliente ganha um segundo balde. Não corrigido (fora do A.1).

E. **Garantias de boot.** `parseTrustProxyHops` roda na leitura da config, durante a criação do app, então valor inválido derruba o boot antes de aceitar tráfego (coberto pelo teste do `app.config`).

F. **`ConfigModule` lê `../.env.example` como último fallback** (`app.module.ts`, `envFilePath`). Em dev sem `.env`, `backend/.env.example` define `TRUST_PROXY_HOPS=0` (certo para dev direto). A imagem de produção só copia `dist`, `node_modules` e `prisma`, então não há `.env.example` no container: vale a env do compose (`:-1`). Presumido pelo Dockerfile, não rodei o container.

### Outros usos de IP no backend (grep)

Busca por `req.ip`, `.ips`, `x-forwarded-for`, `remoteAddress`, `x-real-ip`, `handshake.address`, `cf-connecting` e `clientIp` em `backend/src` (fora de spec): **nenhum uso**, exceto o `ThrottlerGuard` do pacote (`req.ip`). Auditoria, analytics e auth não gravam nem leem IP. `req.protocol`, `req.secure` e `req.hostname` também não são usados (o flag `secure` dos cookies vem de config/NODE_ENV), então `trust proxy` não muda cookie nem CORS.

- **Gateway Socket.io (chat):** usa o servidor HTTP do Nest, mas o Socket.io não consulta a setting `trust proxy` do Express e o gateway não lê IP (só JWT em `handshake`). Logo não há ganho nem risco com o trust proxy; também não há limite por IP nas conexões WebSocket. Não verifiquei se o `APP_GUARD` `ThrottlerGuard` roda em contexto WS (comportamento prévio, fora do A.1).
- **Cookie `Secure` atrás de proxy:** não depende de `req.secure`, sem impacto.

## Mutantes (23)

Comando por mutante: `npx jest src/common/utils src/config/app.config.spec.ts src/main.spec.ts --runInBand`. Resultado: **23 mortos, 0 sobreviventes.** Arquivos restaurados com `git checkout` após cada um; `git diff --stat -- backend/src` vazio ao final.

| id | arquivo | mutação | resultado | teste que mata |
|---|---|---|---|---|
| M01 | trust-proxy.util.ts (regex) | remove `^` | MORTO | inválidos `-1`, `+1`; app.config `-1` |
| M02 | trust-proxy.util.ts (regex) | remove `$` | MORTO | inválidos `0 1`, `05`, `07`, `10` |
| M03 | trust-proxy.util.ts (regex) | `[0-5]` -> `[0-9]` | MORTO | inválido `6`; app.config `6` |
| M04 | trust-proxy.util.ts (parse) | remove `trim()` | MORTO | aceita `" 2 "`, `"\t3\n"`; vazio `"   "` |
| M05 | trust-proxy.util.ts (parse) | `undefined` => 1 | MORTO | "devolve 0 quando não existe"; app.config sem variável |
| M06 | trust-proxy.util.ts (parse) | vazio => 1 | MORTO | vazio `""`, `"   "`; app.config vazia |
| M07 | trust-proxy.util.ts (parse) | remove o throw (`if (false)`) | MORTO | 27 testes (todos os inválidos) |
| M08 | trust-proxy.util.ts (parse) | `Number(value)` -> `true` | MORTO | "nunca devolve true nem string"; valores válidos |
| M09 | trust-proxy.util.ts (parse) | `Number(value)` -> string | MORTO | idem |
| M10 | trust-proxy.util.ts (regex) | limite superior 5 -> 4 | MORTO | aceita `"5"` |
| M11 | trust-proxy.util.ts (apply) | default do `get` 0 -> 1 | MORTO | applyTrustProxy "sem config"; main.spec "sem trustProxyHops" |
| M12 | trust-proxy.util.ts (apply) | remove `app.set` | MORTO | applyTrustProxy + integração |
| M13 | trust-proxy.util.ts (apply) | `set(..., true)` | MORTO | applyTrustProxy + integração (prefixo forjado troca o balde) |
| M14 | trust-proxy.util.ts (apply) | setting `'trust proxies'` | MORTO | applyTrustProxy + integração |
| M15 | trust-proxy.util.ts (apply) | retorna 0 em vez de `hops` | MORTO | applyTrustProxy "aplica ... e o devolve" |
| M16 | trust-proxy.util.ts (apply) | chave `app.trustProxy` | MORTO | applyTrustProxy; main.spec ordem |
| M17 | app.config.ts | parse removido (0 fixo) | MORTO | app.config `1`, `3`, inválidos |
| M18 | app.config.ts | `parse(undefined)` | MORTO | app.config |
| M19 | app.config.ts | env `TRUST_PROXY` | MORTO | app.config |
| M20 | app.config.ts | `Number()` cru, sem validar | MORTO | app.config `abc`, `6`, `-1`, `true` |
| M21 | main.ts | não chama `applyTrustProxy` | MORTO | main.spec (ordem e valor) |
| M22 | main.ts | chamada movida para depois dos middlewares, antes do `listen` | MORTO | main.spec "antes de qualquer middleware" |
| M23 | main.ts | hardcoded 1 em vez da config | MORTO | main.spec "sem trustProxyHops aplica 0" |

Os primeiros mutantes de `main.ts` e `app.config.ts` só morrem por causa dos specs novos: antes deste commit nenhum teste cobria essas linhas (M17 a M23 sobreviveriam).

## Teste de integração: o que prova

`trust-proxy.integration.spec.ts` (ThrottlerModule limite 2/min, supertest, módulo mínimo, `applyTrustProxy` real):

- hops=1: IPs reais têm baldes próprios; prefixo forjado (`198.51.100.7, 203.0.113.9` e `1.1.1.1, 203.0.113.9`) não troca o balde.
- hops=0: tudo no mesmo balde (comportamento antigo).
- IPv6 (`2001:db8::1`, `::ffff:203.0.113.9`): balde próprio, prefixo forjado não escapa.
- Lixo e vírgulas à esquerda do IP anexado: mesmo balde.
- Cabeçalho ausente, `""`, `"   "`, `","`, `", ,"`: balde do socket; não tranca IPs reais.
- hops=0: cabeçalho forjado (IPv6 e lixo) ignorado.
- hops=2 (Cloudflare + nginx): chave é o cliente real; hops=1 na mesma topologia junta visitantes na borda.

## Números finais

- `npx jest --runInBand`: 29 suites, 685 testes, verde (linha de base do dev: 27 / 656).
- `tsc --noEmit`, `npm run lint:ci`, `npm run build`: verdes.

## Limites (só o ambiente real mostra)

- Como o docker-proxy entrega o IP: não relevante para o XFF (header HTTP passa intacto), mas o IP do socket visto pelo container é o gateway da bridge. Não testado no VPS.
- Se o nginx de produção realmente usa `$proxy_add_x_forwarded_for` (informado pelo agente principal, não li o arquivo) e se há outro proxy na frente.
- Se a porta 3002 da API é alcançável de fora (achado A).
- Comportamento exato do `X-Forwarded-For` com a Cloudflare e do `$proxy_add_x_forwarded_for` quando a Cloudflare já mandou uma cadeia (achado B): descrito aqui pela documentação conhecida, não medido.
- Produção hoje não define `TRUST_PROXY_HOPS`; o padrão `:-1` do compose só vale quando o compose versionado for aplicado.
