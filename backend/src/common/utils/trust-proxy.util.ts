const TRUST_PROXY_HOPS_PATTERN = /^[0-5]$/;

/**
 * Lê TRUST_PROXY_HOPS e devolve quantos proxies à frente da API são confiáveis.
 *
 * - 0: API exposta direto (sem proxy). req.ip é o IP do socket.
 * - 1: API atrás de um proxy (ex.: nginx). req.ip é o IP real anexado pelo proxy.
 *
 * Só aceita inteiro de 0 a 5. Qualquer outro valor lança erro: derrubar o boot
 * é melhor que ignorar a config e deixar o throttler contar todo mundo no mesmo balde.
 */
export function parseTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined) {
    return 0;
  }

  const value = raw.trim();

  if (value === '') {
    return 0;
  }

  if (!TRUST_PROXY_HOPS_PATTERN.test(value)) {
    throw new Error(
      `TRUST_PROXY_HOPS inválido: ${JSON.stringify(raw)}. Use um inteiro de 0 a 5 (0 = exposto direto, 1 = atrás de um proxy).`,
    );
  }

  return Number(value);
}
