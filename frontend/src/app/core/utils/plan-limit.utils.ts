/**
 * Indica se o erro HTTP é o bloqueio de limite de anúncios do plano
 * (403 com code PLAN_LIMIT). Nunca lança.
 */
export function isPlanLimitError(error: unknown): boolean {
  try {
    if (!error || typeof error !== 'object') return false;
    const { status, error: body } = error as { status?: unknown; error?: unknown };
    if (status !== undefined && status !== 403) return false;
    if (!body || typeof body !== 'object') return false;
    return (body as { code?: unknown }).code === 'PLAN_LIMIT';
  } catch {
    return false;
  }
}
