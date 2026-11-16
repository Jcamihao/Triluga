/**
 * Deixa um texto vindo do cliente seguro para entrar em uma linha de log:
 * troca caracteres de controle (quebra de linha, CR, ESC/ANSI, DEL, C1) e os
 * separadores de linha Unicode por "_" e corta em `max` caracteres.
 *
 * Existe porque validadores como o @IsEmail aceitam e-mail com parte local
 * entre aspas contendo quebra de linha ("a\nrequest_completed status=200"@x.com),
 * o que permitia forjar linhas de log.
 */
export function sanitizeForLog(value: unknown, max = 200): string {
  return (
    String(value)
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '_')
      .slice(0, max)
  );
}
