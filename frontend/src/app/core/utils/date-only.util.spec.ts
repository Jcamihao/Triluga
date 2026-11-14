import { formatDateOnly } from './date-only.util';

describe('formatDateOnly', () => {
  it('formata meia-noite UTC sem voltar um dia (fuso Brasil)', () => {
    expect(formatDateOnly('2026-11-14T00:00:00.000Z')).toBe('14/11/2026');
  });

  it('formata data só-dia ISO', () => {
    expect(formatDateOnly('2026-11-14')).toBe('14/11/2026');
  });

  it('retorna string vazia para null, undefined ou inválido', () => {
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly(undefined)).toBe('');
    expect(formatDateOnly('não é data')).toBe('');
  });
});
