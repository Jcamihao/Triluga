import { Controller, Get, INestApplication } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { requestContextMiddleware } from './request-context.middleware';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

function fakeLogger() {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// Mesma ordem do main.ts: o middleware é o primeiro app.use depois do prefixo.
async function createApp(logger: ReturnType<typeof fakeLogger>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.use(requestContextMiddleware(logger));
  await app.init();
  return app;
}

function allLogText(logger: ReturnType<typeof fakeLogger>): string {
  return [logger.log, logger.warn, logger.error]
    .flatMap((fn) => fn.mock.calls)
    .map((args) => args.join(' '))
    .join('\n');
}

describe('requestContextMiddleware (integração com supertest)', () => {
  it('ecoa no response o x-request-id válido do cliente e o loga', async () => {
    const logger = fakeLogger();
    const app = await createApp(logger);
    try {
      const res = await request(app.getHttpServer())
        .get('/ping')
        .set('x-request-id', 'abc12345-ok_1.2');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe('abc12345-ok_1.2');
      expect(allLogText(logger)).toContain('requestId=abc12345-ok_1.2');
    } finally {
      await app.close();
    }
  });

  it('sem header, gera um UUID e devolve no response', async () => {
    const logger = fakeLogger();
    const app = await createApp(logger);
    try {
      const res = await request(app.getHttpServer()).get('/ping');

      expect(res.headers['x-request-id']).toMatch(UUID_PATTERN);
    } finally {
      await app.close();
    }
  });

  it.each([
    ['espaço no meio', 'abc 12345'],
    ['percent-encoded de LF', 'abc%0a12345 forjado'],
    ['fingir linha de log', 'abc%0arequest_completed status=200'],
    ['unicode', 'çãoabcdefgh'],
    ['curto demais', 'abc'],
    ['longo demais', 'a'.repeat(65)],
  ])(
    'header inválido (%s) não é ecoado e não aparece no log',
    async (_label, malicious) => {
      const logger = fakeLogger();
      const app = await createApp(logger);
      try {
        const res = await request(app.getHttpServer())
          .get('/ping')
          .set('x-request-id', malicious);

        expect(res.status).toBe(200);
        expect(res.headers['x-request-id']).toMatch(UUID_PATTERN);
        expect(res.headers['x-request-id']).not.toBe(malicious);
        expect(allLogText(logger)).not.toContain(malicious);
      } finally {
        await app.close();
      }
    },
  );

  it('controle de linha e ANSI (que o cliente HTTP não envia) são rejeitados e não vão para o log', () => {
    const logger = fakeLogger();
    const middleware = requestContextMiddleware(logger);
    const malicious = [
      'abc12345\r\nrequest_completed status=200 userId=admin',
      '\u001b[31mabc12345\u001b[0m',
    ];

    for (const value of malicious) {
      const headers: Record<string, string> = { 'x-request-id': value };
      const res = {
        setHeader: jest.fn(),
        on: jest.fn(),
        statusCode: 200,
      };
      const req = {
        header: (name: string) => headers[name.toLowerCase()],
        method: 'GET',
        originalUrl: '/ping',
        url: '/ping',
      };
      const next = jest.fn();

      middleware(req as never, res as never, next);

      const echoed = res.setHeader.mock.calls[0][1] as string;
      expect(echoed).toMatch(UUID_PATTERN);
      expect(next).toHaveBeenCalledTimes(1);
    }

    expect(allLogText(logger)).not.toContain('userId=admin');
    expect(allLogText(logger)).not.toContain('\u001b');
    expect(allLogText(logger)).not.toContain('\r');
  });
});

describe('requestContextMiddleware (contexto e logs)', () => {
  function run(options: {
    status?: number;
    user?: { sub: string };
    originalUrl?: string;
    url?: string;
    header?: string;
  }) {
    const logger = fakeLogger();
    const middleware = requestContextMiddleware(logger);
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: options.status ?? 200,
    });
    const req: Record<string, unknown> = {
      header: () => options.header,
      method: 'GET',
      originalUrl: options.originalUrl ?? '/api/v1/ping?x=1',
      url: options.url ?? '/ping?x=1',
      user: options.user,
    };
    const next = jest.fn();

    middleware(req as never, res as never, next);
    res.emit('finish');

    return { logger, req, res, next };
  }

  it('guarda requestId e startedAt no request, devolve o header e segue a cadeia', () => {
    const { req, res, next } = run({ header: 'abc12345-ok' });

    expect(req.requestId).toBe('abc12345-ok');
    expect(typeof req.startedAt).toBe('number');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc12345-ok');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('loga o início com requestId, método e a URL original (não a url cortada do roteador)', () => {
    const { logger } = run({ header: 'abc12345-ok' });

    expect(logger.log.mock.calls[0][0]).toBe(
      'request_started requestId=abc12345-ok method=GET path=/api/v1/ping?x=1',
    );
  });

  it('loga o fim com status, duração, usuário anônimo e a URL original', () => {
    const { logger } = run({ header: 'abc12345-ok', status: 200 });

    const line = logger.log.mock.calls[1][0] as string;
    expect(line).toMatch(
      /^request_completed requestId=abc12345-ok method=GET path=\/api\/v1\/ping\?x=1 status=200 durationMs=\d+ userId=anonymous$/,
    );
  });

  it('usa o id do usuário autenticado no log de fim', () => {
    const { logger } = run({ user: { sub: 'user-42' } });

    expect(logger.log.mock.calls[1][0]).toContain('userId=user-42');
  });

  it.each([
    [200, 'log'],
    [399, 'log'],
    [400, 'warn'],
    [499, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ] as const)('status %d usa logger.%s no fim', (status, level) => {
    const { logger } = run({ status });

    const completed = (['log', 'warn', 'error'] as const).filter((name) =>
      logger[name].mock.calls.some((args) =>
        String(args[0]).startsWith('request_completed'),
      ),
    );
    expect(completed).toEqual([level]);
  });
});
