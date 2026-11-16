import { resolveRequestId } from './request-id.util';

const UUID = '123e4567-e89b-12d3-a456-426614174000';
const GENERATED = 'GERADO-PELO-SERVIDOR';

describe('resolveRequestId', () => {
  it.each([
    ['UUID válido', UUID, true],
    ['8 caracteres (mínimo)', 'abc12345', true],
    ['64 caracteres (máximo)', 'a'.repeat(64), true],
    ['pontos, sublinhados e hífens', 'req.id_2026-11-16', true],
    ['7 caracteres', 'abc1234', false],
    ['65 caracteres', 'a'.repeat(65), false],
    ['espaço no meio', 'abc 12345', false],
    ['espaço à esquerda', ' abc12345', false],
    ['espaço à direita', 'abc12345 ', false],
    ['quebra de linha no meio', 'abc\n12345', false],
    ['quebra de linha no fim', 'abc12345\n', false],
    ['CRLF no fim', 'abc12345\r\n', false],
    ['sequência ANSI', '\u001b[31mabc12345', false],
    ['percent-encoded de LF', '%0aabc12345', false],
    ['percent-encoded no meio', 'abc%0a12345', false],
    ['unicode', 'çãoabcdefgh', false],
    ['array', ['abcdefgh'], false],
    ['número', 12345678, false],
    ['undefined', undefined, false],
    ['string vazia', '', false],
    ['objeto', { id: 'abc12345' }, false],
  ])('%s', (_label, raw, accepted) => {
    const generate = jest.fn(() => GENERATED);

    const result = resolveRequestId(raw, generate);

    if (accepted) {
      expect(result).toBe(raw);
      expect(generate).not.toHaveBeenCalled();
    } else {
      expect(result).toBe(GENERATED);
      expect(generate).toHaveBeenCalledTimes(1);
    }
  });

  it('rejeita qualquer caractere fora da lista permitida, um a um (0 a 255 e separadores Unicode)', () => {
    const allowed = /[A-Za-z0-9._-]/;
    const rejected: string[] = [];
    const candidates = [
      ...Array.from({ length: 256 }, (_, code) => String.fromCharCode(code)),
      '\u2028',
      '\u2029',
      '\u202e',
      '\uff21',
    ];

    for (const ch of candidates) {
      if (allowed.test(ch)) continue;
      for (const value of [`abc${ch}12345`, `${ch}abc12345`, `abc12345${ch}`]) {
        if (resolveRequestId(value, () => GENERATED) !== GENERATED) {
          rejected.push(JSON.stringify(value));
        }
      }
    }

    expect(rejected).toEqual([]);
  });

  it('rejeita o que o Node entrega quando o header vem duplicado (valores unidos por vírgula e espaço)', () => {
    expect(resolveRequestId('abc12345, def67890', () => GENERATED)).toBe(
      GENERATED,
    );
  });

  it('usa randomUUID quando não recebe gerador e o valor é inválido', () => {
    const result = resolveRequestId('abc\n12345');
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('não chama o gerador quando o valor válido é aceito', () => {
    const generate = jest.fn(() => GENERATED);
    expect(resolveRequestId(UUID, generate)).toBe(UUID);
    expect(generate).not.toHaveBeenCalled();
  });
});
