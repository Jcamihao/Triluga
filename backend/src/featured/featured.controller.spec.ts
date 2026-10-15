import 'reflect-metadata';
import { FeaturedController } from './featured.controller';

describe('FeaturedController', () => {
  it('webhook do Asaas responde 200 (o padrão do @Post seria 201)', () => {
    const httpCode = Reflect.getMetadata(
      '__httpCode__',
      FeaturedController.prototype.handleAsaasWebhook,
    );
    expect(httpCode).toBe(200);
  });
});
