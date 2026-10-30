import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListVehiclesQueryDto } from './list-vehicles-query.dto';

// Mesmas opções do ValidationPipe global (main.ts).
const PIPE_TRANSFORM_OPTIONS = { enableImplicitConversion: true };
const PIPE_VALIDATE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true };

const toDto = (query: Record<string, unknown>) =>
  plainToInstance(ListVehiclesQueryDto, query, PIPE_TRANSFORM_OPTIONS);

describe('ListVehiclesQueryDto (filtros de preço)', () => {
  const priceKeys = ['minDailyRate', 'maxDailyRate', 'minPrice', 'maxPrice'];

  it.each(priceKeys)('%s vazio (?x=) vira undefined, não 0', (key) => {
    const dto = toDto({ [key]: '' });
    expect((dto as any)[key]).toBeUndefined();
  });

  it('query vazia continua válida após o pipe', async () => {
    const dto = toDto({ maxPrice: '', maxDailyRate: '', minPrice: '' });
    expect(await validate(dto, PIPE_VALIDATE_OPTIONS)).toEqual([]);
  });

  it.each(priceKeys)('%s="0" literal continua sendo 0', (key) => {
    const dto = toDto({ [key]: '0' });
    expect((dto as any)[key]).toBe(0);
  });

  it('valores numéricos normais são convertidos', () => {
    const dto = toDto({ minDailyRate: '50.5', maxPrice: '1400' });
    expect(dto.minDailyRate).toBe(50.5);
    expect(dto.maxPrice).toBe(1400);
  });
});
