import { ConfigService } from '@nestjs/config';
import { applyTrustProxy, parseTrustProxyHops } from './trust-proxy.util';

describe('parseTrustProxyHops', () => {
  it('devolve 0 quando a variável não existe', () => {
    expect(parseTrustProxyHops(undefined)).toBe(0);
  });

  it.each(['', '   ', '\t'])('devolve 0 para valor vazio %j', (raw) => {
    expect(parseTrustProxyHops(raw)).toBe(0);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['5', 5],
    [' 2 ', 2],
    ['\t3\n', 3],
  ])('aceita %j e devolve %d', (raw, expected) => {
    expect(parseTrustProxyHops(raw)).toBe(expected);
  });

  it.each([
    ['abc'],
    ['-1'],
    ['6'],
    ['1.5'],
    ['true'],
    ['1;2'],
    ['0x1'],
    ['1e1'],
    ['07'],
    ['05'],
    ['10'],
    ['203.0.113.1'],
    ['*'],
    ['0 1'],
    ['1\n2'],
    ['1,2'],
    ['+1'],
    ['٣'],
    ['１'],
    ['1\u200b'],
    ['0\u0000'],
    ['false'],
    ['loopback'],
  ])('lança erro para valor inválido %j', (raw) => {
    expect(() => parseTrustProxyHops(raw)).toThrow(Error);
    expect(() => parseTrustProxyHops(raw)).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => parseTrustProxyHops(raw)).toThrow(JSON.stringify(raw));
  });

  it('nunca devolve true nem string', () => {
    const result: unknown = parseTrustProxyHops('1');
    expect(typeof result).toBe('number');
  });
});

describe('applyTrustProxy', () => {
  function fakeApp() {
    return { set: jest.fn() };
  }

  it('aplica o valor configurado em "trust proxy" e o devolve', () => {
    const app = fakeApp();
    const hops = applyTrustProxy(
      app,
      new ConfigService({ app: { trustProxyHops: 2 } }),
    );
    expect(hops).toBe(2);
    expect(app.set).toHaveBeenCalledTimes(1);
    expect(app.set).toHaveBeenCalledWith('trust proxy', 2);
  });

  it('aplica 0 explícito (não confunde com ausente)', () => {
    const app = fakeApp();
    expect(
      applyTrustProxy(app, new ConfigService({ app: { trustProxyHops: 0 } })),
    ).toBe(0);
    expect(app.set).toHaveBeenCalledWith('trust proxy', 0);
  });

  it('sem config, cai em 0 (nunca confia em proxy por omissão)', () => {
    const app = fakeApp();
    expect(applyTrustProxy(app, new ConfigService({}))).toBe(0);
    expect(app.set).toHaveBeenCalledWith('trust proxy', 0);
  });
});
