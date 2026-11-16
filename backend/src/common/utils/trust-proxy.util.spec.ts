import { parseTrustProxyHops } from './trust-proxy.util';

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
  ])('lança erro para valor inválido %j', (raw) => {
    expect(() => parseTrustProxyHops(raw)).toThrow(Error);
    expect(() => parseTrustProxyHops(raw)).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => parseTrustProxyHops(raw)).toThrow(raw);
  });

  it('nunca devolve true nem string', () => {
    const result: unknown = parseTrustProxyHops('1');
    expect(typeof result).toBe('number');
  });
});
