'use strict';
// Passada ponta a ponta: Postgres descartável + backend REAL (dist/main) + Asaas FALSO (fake-asaas.js).
// Uso: node docs/reports/assinaturas-e2e/run-e2e.js   (a partir da raiz do Triluga, após `npm run build` em backend/)
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const { createFakeAsaas } = require('./fake-asaas.js');

const HERE = __dirname;
const TRILUGA = path.resolve(HERE, '..', '..', '..');
const BACKEND = path.join(TRILUGA, 'backend');
const PG_NATIVE = '/home/caminhao/coding/codeStage/Lumen/backend/node_modules/@embedded-postgres/linux-x64/native';
const PG_BIN = path.join(PG_NATIVE, 'bin');
const PG_LIB = path.join(PG_NATIVE, 'lib');
const PRISMA = path.join(BACKEND, 'node_modules', '.bin', 'prisma');
const PG_PORT = parseInt(process.env.E2E_PG_PORT || '54399', 10);
const API_PORT = parseInt(process.env.E2E_API_PORT || '3099', 10);
const FAKE_PORT = parseInt(process.env.E2E_FAKE_PORT || '3398', 10);
const DB_NAME = 'triluga';
const DB_USER = 'triluga';
const DB_PASS = 'triluga'; // senha descartável do Postgres de teste
const DB_URL = `postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${PG_PORT}/${DB_NAME}?schema=public`;
const PG_ADMIN_URL = `postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:${PG_PORT}/postgres?schema=public`;
const API = `http://127.0.0.1:${API_PORT}/api/v1`;
const FAKE_URL = `http://127.0.0.1:${FAKE_PORT}`;
const WEBHOOK_TOKEN = 'token-e2e-teste';
const PASS = 'SenhaE2E-123';
const EMAIL_USER = 'e2e.usuario@example.com';
const EMAIL_ADMIN = 'e2e.admin@example.com';
const PERSONAL_CPF = '12345678909';
const PERSONAL_PHONE = '11999990000';
const PERSONAL_CEP = '01001-000';
const PERSONAL_TOKEN = 'tok_e2e_cartao_fake_123';
const PERSONAL_CARD = '4111111111111111';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
let cur = null;
let throttleRetries = 0;

// obs = true: comportamento a confirmar pelo dono. Não reprova o passo; aparece como OBS.
function check(cond, text, obs = false) {
  cur.checks.push({ ok: !!cond, text, obs });
}
// Evidência curta; tokens JWT nunca vão para o relatório.
const redact = (v) => JSON.stringify(v, (k, val) => (/token|refresh|secret/i.test(k) ? '[redigido]' : val));
const ev = (res) => `HTTP ${res.status} ${redact(res.body).slice(0, 220)}`;

async function step(id, title, fn) {
  cur = { id, title, checks: [], error: null };
  report.push(cur);
  console.log(`\n== ${id} ${title}`);
  try {
    await fn();
  } catch (e) {
    cur.error = (e && e.message ? e.message : String(e)).slice(0, 400);
  }
  const failed = cur.error || cur.checks.length === 0 || cur.checks.some((c) => !c.ok && !c.obs);
  cur.status = failed ? 'FALHA' : 'OK';
  for (const c of cur.checks) console.log(`   ${c.ok ? 'ok ' : c.obs ? 'OBS' : 'NOK'} ${c.text}`);
  if (cur.error) console.log(`   ERRO ${cur.error}`);
  cur = null;
}

async function api(method, p, { token, body, headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    const h = { ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(API + p, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    // Throttler global do Nest: 20 req/min por rota e IP. Espera a janela e repete.
    if (res.status === 429 && attempt < 3) {
      throttleRetries += 1;
      await sleep(61000);
      continue;
    }
    return { status: res.status, body: json };
  }
}

async function fakeCtl(cfg) {
  await fetch(FAKE_URL + '/__control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
}
async function fakeLog() {
  return (await fetch(FAKE_URL + '/__log')).json();
}
// Requisições recebidas pelo fake a partir de uma marca (índice).
async function fakeSince(mark) {
  return (await fakeLog()).slice(mark);
}
async function fakeMark() {
  return (await fakeLog()).length;
}

function waitPort(port, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => {
        s.end();
        resolve();
      });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error(`porta ${port} não abriu`));
        else setTimeout(tryOnce, 300);
      });
    };
    tryOnce();
  });
}

function runCli(bin, args, opts = {}) {
  const r = spawnSync(bin, args, {
    cwd: opts.cwd || BACKEND,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', LD_LIBRARY_PATH: PG_LIB, ...(opts.env || {}) },
    input: opts.input,
    encoding: 'utf8',
    timeout: 300000,
  });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

const summaryLines = [];
async function main() {
  const pgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'triluga-e2e-'));
  const dataDir = path.join(pgDir, 'data');
  const backendLog = path.join(pgDir, 'backend.log');
  let pg = null;
  let backend = null;
  let fake = null;
  let db = null;
  const startedAt = new Date().toISOString();
  console.log(`diretório temporário (apagado no fim): ${pgDir}`);

  try {
    // ---------- passo 1: Postgres descartável + schema ----------
    await step('1', 'Postgres descartável e schema (migrate deploy + contorno do Dockerfile)', async () => {
      fs.writeFileSync(path.join(pgDir, 'pw'), DB_PASS);
      const initdb = runCli(path.join(PG_BIN, 'initdb'), ['-D', dataDir, '-U', DB_USER, '--pwfile', path.join(pgDir, 'pw'), '-E', 'UTF8', '--locale=C.UTF-8', '-A', 'scram-sha-256'], { cwd: pgDir });
      check(initdb.status === 0, `initdb rc=${initdb.status}`);
      if (initdb.status !== 0) throw new Error(initdb.out.slice(-400));

      pg = spawn(path.join(PG_BIN, 'postgres'), ['-D', dataDir, '-p', String(PG_PORT), '-k', pgDir, '-h', '127.0.0.1'], {
        env: { LD_LIBRARY_PATH: PG_LIB, PATH: process.env.PATH },
        stdio: ['ignore', fs.openSync(path.join(pgDir, 'pg.log'), 'w'), 'ignore'],
      });
      await waitPort(PG_PORT);
      check(true, `postgres 18 ouvindo em 127.0.0.1:${PG_PORT}`);

      const create = runCli(PRISMA, ['db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma'], { input: `CREATE DATABASE ${DB_NAME};`, env: { DATABASE_URL: PG_ADMIN_URL } });
      check(create.status === 0 && /successfully/i.test(create.out), `CREATE DATABASE ${DB_NAME}: ${create.out.includes('successfully') ? 'ok' : create.out.slice(-200)}`);

      const deploy = runCli(PRISMA, ['migrate', 'deploy'], { env: { DATABASE_URL: DB_URL } });
      check(deploy.status === 0 && /successfully applied/i.test(deploy.out), `prisma migrate deploy rc=${deploy.status}`);
      if (deploy.status !== 0) throw new Error(deploy.out.slice(-400));
      
      // Drift: o que o schema.prisma tem e as migrations não criam (esperado não vazio).
      const drift = runCli(PRISMA, ['migrate', 'diff', '--from-url', DB_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
      const driftLines = drift.out.split('\n').filter((l) => /^(CREATE|ALTER|DROP) /.test(l.trim())).length;
      check(driftLines > 0, `DRIFT antes do db push: ${driftLines} comandos SQL no diff migrations x schema.prisma (Report, AuditLog, FeaturedOrder e colunas como User.emailVerified)`);

      // Contorno do backend/Dockerfile (ramo P3005): db push sincroniza o que falta.
      const push = runCli(PRISMA, ['db', 'push', '--skip-generate', '--accept-data-loss'], { env: { DATABASE_URL: DB_URL } });
      check(push.status === 0 && /in sync|Your database is now in sync/i.test(push.out), `prisma db push (contorno Dockerfile) rc=${push.status}`);
      const after = runCli(PRISMA, ['migrate', 'diff', '--from-url', DB_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--script']);
      const afterLines = after.out.split('\n').filter((l) => /^(CREATE|ALTER|DROP) /.test(l.trim())).length;
      check(afterLines === 0, `diff após db push: ${afterLines} linhas (0 = schema completo)`);

      db = new (require(path.join(BACKEND, 'node_modules', '@prisma', 'client')).PrismaClient)({ datasources: { db: { url: DB_URL } } });
      const tables = await db.$queryRawUnsafe(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('Subscription','BillingEvent','Report','AuditLog','FeaturedOrder','Vehicle','User')`);
      check(tables[0].n === 7, `tabelas-chave presentes: ${tables[0].n}/7`);
    });

    // ---------- passo 2: Asaas falso ----------
    await step('2', 'Asaas falso em HTTP local (User-Agent obrigatório, log de requisições)', async () => {
      fake = await createFakeAsaas({ port: FAKE_PORT });
      const http = require('http');
      const noUa = await new Promise((resolve, reject) => {
        const rq = http.request({ host: '127.0.0.1', port: FAKE_PORT, path: '/v3/subscriptions/sub_probe', method: 'GET', headers: {} }, (rs) => { rs.resume(); rs.on('end', () => resolve(rs.statusCode)); });
        rq.on('error', reject);
        rq.end();
      });
      check(noUa === 403, `GET sem User-Agent -> ${noUa} (esperado 403)`);
      const ua = await fetch(`${FAKE_URL}/v3/subscriptions/sub_probe`, { headers: { 'User-Agent': 'e2e-probe' } });
      check(ua.status === 200, `GET com User-Agent -> ${ua.status}`);
      await fakeCtl({ failGetSubscriptionWith: null, deleteStatus: 200 });
    });

    // ---------- passo 3: backend real ----------
    await step('3', 'Backend real (dist/main) com BILLING_ENABLED=true e Asaas falso', async () => {
      const env = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        PORT: String(API_PORT),
        APP_URL: `http://127.0.0.1:${API_PORT}`,
        DATABASE_URL: DB_URL,
        JWT_ACCESS_SECRET: 'e2e-access-secret-falso',
        JWT_REFRESH_SECRET: 'e2e-refresh-secret-falso',
        BILLING_ENABLED: 'true',
        ASAAS_API_KEY: 'chave-falsa-e2e',
        ASAAS_BASE_URL: `${FAKE_URL}/v3`,
        ASAAS_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
        FRONTEND_URL: 'https://triluga.example.com',
        ADMIN_ACCOUNT_EMAIL: EMAIL_ADMIN, // RolesGuard exige ADMIN + e-mail = ADMIN_ACCOUNT_EMAIL
      };
      backend = spawn(process.execPath, ['dist/main'], { cwd: BACKEND, env, stdio: ['ignore', fs.openSync(backendLog, 'w'), fs.openSync(backendLog, 'a')] });
      backend.on('exit', (code) => { cur && check(false, `backend saiu com code=${code}`); });
      const started = Date.now();
      let up = false;
      while (Date.now() - started < 90000) {
        try {
          const r = await fetch(`${API}/billing/plans`);
          if (r.status === 200) { up = true; break; }
        } catch {}
        await sleep(500);
      }
      check(up, `GET /api/v1/billing/plans ${up ? '200' : 'sem resposta em 90s'} (log: ${backendLog})`);
      if (!up) throw new Error('backend não subiu');
    });

    // ---------- 4a: usuários ----------
    let tokenUser;
    let tokenAdmin;
    let userId;
    await step('4a', 'Registro real do usuário comum e de um ADMIN (via Prisma); sem verificação de e-mail', async () => {
      const reg = (email, doc, name) => api('POST', '/auth/register', {
        body: { email, password: PASS, documentNumber: doc, fullName: name, phone: PERSONAL_PHONE, zipCode: PERSONAL_CEP, addressLine: 'Rua Teste, 1', addressComplement: 'Apto 1', city: 'Sao Paulo', state: 'SP' },
      });
      const r1 = await reg(EMAIL_USER, PERSONAL_CPF, 'Usuario E2E');
      check(r1.status === 201 || r1.status === 200, `POST /auth/register usuário -> ${ev(r1)}`);
      const r2 = await reg(EMAIL_ADMIN, '98765432100', 'Admin E2E');
      check(r2.status === 201 || r2.status === 200, `POST /auth/register admin -> ${r2.status}`);
      await db.user.update({ where: { email: EMAIL_ADMIN }, data: { role: 'ADMIN' } });
      const l1 = await api('POST', '/auth/login', { body: { email: EMAIL_USER, password: PASS } });
      tokenUser = l1.body && l1.body.accessToken;
      check((l1.status === 200 || l1.status === 201) && tokenUser, `POST /auth/login usuário -> ${l1.status} (token presente: ${!!tokenUser})`);
      const l2 = await api('POST', '/auth/login', { body: { email: EMAIL_ADMIN, password: PASS } });
      tokenAdmin = l2.body && l2.body.accessToken;
      check((l2.status === 200 || l2.status === 201) && tokenAdmin, `POST /auth/login admin -> ${l2.status}`);
      const u = await db.user.findUnique({ where: { email: EMAIL_USER } });
      userId = u && u.id;
      check(u && u.emailVerified === false, `usuário sem e-mail verificado e login mesmo assim: emailVerified=${u && u.emailVerified}`);
    });

    // ---------- 4b: anúncios e limite FREE ----------
    const vehicle = (plate, extra = {}) => ({
      title: `Anuncio E2E ${plate}`, brand: 'Fiat', model: 'Argo', year: 2021, plate,
      city: 'Sao Paulo', state: 'SP', category: 'HATCH', transmission: 'MANUAL', fuelType: 'FLEX',
      seats: 5, dailyRate: 120, description: 'Veiculo de teste da passada ponta a ponta.', ...extra,
    });
    let draftId;
    await step('4b', 'Anúncios: 3 publicados OK; 4º publicado = 403 PLAN_LIMIT; rascunho passa; republicar = 403', async () => {
      for (const plate of ['AAA1B01', 'AAA1B02', 'AAA1B03']) {
        const r = await api('POST', '/vehicles', { token: tokenUser, body: vehicle(plate) });
        check(r.status === 201, `anúncio ${plate} publicado -> ${r.status}`);
      }
      const r4 = await api('POST', '/vehicles', { token: tokenUser, body: vehicle('AAA1B04') });
      check(r4.status === 403 && r4.body && r4.body.code === 'PLAN_LIMIT' && r4.body.limit === 3 && r4.body.used === 3 && r4.body.plan === 'FREE',
        `4º publicado -> ${ev(r4)}`);
      const rd = await api('POST', '/vehicles', { token: tokenUser, body: vehicle('AAA1B05', { isPublished: false }) });
      draftId = rd.body && (rd.body.id || (rd.body.vehicle && rd.body.vehicle.id));
      check(rd.status === 201 && draftId, `rascunho (isPublished=false) -> ${rd.status} id=${draftId}`);
      const rp = await api('PATCH', `/vehicles/${draftId}`, { token: tokenUser, body: { isPublished: true } });
      check(rp.status === 403 && rp.body && rp.body.code === 'PLAN_LIMIT', `republicar rascunho -> ${ev(rp)}`);
      const count = await db.vehicle.count({ where: { ownerId: userId, isActive: true, isPublished: true } });
      check(count === 3, `publicados no banco: ${count} (esperado 3)`);
    });

    // ---------- 4c: plans / me ----------
    await step('4c', 'GET /billing/plans (público) e GET /billing/me', async () => {
      const p = await api('GET', '/billing/plans');
      const plans = (p.body && p.body.plans) || [];
      const pro = plans.find((x) => x.id === 'PROFESSIONAL');
      const fleet = plans.find((x) => x.id === 'FLEET');
      const free = plans.find((x) => x.id === 'FREE');
      check(p.status === 200 && p.body.enabled === true, `GET /billing/plans sem token -> ${p.status} enabled=${p.body && p.body.enabled}`);
      check(free && free.adLimit === 3 && pro && pro.adLimit === 10 && fleet && fleet.adLimit === null, `limites FREE=${free && free.adLimit} PRO=${pro && pro.adLimit} FROTA=${fleet && fleet.adLimit}`);
      check(pro && pro.prices.MONTHLY === 29.9 && fleet && fleet.prices.MONTHLY === 79.9, `preços PRO=${pro && pro.prices.MONTHLY} FROTA=${fleet && fleet.prices.MONTHLY}`);
      const me = await api('GET', '/billing/me', { token: tokenUser });
      check(me.status === 200 && me.body.plan === 'FREE' && me.body.usage.ads.used === 3 && me.body.usage.ads.limit === 3, `GET /billing/me -> ${me.status} ${JSON.stringify(me.body.usage)} plan=${me.body.plan}`);
    });

    // ---------- 4d: checkout ----------
    let pendingPro;
    await step('4d', 'POST /billing/checkout PROFESSIONAL MONTHLY: corpo enviado ao Asaas e linha PENDING', async () => {
      const mark = await fakeMark();
      const r = await api('POST', '/billing/checkout', { token: tokenUser, body: { plan: 'PROFESSIONAL', interval: 'MONTHLY' } });
      check(r.status === 201 && typeof r.body.link === 'string' && r.body.link.startsWith('https://sandbox.asaas.fake/checkout/'), `POST /billing/checkout -> ${ev(r)}`);
      const reqs = (await fakeSince(mark)).filter((q) => q.method === 'POST' && q.path === '/checkouts');
      check(reqs.length === 1, `POST /checkouts recebido pelo fake: ${reqs.length}`);
      const b = reqs[0] && reqs[0].body;
      pendingPro = await db.subscription.findFirst({ where: { ownerUserId: userId, plan: 'PROFESSIONAL' }, orderBy: { createdAt: 'desc' } });
      check(b && JSON.stringify(b.billingTypes) === '["CREDIT_CARD"]' && JSON.stringify(b.chargeTypes) === '["RECURRENT"]', `billingTypes=${b && JSON.stringify(b.billingTypes)} chargeTypes=${b && JSON.stringify(b.chargeTypes)}`);
      check(b && b.items && b.items[0].value === 29.9, `items[0].value=${b && b.items && b.items[0].value}`);
      check(b && !('customerData' in b), `sem customerData no corpo: ${b && !('customerData' in b)}`);
      check(b && b.callback && b.callback.successUrl === 'https://triluga.example.com/plano?checkout=sucesso' && b.callback.cancelUrl === 'https://triluga.example.com/plano?checkout=cancelado' && b.callback.expiredUrl === 'https://triluga.example.com/plano?checkout=expirado', `3 callbacks: ${b && JSON.stringify(b.callback)}`);
      check(b && pendingPro && b.externalReference === pendingPro.id, `externalReference=${b && b.externalReference} == Subscription.id=${pendingPro && pendingPro.id}`);
      check(reqs[0] && reqs[0].access_token_present && reqs[0].user_agent, `header access_token presente=${reqs[0] && reqs[0].access_token_present}, User-Agent=${reqs[0] && reqs[0].user_agent}`);
      check(pendingPro && pendingPro.status === 'PENDING' && pendingPro.source === 'ASAAS' && pendingPro.asaasCheckoutLink === r.body.link, `Subscription status=${pendingPro && pendingPro.status} source=${pendingPro && pendingPro.source} link gravado=${!!(pendingPro && pendingPro.asaasCheckoutLink)}`);
    });

    // ---------- 4e: webhook ----------
    const checkoutPaidPayload = (id, extra = {}) => ({
      id, event: 'CHECKOUT_PAID', dateCreated: '2026-11-14',
      checkout: {
        id: pendingPro.asaasCheckoutId, externalReference: pendingPro.id, subscription: 'sub_e2e_1', customer: 'cus_e2e_1',
        cpfCnpj: PERSONAL_CPF, email: EMAIL_USER, phone: PERSONAL_PHONE, postalCode: PERSONAL_CEP, creditCardToken: PERSONAL_TOKEN,
      },
      cpfCnpj: PERSONAL_CPF, email: EMAIL_USER, phone: PERSONAL_PHONE, postalCode: PERSONAL_CEP,
      creditCard: { creditCardToken: PERSONAL_TOKEN, creditCardNumber: PERSONAL_CARD, creditCardBrand: 'VISA' },
      customer: { id: 'cus_e2e_1', cpfCnpj: PERSONAL_CPF, email: EMAIL_USER, phone: PERSONAL_PHONE, postalCode: PERSONAL_CEP },
      ...extra,
    });
    const WH = '/billing/webhooks/asaas';
    await step('4e', 'Webhook CHECKOUT_PAID: sem/errado token = 403 e nada gravado; certo = ACTIVE; reenvio idempotente', async () => {
      const evBefore = await db.billingEvent.count();
      const r0 = await api('POST', WH, { body: checkoutPaidPayload('evt_e2e_sem_token') });
      check(r0.status === 403, `sem header asaas-access-token -> ${r0.status}`);
      const r1 = await api('POST', WH, { headers: { 'asaas-access-token': 'token-errado' }, body: checkoutPaidPayload('evt_e2e_token_errado') });
      check(r1.status === 403, `token errado -> ${r1.status}`);
      const evAfterBad = await db.billingEvent.count();
      check(evAfterBad === evBefore, `BillingEvent após 2 recusas: ${evAfterBad} (antes ${evBefore}, esperado igual)`);

      const mark = await fakeMark();
      const ok = await api('POST', WH, { headers: { 'asaas-access-token': WEBHOOK_TOKEN }, body: checkoutPaidPayload('evt_e2e_checkout_1') });
      check(ok.status === 200 && ok.body && ok.body.ok === true, `token certo, CHECKOUT_PAID -> ${ev(ok)}`);
      const get1 = (await fakeSince(mark)).filter((q) => q.method === 'GET' && q.path === '/subscriptions/sub_e2e_1');
      check(get1.length === 1, `fake recebeu GET /subscriptions/sub_e2e_1 x${get1.length} (reconcile)`);

      const mark2 = await fakeMark();
      const re = await api('POST', WH, { headers: { 'asaas-access-token': WEBHOOK_TOKEN }, body: checkoutPaidPayload('evt_e2e_checkout_1') });
      check(re.status === 200 && re.body && re.body.ok === true, `reenvio do MESMO evento -> ${ev(re)}`);
      const getAfterReplay = (await fakeSince(mark2)).length;
      check(getAfterReplay === 0, `reenvio não chamou o Asaas de novo: ${getAfterReplay} req`);
      const evs = await db.billingEvent.findMany({ where: { externalEventId: 'evt_e2e_checkout_1' } });
      check(evs.length === 1 && evs[0].processedAt !== null && evs[0].error === null, `BillingEvent evt_e2e_checkout_1: linhas=${evs.length} processedAt=${evs[0] && !!evs[0].processedAt}`);

      const sub = await db.subscription.findUnique({ where: { id: pendingPro.id } });
      check(sub.status === 'ACTIVE' && sub.asaasSubscriptionId === 'sub_e2e_1' && sub.currentPeriodEnd > new Date(), `Subscription: status=${sub.status} asaasSubscriptionId=${sub.asaasSubscriptionId} fim=${sub.currentPeriodEnd && sub.currentPeriodEnd.toISOString()}`);
      const me = await api('GET', '/billing/me', { token: tokenUser });
      check(me.body.plan === 'PROFESSIONAL' && me.body.source === 'ASAAS' && me.body.status === 'ACTIVE', `GET /billing/me -> plan=${me.body.plan} source=${me.body.source} status=${me.body.status}`);
    });

    await step('4e2', 'BillingEvent.payload sem dado pessoal (cpfCnpj, email, phone, postalCode, creditCard*)', async () => {
      const row = await db.billingEvent.findUnique({ where: { externalEventId: 'evt_e2e_checkout_1' } });
      const text = JSON.stringify(row.payload);
      const keys = ['"cpfCnpj"', '"email"', '"phone"', '"postalCode"', '"creditCard', '"creditCardToken"'];
      const keysFound = keys.filter((k) => text.includes(k));
      check(keysFound.length === 0, `chaves sensíveis no payload: ${keysFound.length ? keysFound.join(',') : 'nenhuma'}`);
      const values = [PERSONAL_CPF, EMAIL_USER, PERSONAL_PHONE, PERSONAL_CEP, PERSONAL_TOKEN, PERSONAL_CARD];
      const valuesFound = values.filter((v) => text.includes(v));
      check(valuesFound.length === 0, `valores pessoais no payload: ${valuesFound.length ? valuesFound.length : 'nenhum'}`);
      check(text.includes('"checkout"') && text.includes('"sub_e2e_1"'), `campos úteis mantidos (checkout, subscription): ${text.includes('sub_e2e_1')}`);
      check(row.type === 'CHECKOUT_PAID' && row.provider === 'ASAAS', `type=${row.type} provider=${row.provider}`);
    });

    // ---------- 4f: publicar o 4º ----------
    await step('4f', 'Com PROFESSIONAL, publicar o rascunho (4º) = 200', async () => {
      const r = await api('PATCH', `/vehicles/${draftId}`, { token: tokenUser, body: { isPublished: true } });
      check(r.status === 200, `PATCH rascunho isPublished=true -> ${r.status} ${r.status !== 200 ? ev(r) : ''}`);
      const count = await db.vehicle.count({ where: { ownerId: userId, isActive: true, isPublished: true } });
      check(count === 4, `publicados no banco: ${count} (esperado 4)`);
    });

    // ---------- 4g: upgrade ----------
    let pendingFleet;
    await step('4g', 'Upgrade: checkout FROTA; CHECKOUT_PAID cancela PRO no Asaas (DELETE) e deixa FROTA ACTIVE', async () => {
      const mark = await fakeMark();
      const r = await api('POST', '/billing/checkout', { token: tokenUser, body: { plan: 'FLEET', interval: 'MONTHLY' } });
      check(r.status === 201 && r.body.link, `POST /billing/checkout FLEET -> ${r.status}`);
      pendingFleet = await db.subscription.findFirst({ where: { ownerUserId: userId, plan: 'FLEET' }, orderBy: { createdAt: 'desc' } });
      const post = (await fakeSince(mark)).filter((q) => q.method === 'POST' && q.path === '/checkouts');
      check(post.length === 1 && post[0].body.items[0].value === 79.9 && post[0].body.externalReference === pendingFleet.id, `checkout FROTA enviado: valor=${post[0] && post[0].body.items[0].value} extRef ok=${post[0] && post[0].body.externalReference === pendingFleet.id}`);

      const mark2 = await fakeMark();
      const wh = await api('POST', WH, { headers: { 'asaas-access-token': WEBHOOK_TOKEN }, body: {
        id: 'evt_e2e_checkout_2', event: 'CHECKOUT_PAID',
        checkout: { id: pendingFleet.asaasCheckoutId, externalReference: pendingFleet.id, subscription: 'sub_e2e_2', customer: 'cus_e2e_1' },
      } });
      check(wh.status === 200, `CHECKOUT_PAID FROTA -> ${ev(wh)}`);
      const reqs = await fakeSince(mark2);
      const delIdx = reqs.findIndex((q) => q.method === 'DELETE' && q.path === '/subscriptions/sub_e2e_1');
      const getIdx = reqs.findIndex((q) => q.method === 'GET' && q.path === '/subscriptions/sub_e2e_2');
      check(delIdx >= 0, `fake recebeu DELETE /subscriptions/sub_e2e_1 (PRO antiga): índice ${delIdx}`);
      check(getIdx >= 0 && getIdx < delIdx, `GET da nova (${getIdx}) antes do DELETE da antiga (${delIdx})`);
      const pro = await db.subscription.findUnique({ where: { id: pendingPro.id } });
      const fl = await db.subscription.findUnique({ where: { id: pendingFleet.id } });
      check(pro.status === 'CANCELED' && pro.cancelAtPeriodEnd === true, `PRO antiga: status=${pro.status} cancelAtPeriodEnd=${pro.cancelAtPeriodEnd}`);
      check(fl.status === 'ACTIVE', `FROTA nova: status=${fl.status}`);
      const me = await api('GET', '/billing/me', { token: tokenUser });
      check(me.body.plan === 'FLEET', `GET /billing/me plan=${me.body.plan}`);
    });

    // ---------- 4h: cancelar + reembolso ----------
    await step('4h', 'POST /billing/cancel (DELETE no Asaas) + PAYMENT_REFUNDED volta ao FREE sem apagar anúncios', async () => {
      const mark = await fakeMark();
      const c = await api('POST', '/billing/cancel', { token: tokenUser });
      check(c.status === 201 || c.status === 200, `POST /billing/cancel -> ${c.status}`);
      const dels = (await fakeSince(mark)).filter((q) => q.method === 'DELETE');
      check(dels.length === 1 && dels[0].path === '/subscriptions/sub_e2e_2', `DELETE recebido pelo fake: ${dels.map((d) => d.path).join(',')}`);
      const fl = await db.subscription.findUnique({ where: { id: pendingFleet.id } });
      check(fl.status === 'CANCELED' && fl.cancelAtPeriodEnd === true && fl.currentPeriodEnd !== null, `FROTA após cancel: status=${fl.status} fim mantido=${!!fl.currentPeriodEnd}`);

      const rf = await api('POST', WH, { headers: { 'asaas-access-token': WEBHOOK_TOKEN }, body: {
        id: 'evt_e2e_refund_1', event: 'PAYMENT_REFUNDED',
        payment: { id: 'pay_e2e_1', subscription: 'sub_e2e_2', value: 79.9, status: 'REFUNDED', customer: 'cus_e2e_1', email: EMAIL_USER },
      } });
      check(rf.status === 200, `PAYMENT_REFUNDED -> ${ev(rf)}`);
      const fl2 = await db.subscription.findUnique({ where: { id: pendingFleet.id } });
      check(fl2.status === 'EXPIRED', `FROTA após reembolso: status=${fl2.status}`);
      const meLiteral = await api('GET', '/billing/me', { token: tokenUser });
      const proRow = await db.subscription.findUnique({ where: { id: pendingPro.id } });
      check(meLiteral.body.plan === 'FREE', `após refund do FROTA, /billing/me plan=${meLiteral.body.plan}. PRO antiga (CANCELED pelo upgrade) fim=${proRow.currentPeriodEnd.toISOString()} ainda concede acesso (regra CANCELED até o fim do período)`, true);
      // Simulação: fim do período da PRO antiga já passou (update direto no banco de teste).
      await db.subscription.update({ where: { id: pendingPro.id }, data: { currentPeriodEnd: new Date(Date.now() - 60000) } });
      const me = await api('GET', '/billing/me', { token: tokenUser });
      check(me.body.plan === 'FREE', `com o período da PRO antiga encerrado (simulado no banco): /billing/me plan=${me.body.plan}`);
      const pub = await db.vehicle.count({ where: { ownerId: userId, isActive: true, isPublished: true } });
      const all = await db.vehicle.count({ where: { ownerId: userId } });
      check(pub === 4 && all === 4, `anúncios: publicados=${pub} (esperado 4) total=${all} (esperado 4, nenhum apagado)`);
      const np = await api('POST', '/vehicles', { token: tokenUser, body: vehicle('AAA1B06') });
      check(np.status === 403 && np.body.code === 'PLAN_LIMIT' && np.body.plan === 'FREE' && np.body.used === 4, `novo publicado no FREE -> ${ev(np)}`);
    });

    // ---------- 4i: grant admin ----------
    await step('4i', 'Admin: concessão FROTA com endsAt -03:00 (source GRANT) e revogação volta ao FREE', async () => {
      const notAdmin = await api('POST', '/billing/admin/grants', { token: tokenUser, body: { email: EMAIL_USER, plan: 'FLEET' } });
      check(notAdmin.status === 403, `usuário comum em /admin/grants -> ${notAdmin.status}`);
      const future = new Date(Date.now() + 30 * 86400000 - 3 * 3600000).toISOString().replace('Z', '-03:00');
      const g = await api('POST', '/billing/admin/grants', { token: tokenAdmin, body: { email: EMAIL_USER, plan: 'FLEET', endsAt: future } });
      check(g.status === 201 && g.body.id && g.body.status === 'ACTIVE', `POST /billing/admin/grants -> ${ev(g)}`);
      const me = await api('GET', '/billing/me', { token: tokenUser });
      check(me.body.plan === 'FLEET' && me.body.source === 'GRANT', `GET /billing/me plan=${me.body.plan} source=${me.body.source}`);
      const rv = await api('DELETE', `/billing/admin/grants/${g.body.id}`, { token: tokenAdmin });
      check(rv.status === 200 && rv.body.status === 'EXPIRED', `DELETE grant -> ${ev(rv)}`);
      const me2 = await api('GET', '/billing/me', { token: tokenUser });
      check(me2.body.plan === 'FREE', `após revogar plan=${me2.body.plan}`);
    });

    // ---------- 4j: sync ----------
    await step('4j', 'POST /billing/sync: sem assinatura = no-op; PENDING sem remoto = consulta por externalReference e segue PENDING', async () => {
      const mark0 = await fakeMark();
      const s0 = await api('POST', '/billing/sync', { token: tokenUser });
      const req0 = await fakeSince(mark0);
      check(s0.status === 201 || s0.status === 200, `sync sem assinatura aberta -> ${s0.status}; chamadas ao Asaas: ${req0.length} (esperado 0)`);

      const c = await api('POST', '/billing/checkout', { token: tokenUser, body: { plan: 'PROFESSIONAL', interval: 'MONTHLY' } });
      check(c.status === 201, `novo checkout PRO (PENDING) -> ${c.status}`);
      const pend = await db.subscription.findFirst({ where: { ownerUserId: userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } });
      const mark = await fakeMark();
      const s = await api('POST', '/billing/sync', { token: tokenUser });
      const req = await fakeSince(mark);
      const lookup = req.find((q) => q.method === 'GET' && q.path.startsWith('/subscriptions?externalReference='));
      check((s.status === 201 || s.status === 200) && lookup && lookup.path.includes(pend.id), `sync -> ${s.status}; GET por externalReference: ${lookup ? 'sim' : 'não'}`);
      const after = await db.subscription.findUnique({ where: { id: pend.id } });
      check(after.status === 'PENDING' && after.asaasSubscriptionId === null, `PENDING continua: status=${after.status}`);
    });

    // ---------- 4k: falha 500 no webhook ----------
    await step('4k', 'Falha: fake 500 no GET durante webhook = 5xx, BillingEvent com error e sem processedAt; reenvio processa', async () => {
      const pend = await db.subscription.findFirst({ where: { ownerUserId: userId, status: 'PENDING', plan: 'PROFESSIONAL' }, orderBy: { createdAt: 'desc' } });
      const payload = { id: 'evt_e2e_fail_1', event: 'CHECKOUT_PAID', checkout: { id: pend.asaasCheckoutId, externalReference: pend.id, subscription: 'sub_e2e_3', customer: 'cus_e2e_1' } };
      await fakeCtl({ failGetSubscriptionWith: 500 });
      const mark = await fakeMark();
      const r = await api('POST', WH, { headers: { 'asaas-access-token': WEBHOOK_TOKEN }, body: payload });
      await fakeCtl({ failGetSubscriptionWith: null });
      check(r.status >= 500 && r.status < 600, `webhook com Asaas 500 -> HTTP ${r.status} (esperado 5xx)`);
      const gets = (await fakeSince(mark)).filter((q) => q.method === 'GET' && q.path === '/subscriptions/sub_e2e_3');
      check(gets.length === 3, `GET /subscriptions/sub_e2e_3 tentativas no fake: ${gets.length} (3 = retry do GET)`);
      const row = await db.billingEvent.findUnique({ where: { externalEventId: 'evt_e2e_fail_1' } });
      check(row && row.processedAt === null && row.error && row.error.includes('500'), `BillingEvent: processedAt=${row && row.processedAt} error="${row && row.error && row.error.slice(0, 120)}"`);
      const log = fs.readFileSync(backendLog, 'utf8').split('\n').filter((l) => /Asaas respondeu 500/.test(l)).slice(-1)[0] || '';
      check(log.length > 0, `log do backend: ${log.slice(0, 160)}`);

      const r2 = await api('POST', WH, { headers: { 'asaas-access-token': WEBHOOK_TOKEN }, body: payload });
      check(r2.status === 200, `reenvio com Asaas normal -> ${ev(r2)}`);
      const row2 = await db.billingEvent.findUnique({ where: { externalEventId: 'evt_e2e_fail_1' } });
      check(row2.processedAt !== null, `BillingEvent após reenvio: processedAt preenchido=${!!row2.processedAt}`);
      check(row2.error === null, `error após reenvio bem-sucedido = ${row2.error === null ? 'null' : 'mantido (não é limpo no sucesso)'}`, true);
      const sub = await db.subscription.findUnique({ where: { id: pend.id } });
      check(sub.status === 'ACTIVE' && sub.asaasSubscriptionId === 'sub_e2e_3', `Subscription após reenvio: status=${sub.status}`);
    });
  } finally {
    // ---------- teardown ----------
    console.log('\n== teardown');
    try { if (db) await db.$disconnect(); } catch {}
    if (backend) { backend.kill('SIGTERM'); await sleep(1500); }
    if (fake) fake.server.close();
    if (pg) { pg.kill('SIGINT'); await sleep(2000); }
    const backendLogText = fs.existsSync(backendLog) ? fs.readFileSync(backendLog, 'utf8') : '';
    const errLines = backendLogText.split('\n').filter((l) => /ERROR|Asaas respondeu|Token de webhook|Falha/.test(l)).slice(0, 12);
    fs.rmSync(pgDir, { recursive: true, force: true });
    console.log(`diretório temporário apagado: ${!fs.existsSync(pgDir)}`);

    const out = [];
    out.push('# Passada ponta a ponta: assinaturas (Asaas falso)');
    out.push(`início: ${startedAt}  fim: ${new Date().toISOString()}`);
    out.push(`backend: dist/main (build) | Postgres: embedded 18 (porta ${PG_PORT}) | Asaas falso: porta ${FAKE_PORT} | API: ${API_PORT}`);
    out.push(`retries por 429 do throttler global: ${throttleRetries}`);
    out.push('');
    for (const s of report) {
      out.push(`${s.status} ${s.id} ${s.title}`);
      for (const c of s.checks) out.push(`    ${c.ok ? 'ok ' : c.obs ? 'OBS' : 'NOK'} ${c.text}`);
      if (s.error) out.push(`    ERRO ${s.error}`);
    }
    const oks = report.filter((s) => s.status === 'OK').length;
    out.push('');
    out.push(`RESUMO: ${oks}/${report.length} passos OK`);
    if (errLines.length) {
      out.push('');
      out.push('linhas de ERROR/Falha do log do backend (trecho):');
      for (const l of errLines) out.push(`    ${l.slice(0, 220)}`);
    }
    fs.writeFileSync(path.join(HERE, 'e2e-output.txt'), out.join('\n') + '\n');
    console.log(`\nRESUMO: ${oks}/${report.length} passos OK -> e2e-output.txt`);
    process.exitCode = oks === report.length ? 0 : 1;
  }
}

main().catch((e) => {
  console.error('FALHA FATAL', e);
  process.exit(1);
});
