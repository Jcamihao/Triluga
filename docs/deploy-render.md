# Deploy no Render

## Arquitetura recomendada

- frontend Angular como `Static Site`
- backend NestJS como `Web Service`
- PostgreSQL como `Render Postgres`
- storage de arquivos em bucket S3 compatível
- Redis opcional; o backend já degrada com segurança sem ele

## O que já ficou automatizado

O repositório agora inclui [`render.yaml`](../render.yaml), então você pode subir tudo com `Blueprint` direto no Render.

Esse blueprint já faz:

- cria o Postgres
- sobe o backend com `npm run prisma:deploy && npm run start:prod`
- sobe o frontend e descobre a URL pública do backend pelo `RENDER_EXTERNAL_URL`
- define `JWT_REFRESH_COOKIE_SECURE=true`
- define `JWT_REFRESH_COOKIE_SAME_SITE=none`, que é o valor correto quando frontend e backend ficam em domínios diferentes
- evita cache agressivo de `assets/app-config.js`

## Como subir

1. Faça push do projeto para o GitHub.
2. No Render, clique em `New` > `Blueprint`.
3. Aponte para este repositório e confirme o arquivo `render.yaml`.
4. No fluxo inicial, preencha as variáveis marcadas com `sync: false`.
5. Aguarde a criação de `triluga-db`, `triluga-api` e `triluga-web`.

## Variáveis que você precisa informar

### Backend obrigatório

Preencha no `triluga-api`:

```env
PRIVACY_CONTACT_EMAIL=privacidade@seudominio.com

MINIO_ENDPOINT=SEU_ENDPOINT_S3
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=SEU_ACCESS_KEY
MINIO_SECRET_KEY=SEU_SECRET_KEY
MINIO_PUBLIC_URL=https://SEU_BUCKET_PUBLICO
```

### Backend opcional

Se quiser ativar Redis/cache/fila no Render depois:

```env
REDIS_URL=redis://...
```

Sem `REDIS_URL`, a API sobe em modo degradado para cache/fila, mas continua funcional.

### Frontend opcional

O frontend já descobre automaticamente a URL pública do backend criada pelo Render. Você só precisa definir manualmente estas variáveis se quiser forçar domínio customizado ou sobrescrever a URL automática:

```env
FRONTEND_API_BASE_URL=https://api.seudominio.com/api/v1
FRONTEND_WS_BASE_URL=https://api.seudominio.com
FRONTEND_CLIENT_LOGGING_ENABLED=true
```

## Checklist depois do deploy

- backend respondendo em `https://SEU_BACKEND.onrender.com/api/v1`
- Swagger abrindo em `https://SEU_BACKEND.onrender.com/api/docs`
- frontend abrindo em `https://SEU_FRONTEND.onrender.com`
- login funcionando com refresh token entre frontend e backend
- upload funcionando com o bucket configurado

## Banco e seed

O blueprint já aplica as migrations com:

```bash
npm run prisma:deploy
```

Se quiser popular o banco com seed, rode localmente apontando para a `DATABASE_URL` do Render:

```bash
DATABASE_URL="postgresql://..." npm --prefix backend run prisma:seed
```

## Limitações do plano free

O `render.yaml` usa `free` para facilitar o primeiro deploy.

No plano grátis do Render:

- web services entram em idle após 15 minutos sem tráfego
- o primeiro acesso depois disso pode levar até cerca de 1 minuto
- o Postgres free expira 30 dias após a criação
- o Postgres free não tem backup

Se isso já for produção, troque o `plan` do backend e do banco para um plano pago antes de subir.
