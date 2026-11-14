import 'reflect-metadata';
import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCheckoutDto } from './create-checkout.dto';

const check = (body: object) =>
  validate(plainToInstance(CreateCheckoutDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

// Mesmas opções do ValidationPipe global de src/main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
});
const meta: ArgumentMetadata = {
  type: 'body',
  metatype: CreateCheckoutDto,
  data: '',
};

describe('CreateCheckoutDto', () => {
  it.each([
    ['PROFESSIONAL', 'MONTHLY'],
    ['PROFESSIONAL', 'YEARLY'],
    ['FLEET', 'MONTHLY'],
    ['FLEET', 'YEARLY'],
  ])('aceita %s/%s', async (plan, interval) => {
    expect(await check({ plan, interval })).toHaveLength(0);
  });

  it.each([
    ['plano FREE', { plan: 'FREE', interval: 'MONTHLY' }],
    ['plano inexistente', { plan: 'ENTERPRISE', interval: 'MONTHLY' }],
    ['plano em minúsculas', { plan: 'fleet', interval: 'MONTHLY' }],
    ['ciclo inválido', { plan: 'FLEET', interval: 'WEEKLY' }],
    ['ciclo em minúsculas', { plan: 'FLEET', interval: 'monthly' }],
    ['sem plano', { interval: 'MONTHLY' }],
    ['sem ciclo', { plan: 'FLEET' }],
    ['corpo vazio', {}],
    ['plano nulo', { plan: null, interval: 'MONTHLY' }],
    ['plano numérico', { plan: 1, interval: 'MONTHLY' }],
  ])('recusa %s (class-validator)', async (_label, body) => {
    expect(await check(body)).not.toHaveLength(0);
  });

  it('recusa campo extra (forbidNonWhitelisted)', async () => {
    expect(
      await check({ plan: 'FLEET', interval: 'MONTHLY', value: 0.01 }),
    ).not.toHaveLength(0);
  });

  describe('com o ValidationPipe da app', () => {
    it('aceita corpo válido e devolve instância do DTO', async () => {
      const result = await pipe.transform(
        { plan: 'FLEET', interval: 'YEARLY' },
        meta,
      );
      expect(result).toBeInstanceOf(CreateCheckoutDto);
      expect(result).toEqual({ plan: 'FLEET', interval: 'YEARLY' });
    });

    it.each([
      ['FREE', { plan: 'FREE', interval: 'MONTHLY' }],
      ['plano inexistente', { plan: 'X', interval: 'MONTHLY' }],
      ['ciclo inválido', { plan: 'FLEET', interval: 'DAILY' }],
      ['corpo vazio', {}],
      ['campo extra', { plan: 'FLEET', interval: 'MONTHLY', price: 1 }],
    ])('rejeita %s com 400', async (_label, body) => {
      await expect(pipe.transform(body, meta)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
