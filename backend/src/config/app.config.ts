import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  platformFeeRate: parseFloat(process.env.PLATFORM_FEE_RATE ?? '0.12'),
}));
