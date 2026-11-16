import { isSwaggerEnabled } from './swagger.util';

describe('isSwaggerEnabled', () => {
  it('fica desligado quando a variável não existe', () => {
    expect(isSwaggerEnabled(undefined)).toBe(false);
  });

  it.each([
    [''],
    [' '],
    ['\t'],
    ['1'],
    ['yes'],
    ['on'],
    ['false'],
    ['0'],
    ['truee'],
    ['tru'],
    ['true1'],
    ['t'],
    ['​true'],
    ['true\u0000'],
  ])('desligado para valor %j', (raw) => {
    expect(isSwaggerEnabled(raw)).toBe(false);
  });

  it.each([['true'], ['TRUE'], [' true '], ['True'], ['\ttrue\n']])(
    'ligado só para "true" explícito, valor %j',
    (raw) => {
      expect(isSwaggerEnabled(raw)).toBe(true);
    },
  );
});
