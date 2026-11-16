# Playbook de QA do Triluga

## Objetivo

Este documento ajuda um QA a entender rapidamente o produto Triluga, preparar o ambiente local, navegar pelos perfis da aplicacao e executar testes com contexto de negocio.

O foco aqui e:

- entender o que o app faz hoje
- saber o que existe no frontend e no backend
- reconhecer limites conhecidos para evitar falso positivo
- executar smoke tests e regressao com criterio

## O que e o Triluga

Triluga e um classificado P2P de veiculos. O fluxo principal conecta interessados a anunciantes, com busca, detalhe do anuncio, favoritos, chat e paines de gestao.

O projeto esta dividido assim:

- `frontend`: Angular standalone, PWA, mobile first
- `backend`: NestJS modular
- `database`: PostgreSQL com Prisma
- `infra local`: Docker Compose com Postgres, Redis e MinIO

## Perfis de usuario

Existem 3 papeis principais:

- `USER`: navega, favorita, anuncia e conversa com outros usuarios
- `OWNER`: papel de negocio usado para quem publica anuncios
- `ADMIN`: modera usuarios, veiculos e pedidos de privacidade

## Estado atual do produto

Hoje, o Triluga cobre estes fluxos:

- autenticacao e sessao
- busca de veiculos com filtros
- detalhe do anuncio
- favoritos
- chat entre interessado e anunciante
- painel do proprietario
- painel admin
- politica/central de privacidade e controles LGPD

Limites importantes para QA:

- nao existe fluxo transacional operacional.
- o produto atual e um classificado: a negociacao acontece pelo chat.
- a criacao de review tem fluxo completo no frontend: avaliar o veiculo (estrelas + comentario) na pagina de detalhe (`vehicle-detail-desktop`/`-mobile`) e avaliar o anunciante no perfil publico dele (`user-profile-page`).
- a verificacao de identidade (KYC: selfie, documento e CNH) foi removida do produto; nao existe mais upload/aprovacao desses arquivos nem badge de "membro verificado".

## Dados seed

O seed cria:

- 1 admin
- 1 usuária anunciante
- 1 usuário interessado
- 3 veiculos
- 1 review
- notificacoes e visitas do site

Credenciais padrao:

- `admin@triluga.local` / `Admin123!`
- `mariana@triluga.local` / `User123!`
- `lucas@triluga.local` / `User123!`

## Setup local recomendado

### Opcao A: infra em Docker + apps locais

```bash
cd /Users/caminhao/Documents/codeStage/Triluga
cp backend/.env.example backend/.env
npm run dev:infra
npm --prefix backend run prisma:deploy
npm --prefix backend run prisma:generate
npm --prefix backend run start:dev
npm --prefix frontend start
```

### Variaveis que o QA deve adicionar manualmente

Os exemplos de `.env` ainda nao trazem todas as chaves do pacote de privacidade. Adicione estas entradas em `backend/.env` e, se usar `docker compose up`, tambem no `.env` da raiz:

```env
JWT_REFRESH_COOKIE_NAME=triluga_refresh_token
JWT_REFRESH_COOKIE_SECURE=false
JWT_REFRESH_COOKIE_SAME_SITE=lax
PRIVACY_CONTACT_EMAIL=privacidade@triluga.local
PRIVACY_POLICY_VERSION=2026-03-27
```

### URLs uteis

- frontend: `http://localhost:4202`
- backend API: `http://localhost:3002/api/v1`
- swagger: `http://localhost:3002/api/docs` (só existe com `SWAGGER_ENABLED=true`; produção deve manter desligado)
- MinIO console: `http://localhost:9005`

### Ferramentas de apoio para QA

- Swagger para validar endpoints e payloads
- DevTools do navegador para cookies, `localStorage`, `sessionStorage` e network
- MinIO Console para inspecionar uploads
- Prisma Studio para olhar banco:

```bash
cd /Users/caminhao/Documents/codeStage/Triluga/backend
npx prisma studio
```

## Mapa funcional da aplicacao

### Visitante logado ou anonimo

- home com atalhos por marca
- busca com filtros, mapa e alertas
- detalhe do veiculo
- politica publica de privacidade

### Interessado

- cadastro/login
- alertas de busca
- favoritos
- chat
- perfil
- central de privacidade

### Proprietario

- cadastro/login
- dashboard com indicadores
- criacao de anuncio com navegação pelo fluxo de 3 passos
- navegacao em passos pendentes refletindo warning visual no wizard
- testar travamento do envio com +7 imagens no anuncio
- editar anuncio existente
- chat

### Admin

- dashboard administrativo
- bloqueio de usuario
- desativacao de veiculo
- tratamento de solicitacoes LGPD

## Regras de negocio que o QA precisa saber

### Autenticacao e sessao

- cadastro publico cria usuarios comuns
- `ADMIN` nao pode ser criado via cadastro publico
- refresh token fica em cookie `httpOnly`
- frontend guarda apenas sessao reduzida em `sessionStorage`
- `localStorage` deve guardar apenas dicas de sessao e preferencia de analytics

### Busca e listagem

- resultados filtram por:
  - texto
  - cidade
  - tipo de veiculo
  - categoria
  - faixa de preco **por diaria** (`minDailyRate`/`maxDailyRate`; os parametros antigos `minPrice`/`maxPrice` valem como valor semanal e sao convertidos ÷ 7)
  - geolocalizacao e raio

### Favoritos

- so usuario autenticado consegue manter favoritos
- o mesmo veiculo nao deve duplicar em favoritos
- remover favorito deve refletir na listagem e no detalhe

### Chat

- a conversa nasce a partir da tela do veiculo
- nao e permitido abrir chat para o proprio anuncio
- mensagens atualizam a conversa e contagem de nao lidas
- ha integracao REST + socket

### Reviews

- reviews podem ser criadas para um anuncio (na pagina de detalhe do veiculo) ou para um usuario (no perfil publico do anunciante)
- autoavaliacao ja e bloqueada no frontend (formulario nem aparece pro dono do veiculo/perfil); duplicidade do mesmo autor pro mesmo alvo so e barrada no backend, aparecendo como erro apos o envio
- validar ambos os fluxos direto pela UI: abrir o formulario exige login, preencher estrelas + comentario, confirmar que dono nao ve o formulario, e testar o erro de duplicidade reenviando para o mesmo alvo

### Privacidade/LGPD

- o banner de analytics deve aparecer quando o usuario ainda nao respondeu a preferencia
- analytics nao essencial so pode disparar com consentimento
- central de privacidade permite exportacao e abertura de solicitacoes
- admin pode listar e mudar status das solicitacoes

## Areas de risco que merecem atencao extra

- rotas protegidas: testar navegacao logada e anonima para chat, favoritos, profile, owner dashboard, admin e privacy center.
- sessao: validar restauracao apos reload, expiracao de token e logout.

## Smoke test recomendado

Execute este roteiro sempre que houver build nova:

1. Subir ambiente, rodar seed e fazer login com um usuario comum.
2. Abrir home, navegar para busca e confirmar que veiculos seed aparecem.
3. Salvar um alerta de busca e confirmar que ele aparece na propria pagina de busca.
4. Favoritar um veiculo e confirmar que ele entra em `/favorites`.
5. Abrir detalhe de um veiculo, iniciar chat e enviar mensagem.
6. Fazer logout e validar limpeza da sessao no navegador.
7. Fazer login com `OWNER` e abrir `/owner-dashboard`.
8. Criar um anúncio navegando por todo o fluxo wizard em 3 etapas (Dados principais, Condições gerais, Fotos e Preços). No passo de preço informar a **diária** (ex.: 100) e um tempo mínimo (ex.: 1 mês), conferir a prévia da estimativa (7 dias R$ 700,00; 30 dias R$ 3.000,00) e, depois de publicar, abrir o detalhe e conferir os mesmos valores e o aviso.
9. Avançar para um passo seguinte deixando dados obrigatórios vazios, para validar a exibição de ícone de (⚠️) "Alerta Laranja" apontando campos incompletos.
10. Preencher tudo corretamente, testar o limite de 7 imagens da galeria, publicar e checar na busca online.
11. Fazer login com `ADMIN` e validar dashboard, usuarios, veiculos e privacidade.
12. Abrir `/privacy` e `/privacy-center`, mudar consentimento de analytics, exportar dados e criar uma solicitacao LGPD.
13. Em `/admin`, validar que a solicitacao LGPD aparece e pode mudar para `IN_REVIEW` e `COMPLETED`.

## Roteiro de regressao por perfil

### Visitante

- home carrega sem login
- busca aceita filtros e query string
- detalhe abre a partir da busca
- links de privacidade funcionam

### Interessado

- cadastro com avatar opcional
- login redireciona corretamente
- alerta de busca salva e remove corretamente
- favoritos persistem
- chat cria conversa e envia mensagem
- perfil salva dados e uploads
- central de privacidade responde

### Proprietario

- login redireciona para area de anuncios
- criar anuncio com campos minimos (preco = **diaria**, tempo minimo de aluguel opcional: 3 dias, 1 semana, 2 semanas, 1 mes, 3 meses ou sem minimo)
- detalhe do anuncio mostra diaria, estimativa de 7 e 30 dias e, se houver minimo, o total do periodo minimo, sempre com o aviso de que o pagamento e combinado entre as partes
- editar anuncio existente
- alternar entre rascunho/publicado
- adicionar imagens
- acompanhar indicadores no dashboard

### Admin

- login redireciona para `/admin`
- listar usuarios
- bloquear usuario
- listar veiculos
- desativar veiculo
- listar pedidos LGPD
- mudar status de pedido LGPD

## Casos negativos importantes

- tentar cadastrar `ADMIN`
- tentar iniciar chat no proprio anuncio
- tentar criar review duplicada para o mesmo anuncio ou usuario
- tentar salvar alerta de busca sem filtro
- tentar criar anuncio com diaria menor que R$ 1,00, ou com tempo minimo fora da lista (ex.: 5 dias)
- abrir `/search?minPrice=700&maxPrice=1400` (URL antiga) e confirmar que vira `minDailyRate=100&maxDailyRate=200`
- tentar abrir rota protegida sem login

## Validacoes tecnicas no navegador

Ao testar login/sessao:

- `sessionStorage` deve conter `triluga.accessToken` e `triluga.user`
- refresh token nao deve aparecer em `localStorage`
- cookie `triluga_refresh_token` deve existir
- apos logout, sessao e cookie devem ser invalidados

Ao testar privacidade:

- `localStorage` deve refletir `triluga.privacy.analyticsConsent`
- se o consentimento estiver negado, a chamada de analytics nao deve sair

Ao testar documentos:

- o payload de perfil deve sinalizar `hasDocumentImage` e `hasDriverLicenseImage`
- ao clicar para abrir arquivo, o frontend deve chamar endpoint de URL temporaria

## Validacoes no backend e banco

Use Swagger para:

- autenticar
- validar endpoints de `vehicles`, `profiles`, `privacy`, `admin` e `reviews`

Use Prisma Studio para conferir:

- `Profile`
- `PrivacyRequest`
- `Favorite`
- `SearchAlert`
- `Notification`

Use MinIO para conferir:

- imagens publicas de anuncios/avatar
- bucket privado de documentos

## Sugestao de dados para teste

Use estes cenarios:

- anuncio de carro: validar busca, detalhe, favorito e chat
- anuncio de moto: validar filtros por estilo e cilindrada
- anuncio novo: validar publicacao, fotos e presenca na busca
- review: validar bloqueio de autoavaliacao e duplicidade

## Como registrar bugs

Ao abrir bug, capture:

- perfil usado (`USER`, `OWNER`, `ADMIN`)
- rota/tela
- dados usados
- resultado esperado
- resultado obtido
- request/response relevante da API
- evidencias visuais

Classifique com este raciocinio:

- `P0`: bloqueia login, acesso, upload ou admin
- `P1`: quebra fluxo principal mas ha contorno
- `P2`: problema funcional secundario
- `P3`: copy, layout, polish ou inconsistencias nao bloqueantes

## Assinaturas (billing, v2.10.0)

Pré-requisito: o ambiente de teste precisa de `BILLING_ENABLED=true` para estes casos, exceto o caso "flag desligada". Use um usuário `OWNER` sem assinatura e um `ADMIN`.

> **Checkout real só no sandbox do Asaas.** Nunca teste pagamento com a conta de produção. Os casos de checkout abaixo valem apenas num ambiente com `ASAAS_BASE_URL` de sandbox. Sem sandbox disponível, marque como "não executado" e não como aprovado.

### Limite do plano grátis

1. Com conta grátis, publique 3 anúncios. Esperado: os 3 publicam.
2. Tente publicar o 4º. Esperado: aviso de limite com link "Ver planos" para `/plano`. A API responde 403 com `code: PLAN_LIMIT`, `limit: 3`, `used: 3`, `plan: FREE`.
3. Salve um 4º anúncio como rascunho. Esperado: salva sem aviso.
4. Com 3 ativos publicados, despublique um. Depois republique um anúncio despublicado: esperado, passa e a conta volta a 3. Em seguida, tente publicar um quarto anúncio (rascunho ou despublicado): esperado, 403 `PLAN_LIMIT`. Despublicar e republicar não burla o limite.
5. Edite um anúncio que já está publicado. Esperado: a edição nunca é bloqueada pelo limite.
6. Confirme que os anúncios acima do limite (se a conta tiver mais de 3 por ter sido criada antes) continuam no ar. Nenhum deve sumir.

### Página `/plano`

Teste cada estado do dono (use dados de teste; o estado vem do banco, não da tela):

1. **Grátis**: mostra "2 de 3 anúncios" (ou o número atual), os planos com preço e o botão "Assinar" em cada um.
2. **Ativo** (assinatura paga em dia): mostra o plano, a data de renovação e o botão "Cancelar".
3. **Pendente** (checkout aberto, sem pagamento confirmado): mostra estado pendente. Não concede acesso: o limite continua de 3.
4. **Atrasado** (`PAST_DUE`): mostra "Regularizar pagamento" e mantém o acesso dentro da tolerância de 7 dias. Depois da tolerância, o acesso volta ao grátis.
5. **Cancelado** (ainda dentro do período pago): mostra "acesso até DD/MM". Depois do fim do período, volta ao grátis.
6. **Concedido pelo admin** (`GRANT`): mostra o plano e a data de fim, se houver. Não mostra botão de cancelar.

### Retorno do checkout

Ao voltar do Asaas, a URL traz um parâmetro. Verifique cada um:

1. `/plano?checkout=sucesso`: mostra "Confirmando pagamento…" e consulta o plano por até 60 segundos. **Não libera acesso só por causa da URL.** Se o pagamento não foi confirmado pelo Asaas, o plano continua grátis.
2. `/plano?checkout=cancelado`: mensagem de checkout cancelado. Plano não muda.
3. `/plano?checkout=expirado`: mensagem de link expirado. Plano não muda.

### Cancelamento em duas etapas

1. Clique em "Cancelar". Esperado: não cancela ainda; aparece a pergunta de confirmação ("Tem certeza?").
2. Clique em "Voltar" ou feche a confirmação. Esperado: assinatura continua ativa.
3. Confirme. Esperado: mensagem com a data até quando o acesso fica; status vira cancelado; anúncios continuam no ar.

### Upgrade

1. Com plano Profissional ativo, assine a Frota. Esperado: após a confirmação, a Frota fica ativa e o Profissional é cancelado (sem cobrança dobrada).
2. Com a Frota ativa, o limite de anúncios deixa de existir ("ilimitado" no contador).

### Flag desligada (`BILLING_ENABLED=false`)

1. Abra a home. Esperado: **nenhuma** faixa "Planos para quem anuncia" e nenhum preço.
2. Abra o menu logado. Esperado: **não** existe o link "Plano".
3. Abra `/plano` direto pela URL. Esperado: página "Planos ainda não disponíveis", sem preço e sem botão de assinar.
4. Publique um 4º anúncio. Esperado: não há limite (a regra só vale com a flag ligada).

### Admin: conceder e revogar

1. Em `/admin`, bloco "Planos concedidos", conceda Profissional a um e-mail de teste, sem data de fim. Esperado: aparece na lista e o usuário passa a ter o plano em `/plano`.
2. Conceda Frota com data de fim no futuro. Esperado: aparece com a data.
3. Revogue (confirmação em duas etapas). Esperado: some da lista e o usuário volta ao grátis no próximo carregamento.
4. Com usuário comum, tente acessar a rota de concessão. Esperado: 403 (sem acesso).

### Webhook

1. Envie `POST /api/v1/billing/webhooks/asaas` sem o header `asaas-access-token`. Esperado: **403**, nada gravado.
2. Envie com token errado. Esperado: **403**, nada gravado.
3. Envie com o token certo e um evento que não é de assinatura. Esperado: 200 e o evento ignorado sem efeito.
4. Reenvie o mesmo evento duas vezes. Esperado: 200 nas duas e um único registro de evento (sem efeito duplicado).
5. Checkout com webhook real (sandbox): **não verificado**. Depende de URL pública do ambiente de teste.

### Validações técnicas

- Ao publicar acima do limite, a resposta tem o código `PLAN_LIMIT` e não grava o anúncio.
- `GET /api/v1/billing/plans` responde 200 sem login e com `enabled` igual à flag.
- Nenhum dado de cartão ou CPF aparece na tela, no console do navegador nem no corpo das respostas.

---

## Checklist final de aceite

Antes de encerrar a rodada, confirme:

- build sobe sem erro
- smoke por perfil passou
- nenhum fluxo protegido abriu para usuario anonimo
- nenhum arquivo sensivel ficou publico
- analytics respeitou consentimento
- owner e admin conseguiram executar suas acoes principais
- tickets sobre cobranca foram avaliados com o escopo atual em mente

## Resumo rapido para um QA novo

Se voce tiver 15 minutos para conhecer o Triluga, faca isto:

1. Rode o ambiente local e o seed.
2. Entre como usuario comum, navegue da home ate um anuncio e abra o chat.
3. Entre como `OWNER`, publique ou edite um anuncio.
4. Entre como `ADMIN`, veja usuarios e privacidade.
5. Revise cookies, storage e links temporarios de documento.

Com isso voce ja entende o coracao do produto e consegue seguir para regressao com contexto.
