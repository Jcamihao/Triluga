/**
 * Diz se o Swagger (/api/docs) deve ser montado. Só liga com SWAGGER_ENABLED=true
 * explícito (sem diferenciar maiúsculas e ignorando espaços nas pontas).
 *
 * Padrão desligado (fail closed): o container de produção não define NODE_ENV,
 * então NODE_ENV não serve de critério. Qualquer outro valor (vazio, "1", "yes",
 * lixo) mantém o Swagger desligado.
 */
export function isSwaggerEnabled(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }

  return raw.trim().toLowerCase() === 'true';
}
