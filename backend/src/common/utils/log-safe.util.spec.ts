import { sanitizeForLog } from './log-safe.util';

describe('sanitizeForLog', () => {
  it('mantém texto comum intacto', () => {
    expect(sanitizeForLog('user@triluga.com')).toBe('user@triluga.com');
  });

  it.each([
    ['LF', '"a\nrequest_completed status=200"@x.com'],
    ['CR', 'a\rb'],
    ['CRLF', 'a\r\nb'],
    ['ESC (ANSI)', 'a\u001b[31mb'],
    ['NUL', 'a\u0000b'],
    ['DEL', 'a\u007fb'],
    ['C1 (NEL)', 'a\u0085b'],
    ['separador de linha Unicode', 'a\u2028b'],
    ['separador de parágrafo Unicode', 'a\u2029b'],
  ])('troca %s por "_"', (_label, raw) => {
    const out = sanitizeForLog(raw);
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    expect(out).toContain('_');
    expect(out).toHaveLength(raw.length);
  });

  it('corta em 200 por padrão e respeita o limite informado', () => {
    expect(sanitizeForLog('a'.repeat(500))).toHaveLength(200);
    expect(sanitizeForLog('a'.repeat(500), 10)).toBe('a'.repeat(10));
  });

  it('aceita valores que não são texto', () => {
    expect(sanitizeForLog(undefined)).toBe('undefined');
    expect(sanitizeForLog(42)).toBe('42');
  });
});
