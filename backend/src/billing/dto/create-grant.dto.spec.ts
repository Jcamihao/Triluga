import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGrantDto } from './create-grant.dto';

const check = (body: object) =>
  validate(plainToInstance(CreateGrantDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('CreateGrantDto', () => {
  const base = { email: 'a@b.com', plan: 'FLEET' };

  it('aceita sem endsAt e com ISO válido', async () => {
    expect(await check(base)).toHaveLength(0);
    expect(
      await check({ ...base, endsAt: '2099-12-01T00:00:00.000Z' }),
    ).toHaveLength(0);
  });

  it('recusa data inexistente (31 de fevereiro) e texto', async () => {
    expect(await check({ ...base, endsAt: '2099-02-31' })).not.toHaveLength(0);
    expect(await check({ ...base, endsAt: 'amanhã' })).not.toHaveLength(0);
  });

  it('recusa plano FREE e e-mail inválido', async () => {
    expect(await check({ ...base, plan: 'FREE' })).not.toHaveLength(0);
    expect(await check({ ...base, email: 'x' })).not.toHaveLength(0);
  });
});
