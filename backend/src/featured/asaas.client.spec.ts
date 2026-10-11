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
