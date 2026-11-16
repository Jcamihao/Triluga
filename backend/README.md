# Triluga Backend

API NestJS 10 (monólito modular, Prisma 5 e PostgreSQL 16) do classificado de veículos Triluga. A versão do pacote está em `package.json`; as notas de cada release do produto ficam em [`docs/releases/`](../docs/releases).

## Escopo atual

- autenticação com access token e refresh token em cookie httpOnly, verificação de e-mail e recuperação de senha
- perfis, veículos (preço por diária), imagens, favoritos, comparação e alertas de busca
- chat em tempo real (Socket.io), notificações e e-mails por fila (BullMQ sobre Redis)
- avaliações de anúncios e de anunciantes, denúncias de anúncios
- destaque pago de anúncios via Asaas (PIX, ativação automática pelo webhook)
- assinaturas (planos Profissional e Frota, cartão recorrente via Asaas) e limite de anúncios por plano, atrás da flag `BILLING_ENABLED`
- LGPD (exportação e solicitações), analytics, auditoria das ações do admin, sitemap
- storage de imagens em MinIO (compatível com S3), consultas de CEP, geocoding e FIPE

O mapa dos módulos está no [README da raiz](../README.md#-estrutura) e a lista completa de rotas no Swagger (`/api/docs`).

## Setup

```bash
npm install
cp .env.example .env     # preencha os segredos; nunca commite o .env
npm run prisma:generate
```

A infraestrutura local (PostgreSQL, Redis, MinIO) sobe pela raiz do repositório com `npm run dev:infra`.

## Desenvolvimento

```bash
npm run start:dev            # watch mode
npm run start:dev:prepared   # gera o client Prisma, aplica as migrations e sobe em watch mode
```

## Banco e seed

```bash
npm run prisma:migrate   # migration nova em desenvolvimento
npm run prisma:deploy    # aplica as migrations existentes (é o que roda em produção)
npm run prisma:seed
```

Atenção: o histórico de migrations tem uma divergência conhecida com o `schema.prisma` (`Report`, `AuditLog`, `FeaturedOrder`); detalhes e o contorno para banco novo estão em [`docs/HANDOFF.md`](../docs/HANDOFF.md).

## Build, lint e testes

```bash
npm run build
npm run lint:ci
npm test -- --runInBand   # em máquina com pouca memória, sem --runInBand o processo pode ser morto
npm run verify            # gera o client, confere o status das migrations, compila e roda os testes
```

## Variáveis de ambiente

Os nomes estão em `.env.example`. Os grupos principais: banco (`DATABASE_URL`), JWT, Redis, MinIO, `ASAAS_*` (chave, URL base, token do webhook e timeout) e `BILLING_*` (flag e preços). Valores de segredo nunca vão para o repositório.
