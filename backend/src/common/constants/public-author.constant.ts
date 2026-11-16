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

/**
 * Campos do dono do anúncio (owner) que podem sair em endpoints PÚBLICOS.
 * `phone` é exposição intencional (contato do dono no detalhe do anúncio),
 * não removê-lo sem decisão de produto. Nunca incluir: email, passwordHash,
 * refreshTokenHash, emailVerificationToken, tokenVersion, documentNumber (CPF),
 * addressLine, driverLicenseNumber.
 * Defesa em profundidade: o mapper (`mapOwnerSummary`/`mapVehicleSummary`) já
 * reduzia a resposta a estes campos antes deste select existir; o select evita
 * que o restante do User/Profile chegue à memória do processo.
 */
export const PUBLIC_OWNER_SELECT = {
  id: true,
  profile: {
    select: {
      fullName: true,
      avatarUrl: true,
      city: true,
      state: true,
      phone: true,
    },
  },
  userReviewsReceived: {
    select: {
      rating: true,
    },
  },
} as const;
