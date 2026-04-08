import { registerAs } from '@nestjs/config';

export const cacheConfig = registerAs('cache', () => ({
  redisUrl: process.env.REDIS_URL?.trim() || null,
  ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS ?? '300', 10),
}));
