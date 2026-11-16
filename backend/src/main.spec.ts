import { ConfigService } from '@nestjs/config';

// main.ts executa bootstrap() ao ser importado e exige banco via AppModule.
// Aqui o AppModule e o NestFactory são falsos: o que importa é a ordem da fiação.
jest.mock('@nestjs/common', () => ({
  ...jest.requireActual('@nestjs/common'),
  Logger: class LoggerFake {
    log() {}
    warn() {}
    error() {}
  },
}));
jest.mock('./app.module', () => ({ AppModule: class AppModuleFake {} }));
jest.mock('@nestjs/swagger', () => {
  const chain: Record<string, unknown> = {};
  for (const name of [
    'setTitle',
    'setDescription',
    'setVersion',
    'addBearerAuth',
  ]) {
    chain[name] = () => chain;
  }
  chain.build = () => ({});
  return {
    ...jest.requireActual('@nestjs/swagger'),
    DocumentBuilder: function DocumentBuilder() {
      return chain;
    },
    SwaggerModule: {
      createDocument: () => ({}),
      setup: (...args: unknown[]) => mockSwaggerSetup(...args),
    },
  };
});

const mockSwaggerSetup = jest.fn();

const mockCreate = jest.fn();
jest.mock('@nestjs/core', () => ({
  ...jest.requireActual('@nestjs/core'),
  NestFactory: { create: (...args: unknown[]) => mockCreate(...args) },
}));

function buildFakeApp(
  hops: number | undefined,
  calls: string[],
  swaggerEnabled?: unknown,
) {
  const config = new ConfigService({
    app: {
      port: 3999,
      ...(hops === undefined ? {} : { trustProxyHops: hops }),
      ...(swaggerEnabled === undefined ? {} : { swaggerEnabled }),
    },
  });
  const record =
    (name: string, ret?: unknown) =>
    (...args: unknown[]) => {
      calls.push(
        name === 'set' ? `set:${String(args[0])}=${String(args[1])}` : name,
      );
      return ret;
    };
  return {
    get: () => config,
    set: record('set'),
    setGlobalPrefix: record('setGlobalPrefix'),
    use: record('use'),
    enableCors: record('enableCors'),
    useGlobalPipes: record('useGlobalPipes'),
    useGlobalFilters: record('useGlobalFilters'),
    listen: record('listen', Promise.resolve()),
  };
}

async function runMain(hops: number | undefined, swaggerEnabled?: unknown) {
  const calls: string[] = [];
  mockCreate.mockResolvedValue(buildFakeApp(hops, calls, swaggerEnabled));
  await jest.isolateModulesAsync(async () => {
    await import('./main');
  });
  // bootstrap() não é exportado nem aguardado pelo import: espera o listen.
  for (let i = 0; i < 50 && !calls.includes('listen'); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return calls;
}

describe('main.ts: trust proxy', () => {
  it('aplica o trust proxy configurado antes de qualquer middleware, guard ou listen', async () => {
    const calls = await runMain(1);
    const setIndex = calls.indexOf('set:trust proxy=1');
    expect(setIndex).toBeGreaterThanOrEqual(0);
    expect(calls).toContain('listen');
    for (const later of [
      'setGlobalPrefix',
      'use',
      'enableCors',
      'useGlobalPipes',
      'useGlobalFilters',
      'listen',
    ]) {
      expect(setIndex).toBeLessThan(calls.indexOf(later));
    }
    expect(calls.filter((c) => c.startsWith('set:'))).toEqual([
      'set:trust proxy=1',
    ]);
  });

  it('sem trustProxyHops na config, aplica 0', async () => {
    const calls = await runMain(undefined);
    expect(calls).toContain('set:trust proxy=0');
  });
});

describe('main.ts: swagger', () => {
  beforeEach(() => {
    mockSwaggerSetup.mockClear();
  });

  it('com swaggerEnabled=true, monta o Swagger em api/docs', async () => {
    const calls = await runMain(1, true);
    expect(calls).toContain('listen');
    expect(mockSwaggerSetup).toHaveBeenCalledTimes(1);
    expect(mockSwaggerSetup.mock.calls[0][0]).toBe('api/docs');
  });

  it.each([
    ['false', false],
    ['ausente', undefined],
    ['string "true" (não é booleano: fica desligado)', 'true'],
  ])('com swagger %s, não monta o Swagger', async (_label, value) => {
    const calls = await runMain(1, value);
    expect(calls).toContain('listen');
    expect(mockSwaggerSetup).not.toHaveBeenCalled();
  });
});
