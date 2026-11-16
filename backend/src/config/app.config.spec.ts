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
