/**
 * Formata uma data só-dia (ex.: '2026-11-14' ou '2026-11-14T00:00:00.000Z')
 * como DD/MM/AAAA. Usa UTC: o backend grava datas só-dia como meia-noite UTC,
 * e no fuso local do Brasil isso mostraria o dia anterior. Nunca lança.
 */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return '';
  }
}
