# Revisão da Tarefa 0.2: portas do compose em loopback

Data: 2026-11-16. Revisor: sonnet. Plano: `docs/superpowers/plans/2026-11-16-seguranca-cloudflare.md`.

## O que mudou

Em `docker-compose.yml`, as seis publicações de porta (postgres, redis, minio API, minio console, backend e frontend) passaram de `'${X_HOST_PORT:-N}:M'` para `'127.0.0.1:${X_HOST_PORT:-N}:M'`. Antes, o repositório sozinho subia tudo em todas as interfaces; a proteção do VPS dependia de um `docker-compose.override.yml` não versionado que só existe no servidor. Agora o repositório é seguro por si só e o override do VPS fica redundante (o dono pode removê-lo depois do deploy).

## O que foi verificado e como

- **Nenhuma porta esquecida.** `grep` por `ports:` e `HOST_PORT` em todo o repositório (sem `node_modules`): só `docker-compose.yml` publica portas por variável; as seis estão no diff. `docker-compose.assessment.yml` já usa `ports: !override` com `127.0.0.1:...` fixo, então não muda. `.env.example` e `.env.production.example` só definem os números das portas, não o endereço. `scripts/*.sh`, `package.json` e `backend/scripts` só chamam `docker compose ...` sem tocar em IP.
- **Nada depende de IP não-loopback.** Entre containers, tudo usa a rede interna do compose: `DATABASE_URL` com `postgres:5432`, `REDIS_URL` com `redis:6379`, `MINIO_ENDPOINT=minio` e `MINIO_PORT=9000`, e o `minio-create-bucket` usa `http://minio:9000`. Os healthchecks (`pg_isready`, `redis-cli ping`) rodam dentro dos containers. Não há `host.docker.internal` no repositório. O `docker/nginx/triluga.conf` já fala com `127.0.0.1:4202` e `127.0.0.1:3002`.
- **`MINIO_PUBLIC_URL`** (`http://localhost:9004/triluga-public`) continua válida em dev: o navegador na própria máquina acessa `localhost:9004`, que cai no bind `127.0.0.1:9004`. No VPS é `https://triluga.com.br/triluga-public`, via nginx (não verificado aqui).
- **`docker compose config`** (Docker Compose v5.1.4, rodado de fato): sem erro, com `host_ip: 127.0.0.1` nas 6 publicações (portas 3002, 4202, 9004, 9005, 5435, 6382). Com `POSTGRES_HOST_PORT=15435` definida só no ambiente do comando, o postgres sai `published: "15435"` e continua em `127.0.0.1`. Com `-f docker-compose.yml -f docker-compose.assessment.yml` (e `ASSESSMENT_DATABASE_URL` definida) também renderiza, tudo em `127.0.0.1` (5436, 6383, 9004, 9005, 3002, 4202); sem essa variável dá o erro esperado "Use backend/scripts/assessment/runtime.cjs". O `.env` local existe e foi lido pelo compose; seus valores não foram abertos.

## Docs corrigidas

- `docs/ios-capacitor.md`: o teste em iPhone real aponta para o IP da máquina na LAN (`http://192.168.0.10:3002`), que deixa de funcionar com o bind em loopback. Acrescentei o procedimento com um `docker-compose.override.yml` local abrindo só o backend, com aviso (rede confiável, não commitar, nunca em servidor, e o `X-Forwarded-For` forjado com `TRUST_PROXY_HOPS=1` quando o backend fica alcançável sem o nginx).
- `docs/HANDOFF.md`: a frase "publica ... em todas as interfaces (inseguro sem o override do VPS)" estava desatualizada; agora diz que foi corrigida na 0.2.

Não alterei: `README.md`, `docs/qa-playbook.md`, `docs/runbooks/*` e `backend/scripts/assessment/README.md` só citam `localhost:PORTA`, que continua funcionando. Os relatórios `exposicao-2026-11-16.md` e `review-a1-trust-proxy.md` descrevem o estado anterior de propósito (histórico).

## O que NÃO pôde ser verificado daqui

- O comportamento no VPS depois do deploy: se o `ports: !override` do override de produção continua coerente com o compose novo, e se o nginx segue alcançando 3002 e 4202. Esperado sim (mesmo endereço), mas não testado; deploy é do dono.
- Subida real dos containers (`docker compose up`) e acesso pelo navegador a `localhost:4202`, `:3002`, `:9004`: só a renderização do compose foi conferida, não o bind em execução. Em WSL2, o encaminhamento de `localhost` do Windows para um bind `127.0.0.1` do Docker costuma funcionar, mas não foi testado.
- `restart: unless-stopped` continua só no override do VPS, por decisão do dono de não mudar o comportamento de dev. O plano original previa incluí-lo no compose; esta tarefa não o fez.
