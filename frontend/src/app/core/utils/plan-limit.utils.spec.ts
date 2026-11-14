import { isPlanLimitError } from './plan-limit.utils';

describe('isPlanLimitError', () => {
  it('true para 403 com code PLAN_LIMIT', () => {
    expect(isPlanLimitError({ status: 403, error: { code: 'PLAN_LIMIT', message: 'x' } })).toBeTrue();
  });

  it('true para objeto sem status mas com code PLAN_LIMIT', () => {
    expect(isPlanLimitError({ error: { code: 'PLAN_LIMIT' } })).toBeTrue();
  });

  it('false para 403 sem código', () => {
    expect(isPlanLimitError({ status: 403, error: { message: 'proibido' } })).toBeFalse();
  });

  it('false para 400 mesmo com code PLAN_LIMIT', () => {
    expect(isPlanLimitError({ status: 400, error: { code: 'PLAN_LIMIT' } })).toBeFalse();
  });

  it('false para null, undefined, string e objeto sem error', () => {
    expect(isPlanLimitError(null)).toBeFalse();
    expect(isPlanLimitError(undefined)).toBeFalse();
    expect(isPlanLimitError('PLAN_LIMIT')).toBeFalse();
    expect(isPlanLimitError({ status: 403 })).toBeFalse();
  });
});
