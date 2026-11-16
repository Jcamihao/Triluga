import { randomUUID } from 'crypto';

// Letras, números, ponto, sublinhado e hífen, de 8 a 64 caracteres, sem nada além disso.
// Sem flag m: o $ casa só no fim do texto, então "abc12345\n" não passa.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Escolhe o request id de um request. Aceita o valor do cliente só se for texto
 * que casa exatamente com REQUEST_ID_PATTERN (sem trim: espaço e quebra de linha
 * são rejeitados). Qualquer outra coisa vira um id gerado.
 *
 * O id vai para o log: sem essa validação, um cliente forjava linhas de log
 * (quebra de linha, CR, sequência ANSI) ou inflava o log com valores enormes.
 */
export function resolveRequestId(
  raw: unknown,
  generate: () => string = randomUUID,
): string {
  if (typeof raw === 'string' && REQUEST_ID_PATTERN.test(raw)) {
    return raw;
  }

  return generate();
}
