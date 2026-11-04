# Avaliação local do Triluga

Alvo: **Triluga**, marketplace de veículos; não TrilugaDrive.

Os scripts criam uma cópia do banco original e registros sintéticos. O overlay
publica API, interface e infraestrutura somente em loopback. E-mail e cobrança
ficam desativados. Os controles de autenticação, cache e rate limit do app são
mantidos. Os resultados locais não comprovam a configuração de produção.

Pré-requisitos: Docker Compose com suporte a `!override`, dependências locais do
backend e frontend instaladas, imagens `triluga-backend` e `triluga-frontend`
compiladas, Postgres do compose disponível em `127.0.0.1:5436` e Redis em `6383`.

Primeira execução, na raiz do projeto:

```bash
POSTGRES_HOST_PORT=5436 REDIS_HOST_PORT=6383 docker compose up -d postgres redis minio minio-create-bucket
docker compose build backend frontend
node backend/scripts/assessment/runtime.cjs clone
node backend/scripts/assessment/fixtures.cjs
node backend/scripts/assessment/runtime.cjs up
node backend/scripts/assessment/pentest.cjs
node backend/scripts/assessment/load.cjs --baseline
node backend/scripts/assessment/load.cjs
node backend/scripts/assessment/fixtures.cjs cleanup
```

O launcher recusa criar outra sessão quando já existe um estado local. Não apague
esse estado enquanto for necessário limpar os registros ou reiniciar o ambiente.
Para reiniciar o ambiente já preparado, use somente `runtime.cjs up`.

Os resultados ficam em `backend/reports/assessment/` (ignorado pelo Git).
`session.private.json` contém a senha temporária e seletores da cópia do banco;
não deve ser publicado. Os relatórios públicos não contêm tokens nem hashes.

A carga usa 100 contêineres clientes com IPs distintos, autenticação real, conexão
WebSocket e ciclos de navegação com pausa de 5 segundos. Faz busca, lê anúncio,
perfil, favoritos, conversas, notificações e contagens, além de adicionar e remover
um favorito. A rampa dura 20 segundos; o patamar planejado é de 90 segundos com
100 sessões, seguido de saída gradual por 10 segundos. A duração efetiva e os
erros são medidos. O HTML é baixado sem renderização do Angular: não mede a
experiência de 100 navegadores nem processamento de upload/cobrança sob carga.

O pentest altera apenas fixtures: verifica isolamento entre contas, detalhes de
anúncios não publicados, avaliações públicas, sessões/refresh, administração,
permissões de chat, limites de mensagem e upload de avatar. Os dois uploads de
imagem e o arquivo de conteúdo inválido são removidos pelo próprio script.
Execute `fixtures.cjs cleanup` mesmo quando uma avaliação apresentar falhas.
Isso remove os usuários sintéticos, seus registros dependentes e entradas de
cache que contenham seus identificadores. A cópia do banco é preservada para
inspeção; o banco original não é migrado ou reescrito.

Os clientes e serviços compartilham o host. Métricas de CPU/memória são amostras,
não isolamento de benchmark. O baseline de uma sessão dura apenas 10 segundos.
