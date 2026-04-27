# Triluga Backend 2.0.0

API NestJS do classificado Triluga. A versão 2.0 mantém a base modular do backend para servir o redesign completo do frontend.

## Escopo atual

- autenticação com access e refresh token
- perfis, veículos, favoritos e alertas
- anúncios classificados com busca, imagens, favoritos e chat
- avaliações de veículos e avaliações públicas de usuários
- storage público para imagens e arquivos operacionais
- analytics, privacidade e admin

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
```

## Desenvolvimento

```bash
npm run start:dev
```

## Banco e seed

```bash
npm run prisma:migrate
npm run prisma:seed
```

## Build e testes

```bash
npm run build
npm test -- --runInBand
```
