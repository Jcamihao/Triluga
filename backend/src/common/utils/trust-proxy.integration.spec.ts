import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { applyTrustProxy } from './trust-proxy.util';

// Módulo mínimo: não importa o AppModule (ele exige banco).
// Limite 2 por minuto para o 3º request estourar sem precisar de muitas chamadas.
@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 2 }])],
  controllers: [PingController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class TrustProxyTestModule {}

// Mesma sequência do main.ts: applyTrustProxy antes do init.
async function createApp(hops: number): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [TrustProxyTestModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  applyTrustProxy(app, new ConfigService({ app: { trustProxyHops: hops } }));
  await app.init();
  return app;
}

function ping(app: NestExpressApplication, forwardedFor?: string) {
  const req = request(app.getHttpServer()).get('/ping');
  return forwardedFor === undefined
    ? req
    : req.set('X-Forwarded-For', forwardedFor);
}

async function statuses(
  app: NestExpressApplication,
  headers: Array<string | undefined>,
) {
  const result: number[] = [];
  for (const header of headers) {
    result.push((await ping(app, header)).status);
  }
  return result;
}

describe('trust proxy + ThrottlerGuard (integração)', () => {
  it('hops=1: cada IP real tem seu próprio balde', async () => {
    const app = await createApp(1);
    try {
      expect((await ping(app, '203.0.113.1')).status).toBe(200);
      expect((await ping(app, '203.0.113.1')).status).toBe(200);
      expect((await ping(app, '203.0.113.1')).status).toBe(429);

      expect((await ping(app, '203.0.113.2')).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('hops=0: todos os requests caem no mesmo balde (comportamento antigo)', async () => {
    const app = await createApp(0);
    try {
      expect((await ping(app, '203.0.113.1')).status).toBe(200);
      expect((await ping(app, '203.0.113.2')).status).toBe(200);
      expect((await ping(app, '203.0.113.3')).status).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('hops=1: prefixo forjado no X-Forwarded-For não troca o balde', async () => {
    const app = await createApp(1);
    try {
      // nginx anexa o IP real à direita: a chave é 203.0.113.9.
      expect((await ping(app, '198.51.100.7, 203.0.113.9')).status).toBe(200);
      expect((await ping(app, '198.51.100.7, 203.0.113.9')).status).toBe(200);
      expect((await ping(app, '198.51.100.7, 203.0.113.9')).status).toBe(429);

      // Prefixo falso diferente, mesmo IP real à direita: continua bloqueado.
      expect((await ping(app, '1.1.1.1, 203.0.113.9')).status).toBe(429);

      // Outro IP real à direita tem balde próprio.
      expect((await ping(app, '1.1.1.1, 203.0.113.10')).status).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('trust proxy + ThrottlerGuard: IPv6 e cabeçalho malformado', () => {
  it('hops=1: IPv6 e IPv4 mapeado têm balde próprio e prefixo forjado não troca o balde', async () => {
    const app = await createApp(1);
    try {
      expect(await statuses(app, ['2001:db8::1', '2001:db8::1'])).toEqual([
        200, 200,
      ]);
      expect((await ping(app, '2001:db8::1')).status).toBe(429);

      // Outro IPv6 não é afetado.
      expect((await ping(app, '2001:db8::2')).status).toBe(200);

      // Prefixo forjado à esquerda não escapa do balde esgotado.
      expect((await ping(app, '2001:db8::99, 2001:db8::1')).status).toBe(429);
      expect((await ping(app, '203.0.113.9, 2001:db8::1')).status).toBe(429);

      // IPv4 mapeado em IPv6 (como o nginx dual-stack entrega) tem balde próprio.
      expect(
        await statuses(app, ['::ffff:203.0.113.9', '::ffff:203.0.113.9']),
      ).toEqual([200, 200]);
      expect((await ping(app, 'lixo, ::ffff:203.0.113.9')).status).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('hops=1: lixo à esquerda do IP anexado pelo nginx não muda o balde', async () => {
    const app = await createApp(1);
    try {
      expect(await statuses(app, ['203.0.113.9', 'lixo, 203.0.113.9'])).toEqual(
        [200, 200],
      );
      expect((await ping(app, ',,, 203.0.113.9')).status).toBe(429);
      expect((await ping(app, '203.0.113.10')).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('hops=1: cabeçalho ausente, vazio ou só vírgula cai no IP do socket (um balde só, sem trancar os IPs reais)', async () => {
    const app = await createApp(1);
    try {
      // Sem cabeçalho, vazio, espaços e vírgulas compartilham o balde do socket.
      expect(await statuses(app, [undefined, '', '   '])).toEqual([
        200, 200, 429,
      ]);
      expect((await ping(app, ',')).status).toBe(429);
      expect((await ping(app, ', ,')).status).toBe(429);

      // Esgotar o balde do socket não tranca quem chega com IP real anexado.
      expect((await ping(app, '203.0.113.9')).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('hops=0: cabeçalho forjado é ignorado por completo, inclusive IPv6 e lixo', async () => {
    const app = await createApp(0);
    try {
      expect(await statuses(app, ['2001:db8::1', 'lixo'])).toEqual([200, 200]);
      expect((await ping(app, '::ffff:203.0.113.9')).status).toBe(429);
      expect((await ping(app)).status).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('hops=2 (Cloudflare + nginx): a chave é a segunda entrada da direita; hops=1 chaveia no IP da borda', async () => {
    const twoHops = await createApp(2);
    try {
      // Cliente real 203.0.113.9; 172.70.0.1 = borda Cloudflare anexada pelo nginx.
      const header = 'forjado, 203.0.113.9, 172.70.0.1';
      expect(await statuses(twoHops, [header, header])).toEqual([200, 200]);
      expect(
        (await ping(twoHops, 'outro, 203.0.113.9, 172.70.0.1')).status,
      ).toBe(429);
      expect((await ping(twoHops, 'x, 203.0.113.10, 172.70.0.1')).status).toBe(
        200,
      );
    } finally {
      await twoHops.close();
    }

    const oneHop = await createApp(1);
    try {
      // Com hops=1 atrás da Cloudflare, todos os visitantes da mesma borda dividem o balde.
      expect(
        await statuses(oneHop, [
          'a, 203.0.113.9, 172.70.0.1',
          'b, 203.0.113.10, 172.70.0.1',
          'c, 203.0.113.11, 172.70.0.1',
        ]),
      ).toEqual([200, 200, 429]);
    } finally {
      await oneHop.close();
    }
  });
});
