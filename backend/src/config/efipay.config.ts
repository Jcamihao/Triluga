import { registerAs } from '@nestjs/config';

export const efipayConfig = registerAs('efipay', () => ({
  clientId: process.env.EFIPAY_CLIENT_ID ?? '',
  clientSecret: process.env.EFIPAY_CLIENT_SECRET ?? '',
  certificate: process.env.EFIPAY_CERTIFICATE_PATH ?? '',
  sandbox: process.env.EFIPAY_SANDBOX !== 'false',
  pixKey: process.env.EFIPAY_PIX_KEY ?? 'triluga@empresa.com.br',
  webhookToken: process.env.EFIPAY_WEBHOOK_TOKEN ?? '',
}));
