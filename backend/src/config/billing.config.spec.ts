import { billingConfig } from './billing.config';

describe('billingConfig', () => {
  const original = process.env.BILLING_ENABLED;

  afterEach(() => {
    if (original === undefined) delete process.env.BILLING_ENABLED;
    else process.env.BILLING_ENABLED = original;
  });

  it('liga somente com exatamente "true"', () => {
    process.env.BILLING_ENABLED = 'true';
    expect(billingConfig().enabled).toBe(true);
  });

  it('fica desligado quando a variável está ausente', () => {
    delete process.env.BILLING_ENABLED;
    expect(billingConfig().enabled).toBe(false);
  });

  it('fica desligado com "false"', () => {
    process.env.BILLING_ENABLED = 'false';
    expect(billingConfig().enabled).toBe(false);
  });

  it('fica desligado com "TRUE " (sem normalizar)', () => {
    process.env.BILLING_ENABLED = 'TRUE ';
    expect(billingConfig().enabled).toBe(false);
  });

  it('fica desligado com "1" e "yes"', () => {
    process.env.BILLING_ENABLED = '1';
    expect(billingConfig().enabled).toBe(false);
    process.env.BILLING_ENABLED = 'yes';
    expect(billingConfig().enabled).toBe(false);
  });
});
