# Triluga Frontend

Aplicação Angular 16 standalone (SCSS, Tailwind, PWA) do classificado Triluga. A versão do pacote está em `package.json`; as notas de cada release do produto ficam em [`docs/releases/`](../docs/releases).

## Escopo atual

- home, busca com filtros por diária, detalhe do veículo com galeria e mapa, comparador
- favoritos, chat em tempo real, perfil e perfil público do anunciante
- painel do anunciante com wizard de anúncio e destaque pago (PIX)
- página `/plano` com planos e assinatura (o link só aparece com `BILLING_ENABLED=true` no backend)
- painel administrativo (visão geral, gestão, auditoria e planos concedidos)
- central de privacidade (LGPD), política de privacidade e termos
- base iOS com Capacitor

A tabela de rotas e guards está no [README da raiz](../README.md#️-páginas-e-rotas).

## Desenvolvimento

```bash
npm install
npm start
```

Por padrão o app usa:

- `FRONTEND_API_BASE_URL=http://localhost:3002/api/v1`
- `FRONTEND_WS_BASE_URL=http://localhost:3002`

## Build e testes

```bash
npm run build
npm test        # Karma (ng test); precisa de um Chrome instalado
```

## iOS

```bash
npm run ios:prepare
npm run cap:open:ios
```
