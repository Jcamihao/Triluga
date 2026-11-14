import * as http from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { AsaasClient, AsaasClientError } from './asaas.client';

function makeClient(apiKey = 'key') {
  const config = {
    get: jest.fn((key: string) =>
      key === 'asaas.apiKey' ? apiKey : undefined,
    ),
  } as unknown as ConfigService;
  const client = new AsaasClient(config);
  const perform = jest.spyOn(
    client as unknown as { performRequest: () => Promise<unknown> },
    'performRequest',
  );
  jest
    .spyOn(client as unknown as { delay: () => Promise<void> }, 'delay')
    .mockResolvedValue(undefined);
  return { client, perform };
}

const ok = (body: unknown) => ({
  statusCode: 200,
  body: JSON.stringify(body),
});

describe('AsaasClient', () => {
  it('isConfigured returns false when apiKey is empty', () => {
    expect(makeClient('').client.isConfigured()).toBe(false);
  });

  it('isConfigured returns true when apiKey is set', () => {
    expect(makeClient('abc').client.isConfigured()).toBe(true);
  });

  it('createPixPayment sends POST /payments with billingType PIX and the order externalReference', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(
      ok({ id: 'pay_1', value: 29.9, status: 'PENDING', extra: 'x' }),
    );

    const result = await client.createPixPayment({
      customer: 'cus_1',
      value: 29.9,
      dueDate: '2026-10-12',
      description: 'Destaque 7 dias',
      externalReference: 'order-1',
    });

    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledWith('POST', '/payments', {
      customer: 'cus_1',
      billingType: 'PIX',
      value: 29.9,
      dueDate: '2026-10-12',
      description: 'Destaque 7 dias',
      externalReference: 'order-1',
    });
    expect(result).toEqual({ id: 'pay_1', value: 29.9, status: 'PENDING' });
  });

  it('createCustomer sends POST /customers', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(ok({ id: 'cus_1', name: 'Ana' }));

    const result = await client.createCustomer({
      name: 'Ana',
      cpfCnpj: '12345678909',
      email: 'ana@example.com',
      externalReference: 'user-1',
    });

    expect(perform).toHaveBeenCalledWith('POST', '/customers', {
      name: 'Ana',
      cpfCnpj: '12345678909',
      email: 'ana@example.com',
      externalReference: 'user-1',
      notificationDisabled: true,
    });
    expect(result).toEqual({ id: 'cus_1' });
  });

  it('getPixQrCode calls GET /payments/{id}/pixQrCode', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(
      ok({ encodedImage: 'img', payload: 'pix', expirationDate: '2026-10-12' }),
    );

    const result = await client.getPixQrCode('pay_1');

    expect(perform).toHaveBeenCalledWith(
      'GET',
      '/payments/pay_1/pixQrCode',
      undefined,
    );
    expect(result).toEqual({
      encodedImage: 'img',
      payload: 'pix',
      expirationDate: '2026-10-12',
    });
  });

  it('findCustomerByExternalReference returns null when data is empty, first item otherwise', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValueOnce(ok({ data: [] }));
    expect(await client.findCustomerByExternalReference('u 1')).toBeNull();
    expect(perform).toHaveBeenLastCalledWith(
      'GET',
      '/customers?externalReference=u+1',
      undefined,
    );

    perform.mockResolvedValueOnce(
      ok({ data: [{ id: 'cus_1' }, { id: 'cus_2' }] }),
    );
    expect(await client.findCustomerByExternalReference('u1')).toEqual({
      id: 'cus_1',
    });
  });

  it('getPaymentStatus calls GET /payments/{id} and maps status and deleted', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(
      ok({ id: 'pay_1', status: 'RECEIVED', deleted: false, value: 29.9 }),
    );

    const result = await client.getPaymentStatus('pay_1');

    expect(perform).toHaveBeenCalledWith('GET', '/payments/pay_1', undefined);
    expect(result).toEqual({ status: 'RECEIVED', deleted: false });
  });

  it('getPaymentStatus reports deleted true and defaults deleted to false when absent', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValueOnce(
      ok({ id: 'pay_1', status: 'PENDING', deleted: true }),
    );
    expect(await client.getPaymentStatus('pay_1')).toEqual({
      status: 'PENDING',
      deleted: true,
    });

    perform.mockResolvedValueOnce(ok({ id: 'pay_1', status: 'PENDING' }));
    expect(await client.getPaymentStatus('pay_1')).toEqual({
      status: 'PENDING',
      deleted: false,
    });
  });

  it('getPaymentStatus retries on 5xx like any GET', async () => {
    const { client, perform } = makeClient();
    perform
      .mockResolvedValueOnce({ statusCode: 500, body: '' })
      .mockResolvedValueOnce(ok({ status: 'PENDING' }));

    expect(await client.getPaymentStatus('pay_1')).toEqual({
      status: 'PENDING',
      deleted: false,
    });
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it('deletePayment calls DELETE /payments/{id}', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(ok({ deleted: true, id: 'pay_1' }));

    await client.deletePayment('pay_1');

    expect(perform).toHaveBeenCalledWith(
      'DELETE',
      '/payments/pay_1',
      undefined,
    );
  });

  it('GET retries on 5xx up to 3 attempts then throws AsaasClientError with statusCode', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue({ statusCode: 500, body: 'boom' });

    const error = await client.getPixQrCode('pay_1').catch((e: unknown) => e);

    expect(perform).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(AsaasClientError);
    expect((error as AsaasClientError).statusCode).toBe(500);
  });

  it('GET retries on network error and succeeds', async () => {
    const { client, perform } = makeClient();
    perform
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(ok({ data: [] }));

    expect(await client.findCustomerByExternalReference('u1')).toBeNull();
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it('DELETE retries on 5xx', async () => {
    const { client, perform } = makeClient();
    perform
      .mockResolvedValueOnce({ statusCode: 503, body: '' })
      .mockResolvedValueOnce(ok({ deleted: true }));

    await client.deletePayment('pay_1');

    expect(perform).toHaveBeenCalledTimes(2);
  });

  it('POST does not retry on 5xx or network error', async () => {
    const { client, perform } = makeClient();
    const payment = {
      customer: 'cus_1',
      value: 29.9,
      dueDate: '2026-10-12',
      description: 'd',
      externalReference: 'order-1',
    };

    perform.mockResolvedValue({ statusCode: 500, body: 'boom' });
    const e1 = await client.createPixPayment(payment).catch((e: unknown) => e);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(e1).toBeInstanceOf(AsaasClientError);
    expect((e1 as AsaasClientError).statusCode).toBe(500);

    perform.mockReset();
    perform.mockRejectedValue(new Error('timeout'));
    const e2 = await client.createPixPayment(payment).catch((e: unknown) => e);
    expect(perform).toHaveBeenCalledTimes(1);
    expect(e2).toBeInstanceOf(AsaasClientError);
    expect((e2 as AsaasClientError).statusCode).toBeUndefined();
  });

  it('4xx is never retried and exposes statusCode', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue({ statusCode: 400, body: '{"errors":[]}' });

    const error = await client.getPixQrCode('pay_1').catch((e: unknown) => e);

    expect(perform).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(AsaasClientError);
    expect((error as AsaasClientError).statusCode).toBe(400);
  });
});

describe('AsaasClient HTTP headers', () => {
  let server: http.Server;
  let seenHeaders: http.IncomingHttpHeaders[];
  let baseUrl: string;

  beforeAll(async () => {
    seenHeaders = [];
    server = http.createServer((req, res) => {
      seenHeaders.push(req.headers);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ id: 'cus_1', data: [] }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('sends User-Agent Triluga/<package version> (Node.js) and the access token on GET and POST', async () => {
    const config = {
      get: (key: string) =>
        ({ 'asaas.apiKey': 'key', 'asaas.baseUrl': baseUrl })[key],
    } as unknown as ConfigService;
    const client = new AsaasClient(config);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require('../../package.json');

    await client.findCustomerByExternalReference('user-1');
    await client.createCustomer({
      name: 'Ana',
      cpfCnpj: '12345678909',
      email: 'ana@example.com',
      externalReference: 'user-1',
    });

    expect(seenHeaders).toHaveLength(2);
    for (const headers of seenHeaders) {
      expect(headers['user-agent']).toBe(`Triluga/${version} (Node.js)`);
      expect(headers['user-agent']).toMatch(
        /^Triluga\/\d+\.\d+\.\d+ \(Node\.js\)$/,
      );
      expect(headers['access_token']).toBe('key');
    }
  });
});

describe('AsaasClient assinaturas', () => {
  const checkoutParams = {
    value: 19.9,
    cycle: 'MONTHLY' as const,
    itemName: 'Plano Individual',
    itemDescription: 'Assinatura mensal',
    externalReference: 'user-1',
    successUrl: 'https://app.example/ok',
    cancelUrl: 'https://app.example/cancel',
    expiredUrl: 'https://app.example/expired',
    minutesToExpire: 30,
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('createCheckout sends POST /checkouts with exact body, no customerData and no subscription.value', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T01:30:00Z'));
    const { client, perform } = makeClient();
    perform.mockResolvedValue(ok({ id: 'chk_1', link: 'https://pay/x' }));

    await client.createCheckout(checkoutParams);

    expect(perform).toHaveBeenCalledTimes(1);
    const [method, path, body] = perform.mock.calls[0] as unknown[];
    expect(method).toBe('POST');
    expect(path).toBe('/checkouts');
    expect(body).toEqual({
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['RECURRENT'],
      minutesToExpire: 30,
      externalReference: 'user-1',
      callback: {
        successUrl: 'https://app.example/ok',
        cancelUrl: 'https://app.example/cancel',
        expiredUrl: 'https://app.example/expired',
      },
      items: [
        {
          name: 'Plano Individual',
          description: 'Assinatura mensal',
          quantity: 1,
          value: 19.9,
        },
      ],
      subscription: { cycle: 'MONTHLY', nextDueDate: '2026-11-13' },
    });
    const sent = body as Record<string, unknown>;
    expect(sent).not.toHaveProperty('customerData');
    expect(sent.subscription as Record<string, unknown>).not.toHaveProperty(
      'value',
    );
    expect(sent.billingTypes).toEqual(['CREDIT_CARD']);
    expect(sent.chargeTypes).toEqual(['RECURRENT']);
  });

  it('createCheckout computes nextDueDate in America/Sao_Paulo', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(ok({ id: 'chk_1', link: 'l' }));

    jest.useFakeTimers().setSystemTime(new Date('2026-11-14T01:30:00Z'));
    await client.createCheckout(checkoutParams);
    expect((perform.mock.calls[0] as unknown[])[2]).toMatchObject({
      subscription: { nextDueDate: '2026-11-13' },
    });

    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T12:00:00Z'));
    await client.createCheckout(checkoutParams);
    expect((perform.mock.calls[1] as unknown[])[2]).toMatchObject({
      subscription: { nextDueDate: '2026-11-13' },
    });
  });

  it('createCheckout returns { id, link }', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(
      ok({ id: 'chk_1', link: 'https://pay/x', extra: 'y' }),
    );

    expect(await client.createCheckout(checkoutParams)).toEqual({
      id: 'chk_1',
      link: 'https://pay/x',
    });
  });

  it('getSubscription maps deleted absent to false, true to true, externalReference absent to null', async () => {
    const { client, perform } = makeClient();

    perform.mockResolvedValueOnce(
      ok({ id: 'sub_1', nextDueDate: '2026-11-13', externalReference: 'u1' }),
    );
    expect(await client.getSubscription('sub_1')).toEqual({
      id: 'sub_1',
      deleted: false,
      nextDueDate: '2026-11-13',
      externalReference: 'u1',
    });
    expect(perform).toHaveBeenLastCalledWith(
      'GET',
      '/subscriptions/sub_1',
      undefined,
    );

    perform.mockResolvedValueOnce(
      ok({ id: 'sub_1', deleted: true, nextDueDate: '2026-11-13' }),
    );
    expect(await client.getSubscription('sub_1')).toEqual({
      id: 'sub_1',
      deleted: true,
      nextDueDate: '2026-11-13',
      externalReference: null,
    });
  });

  it('findSubscriptionByExternalReference returns null for empty or absent data', async () => {
    const { client, perform } = makeClient();

    perform.mockResolvedValueOnce(ok({ data: [] }));
    expect(await client.findSubscriptionByExternalReference('u1')).toBeNull();

    perform.mockResolvedValueOnce(ok({}));
    expect(await client.findSubscriptionByExternalReference('u1')).toBeNull();
  });

  it('findSubscriptionByExternalReference maps the first item and urlencodes the reference', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValueOnce(
      ok({
        data: [
          {
            id: 'sub_1',
            nextDueDate: '2026-11-13',
            externalReference: 'a&b=c',
          },
          { id: 'sub_2', nextDueDate: '2026-12-13' },
        ],
      }),
    );

    expect(await client.findSubscriptionByExternalReference('a&b=c d')).toEqual(
      {
        id: 'sub_1',
        deleted: false,
        nextDueDate: '2026-11-13',
        externalReference: 'a&b=c',
      },
    );
    expect(perform).toHaveBeenCalledWith(
      'GET',
      '/subscriptions?externalReference=a%26b%3Dc+d',
      undefined,
    );
  });

  it('deleteSubscription calls DELETE /subscriptions/{id}', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue(ok({ deleted: true, id: 'sub_1' }));

    await client.deleteSubscription('sub_1');

    expect(perform).toHaveBeenCalledWith(
      'DELETE',
      '/subscriptions/sub_1',
      undefined,
    );
  });

  it('POST /checkouts does not retry on 500', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue({ statusCode: 500, body: 'boom' });

    const error = await client
      .createCheckout(checkoutParams)
      .catch((e: unknown) => e);

    expect(perform).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(AsaasClientError);
    expect((error as AsaasClientError).statusCode).toBe(500);
  });

  it('GET /subscriptions/{id} retries on 500', async () => {
    const { client, perform } = makeClient();
    perform
      .mockResolvedValueOnce({ statusCode: 500, body: '' })
      .mockResolvedValueOnce(ok({ id: 'x', nextDueDate: '2026-11-13' }));

    expect((await client.getSubscription('x')).id).toBe('x');
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it('DELETE /subscriptions/{id} retries on 500', async () => {
    const { client, perform } = makeClient();
    perform
      .mockResolvedValueOnce({ statusCode: 500, body: '' })
      .mockResolvedValueOnce(ok({ deleted: true }));

    await client.deleteSubscription('sub_1');
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it('4xx on subscription calls is never retried', async () => {
    const { client, perform } = makeClient();
    perform.mockResolvedValue({ statusCode: 400, body: '{"errors":[]}' });

    const e1 = await client
      .deleteSubscription('sub_1')
      .catch((e: unknown) => e);
    expect(perform).toHaveBeenCalledTimes(1);
    expect((e1 as AsaasClientError).statusCode).toBe(400);

    perform.mockClear();
    const e2 = await client.getSubscription('sub_1').catch((e: unknown) => e);
    expect(perform).toHaveBeenCalledTimes(1);
    expect((e2 as AsaasClientError).statusCode).toBe(400);
  });
});
