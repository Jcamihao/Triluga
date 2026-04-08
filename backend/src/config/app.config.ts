import { registerAs } from '@nestjs/config';

function resolveAppUrl(port: number) {
  const explicitAppUrl = process.env.APP_URL?.trim();

  if (explicitAppUrl) {
    return explicitAppUrl;
  }

  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();

  if (renderExternalUrl) {
    return renderExternalUrl;
  }

  const renderExternalHostname = process.env.RENDER_EXTERNAL_HOSTNAME?.trim();

  if (renderExternalHostname) {
    return `https://${renderExternalHostname}`;
  }

  return `http://localhost:${port}`;
}

export const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  appUrl: resolveAppUrl(parseInt(process.env.PORT ?? '3000', 10)),
  platformFeeRate: parseFloat(process.env.PLATFORM_FEE_RATE ?? '0.12'),
}));
