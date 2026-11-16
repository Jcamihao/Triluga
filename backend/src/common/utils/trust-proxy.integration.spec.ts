import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';

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

// Mesma sequência do main.ts: app.set('trust proxy', hops) antes do init.
async function createApp(hops: number): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [TrustProxyTestModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', hops);
  await app.init();
  return app;
}

function ping(app: NestExpressApplication, forwardedFor: string) {
  return request(app.getHttpServer())
    .get('/ping')
    .set('X-Forwarded-For', forwardedFor);
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
