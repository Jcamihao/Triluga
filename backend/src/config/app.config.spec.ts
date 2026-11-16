describe('appConfig.trustProxyHops', () => {
  const original = process.env.TRUST_PROXY_HOPS;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.TRUST_PROXY_HOPS;
    } else {
      process.env.TRUST_PROXY_HOPS = original;
    }
    jest.resetModules();
  });

  function load() {
    let appConfig: typeof import('./app.config').appConfig;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      appConfig = require('./app.config').appConfig;
    });
    return appConfig!;
  }

  it('sem a variável, vale 0', () => {
    delete process.env.TRUST_PROXY_HOPS;
    expect(load()().trustProxyHops).toBe(0);
  });

  it('variável vazia vale 0', () => {
    process.env.TRUST_PROXY_HOPS = '';
    expect(load()().trustProxyHops).toBe(0);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['3', 3],
  ])('TRUST_PROXY_HOPS=%s vira o número %d', (raw, expected) => {
    process.env.TRUST_PROXY_HOPS = raw;
    expect(load()().trustProxyHops).toBe(expected);
  });

  it.each(['abc', '6', '-1', 'true'])(
    'TRUST_PROXY_HOPS=%s derruba a leitura da config (boot falha)',
    (raw) => {
      process.env.TRUST_PROXY_HOPS = raw;
      expect(() => load()()).toThrow(/TRUST_PROXY_HOPS/);
    },
  );
});

describe('appConfig.swaggerEnabled', () => {
  const original = process.env.SWAGGER_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SWAGGER_ENABLED;
    } else {
      process.env.SWAGGER_ENABLED = original;
    }
    jest.resetModules();
  });

  function load() {
    let appConfig: typeof import('./app.config').appConfig;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      appConfig = require('./app.config').appConfig;
    });
    return appConfig!;
  }

  it('sem a variável, fica desligado (fail closed)', () => {
    delete process.env.SWAGGER_ENABLED;
    expect(load()().swaggerEnabled).toBe(false);
  });

  it('NODE_ENV=development sozinho não liga o Swagger', () => {
    delete process.env.SWAGGER_ENABLED;
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      expect(load()().swaggerEnabled).toBe(false);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['false', false],
    ['1', false],
    ['yes', false],
    ['', false],
  ])('SWAGGER_ENABLED=%j vira %s', (raw, expected) => {
    process.env.SWAGGER_ENABLED = raw;
    expect(load()().swaggerEnabled).toBe(expected);
  });
});
