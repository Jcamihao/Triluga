import { registerAs } from '@nestjs/config';

export const billingConfig = registerAs('billing', () => ({
  enabled: process.env.BILLING_ENABLED === 'true',
}));
