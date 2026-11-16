import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Module,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { applyTrustProxy } from '../utils/trust-proxy.util';
import { GLOBAL_THROTTLE } from '../constants/throttle-limits.constants';
import { Public } from '../decorators/public.decorator';
import { UserAwareThrottlerGuard } from './user-aware-throttler.guard';

// Guard falso no lugar do JwtAuthGuard: lê "Authorization: Bearer <sub>" e preenche
// req.user. Preenche mesmo em rota @Public (o JwtAuthGuard real não faria isso), para
// provar que o tracker ignora req.user em rota pública por conta própria.
class FakeBearerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      req.user = { sub: header.slice('Bearer '.length) };
    }
    return true;
  }
}

@Controller()
class ProbeController {
  @Get('me')
  me() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }
}

function buildModule(throttle: { ttl: number; limit: number }) {
  @Module({
    imports: [ThrottlerModule.forRoot([throttle])],
    controllers: [ProbeController],
    providers: [
      { provide: APP_GUARD, useClass: FakeBearerAuthGuard },
      { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
    ],
  })
  class ProbeModule {}
  return ProbeModule;
}

// Mesma sequência do main.ts: trust proxy antes do init.
async function createApp(
  throttle: { ttl: number; limit: number } = { ttl: 60000, limit: 2 },
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [buildModule(throttle)],
  }).compile();
  const app = moduleRef.createNestApplication();
  applyTrustProxy(
    app as any,
    new ConfigService({ app: { trustProxyHops: 1 } }),
  );
  await app.init();
  return app;
}

function call(
  app: INestApplication,
  path: '/me' | '/open',
  opts: { ip: string; bearer?: string },
) {
  const req = request(app.getHttpServer())
    .get(path)
    .set('X-Forwarded-For', opts.ip);
  return opts.bearer ? req.set('Authorization', `Bearer ${opts.bearer}`) : req;
}

describe('UserAwareThrottlerGuard (integração)', () => {
  it('(a) autenticado: usuários diferentes atrás do mesmo IP têm baldes separados', async () => {
    const app = await createApp();
    try {
      const ip = '203.0.113.1';
      expect((await call(app, '/me', { ip, bearer: 'user-A' })).status).toBe(
        200,
      );
      expect((await call(app, '/me', { ip, bearer: 'user-A' })).status).toBe(
        200,
      );
      expect((await call(app, '/me', { ip, bearer: 'user-A' })).status).toBe(
        429,
      );

      // Mesmo IP, outro usuário: balde novo.
      expect((await call(app, '/me', { ip, bearer: 'user-B' })).status).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });

  it('(a) autenticado: o mesmo usuário trocando de IP continua no mesmo balde', async () => {
    const app = await createApp();
    try {
      expect(
        (await call(app, '/me', { ip: '203.0.113.1', bearer: 'user-A' }))
          .status,
      ).toBe(200);
      expect(
        (await call(app, '/me', { ip: '203.0.113.2', bearer: 'user-A' }))
          .status,
      ).toBe(200);
      expect(
        (await call(app, '/me', { ip: '203.0.113.3', bearer: 'user-A' }))
          .status,
      ).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('(b) @Public: Bearers de usuários diferentes do mesmo IP dividem o MESMO balde (anti-contorno)', async () => {
    const app = await createApp();
    try {
      const ip = '203.0.113.5';
      expect((await call(app, '/open', { ip, bearer: 'user-A' })).status).toBe(
        200,
      );
      expect((await call(app, '/open', { ip, bearer: 'user-B' })).status).toBe(
        200,
      );
      // Terceira conta no mesmo IP: estoura, mesmo sendo outro sub.
      expect((await call(app, '/open', { ip, bearer: 'user-C' })).status).toBe(
        429,
      );
    } finally {
      await app.close();
    }
  });

  it('(c) @Public sem token: conta por IP', async () => {
    const app = await createApp();
    try {
      expect((await call(app, '/open', { ip: '203.0.113.7' })).status).toBe(
        200,
      );
      expect((await call(app, '/open', { ip: '203.0.113.7' })).status).toBe(
        200,
      );
      expect((await call(app, '/open', { ip: '203.0.113.7' })).status).toBe(
        429,
      );

      expect((await call(app, '/open', { ip: '203.0.113.8' })).status).toBe(
        200,
      );
    } finally {
      await app.close();
    }
  });

  it('(d) GLOBAL_THROTTLE de produção: 120 passam e a 121ª dá 429', async () => {
    const app = await createApp(GLOBAL_THROTTLE);
    try {
      const ip = '203.0.113.9';
      for (let i = 0; i < 120; i++) {
        expect((await call(app, '/me', { ip, bearer: 'user-A' })).status).toBe(
          200,
        );
      }
      expect((await call(app, '/me', { ip, bearer: 'user-A' })).status).toBe(
        429,
      );
    } finally {
      await app.close();
    }
  });

  it('(d) GLOBAL_THROTTLE é 60000 ms / 120 e é o valor usado no AppModule', () => {
    expect(GLOBAL_THROTTLE).toEqual({ ttl: 60000, limit: 120 });

    // O AppModule registra o ThrottlerModule com a própria constante. Lê os
    // imports do metadata sem instanciar (instanciar exige banco).
    const imports: any[] = Reflect.getMetadata('imports', AppModule);
    const throttlerModule = imports.find(
      (m) => m && m.module && m.module.name === 'ThrottlerModule',
    );
    expect(throttlerModule).toBeDefined();
    const options = throttlerModule.providers.find(
      (p: any) => p.useValue !== undefined,
    ).useValue;
    expect(options).toEqual([GLOBAL_THROTTLE]);
  });
});
