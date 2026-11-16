# Exposição do VPS: conferência de 2026-11-16 (Tarefa 0.1)

Conferência somente de leitura, feita por SSH com a chave de serviço, a pedido do dono. Nada foi alterado no servidor. Nenhum valor de segredo foi lido ou registrado.

## O que foi verificado

- **Portas em escuta (`ss -tlnp`):** apenas `22` (sshd), `80` e `443` (nginx do host) escutam em todas as interfaces. Postgres (5435), Redis (6382), MinIO (9004 e 9005), backend (3002) e frontend (4202) do Triluga, e as portas dos outros projetos (3010, 3020, 3030, 3040, 3100, 4210, 4240, 4250), escutam só em `127.0.0.1`. Os bancos e Redis internos dos outros projetos nem publicam porta.
- **Firewall:** `ufw` ativo, política de entrada `deny`, liberando só 22, 80 e 443 (IPv4 e IPv6). `iptables -P INPUT DROP`.
- **Por que as portas estão fechadas, apesar do `docker-compose.yml` do repositório:** o compose do repositório publica essas portas sem `127.0.0.1` (por exemplo `'${POSTGRES_HOST_PORT:-5435}:5432'`). Quem fecha é um arquivo **não versionado** no VPS, `/root/Triluga/docker-compose.override.yml`, que sobrescreve as portas para `127.0.0.1:...` (com `ports: !override`) e liga `restart: unless-stopped`. Ou seja, a proteção existe só naquele servidor: um VPS novo, ou um clone feito para teste, subiria tudo exposto.
- **Versão em produção:** `a4755c2` (v2.9.0, preço por diária). Bate com a tag `v2.9.0` criada hoje. As assinaturas (v2.10.0) ainda não foram para o servidor, como esperado.
- **nginx:** `/etc/nginx/sites-enabled/triluga.conf` é idêntico a `docker/nginx/triluga.conf` do repositório. Não há `set_real_ip_from` (a Cloudflare ainda não está na frente).
- **SSH:** `passwordauthentication no`, `permitrootlogin without-password` (só chave), `maxauthtries 6`. `fail2ban` inativo.
- **Logs de produção do backend (24 h):** 1442 requisições concluídas e 0 respostas `429`.

## O que isso muda no plano

1. A suspeita de banco e Redis expostos **não se confirmou**. A Tarefa 0.3 (firewall) já está atendida no servidor. Continua valendo corrigir o repositório (Tarefa 0.2), porque a proteção hoje depende de um arquivo que só existe no VPS.
2. A suspeita de que o throttler enxerga um IP só (sem `trust proxy`) **não foi confirmada nem descartada**: com 1442 requisições por dia e zero `429`, o tráfego é baixo demais para o limite compartilhado aparecer. Pelo comportamento padrão do Express sem `trust proxy`, `req.ip` é o endereço do proxy (aqui, o gateway do Docker). A Tarefa A.1 inclui um teste automatizado que prova isso, em vez de confiar na suposição. O log da aplicação também não registra o IP do cliente, o que atrapalha a investigação de incidentes.
3. `fail2ban` inativo e a senha de SSH já desligada: instalar `fail2ban` (ou usar a regra de rate limit da Cloudflare não ajuda no SSH) fica como item de endurecimento do host, a decidir pelo dono.

## Limites desta conferência

Foi uma conferência de dentro do servidor. Não foi feito scan de fora (por exemplo `nmap` a partir de outra rede), então a visão externa das portas é inferida do `ss`, do `ufw` e do `iptables`. Não foi verificado o firewall do painel do provedor.
