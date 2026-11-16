/**
 * Campos do autor (User + Profile) que podem sair em endpoints PÚBLICOS.
 * Nunca incluir: email, passwordHash, refreshTokenHash, emailVerificationToken,
 * tokenVersion, telefone, documentNumber (CPF), addressLine, endereço, tokens.
 * Usar sempre este select em vez de `include: { profile: true }` em respostas públicas.
 */
export const PUBLIC_AUTHOR_SELECT = {
  id: true,
  profile: {
    select: {
      fullName: true,
      avatarUrl: true,
    },
  },
} as const;
