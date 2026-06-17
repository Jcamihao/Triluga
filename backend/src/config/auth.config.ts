import { registerAs } from '@nestjs/config';

const INSECURE_ACCESS_DEFAULT = 'triluga_access_secret';
const INSECURE_REFRESH_DEFAULT = 'triluga_refresh_secret';

export const authConfig = registerAs('auth', () => {
  const accessSecret = process.env.JWT_ACCESS_SECRET ?? INSECURE_ACCESS_DEFAULT;
  const refreshSecret =
    process.env.JWT_REFRESH_SECRET ?? INSECURE_REFRESH_DEFAULT;

  if (process.env.NODE_ENV === 'production') {
    if (
      accessSecret === INSECURE_ACCESS_DEFAULT ||
      refreshSecret === INSECURE_REFRESH_DEFAULT
    ) {
      throw new Error(
        'JWT_ACCESS_SECRET e JWT_REFRESH_SECRET precisam ser definidos com valores seguros em produção.',
      );
    }
  }

  return {
    accessSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    refreshCookieName:
      process.env.JWT_REFRESH_COOKIE_NAME ?? 'triluga_refresh_token',
    refreshCookieSecure: process.env.JWT_REFRESH_COOKIE_SECURE === 'true',
    refreshCookieSameSite: process.env.JWT_REFRESH_COOKIE_SAME_SITE ?? 'lax',
  };
});
