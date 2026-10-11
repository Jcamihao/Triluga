import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasClient, AsaasClientError } from './asaas.client';
import { FeaturedService } from './featured.service';

const USER_ID = 'user-1';
const VEHICLE_ID = 'vehicle-1';
const ORDER_ID = 'order-1';
const MISSING_DOCUMENT_MESSAGE =
  'Complete seu CPF/CNPJ no perfil para pagar o destaque.';
const INVALID_DOCUMENT_MESSAGE =
  'CPF/CNPJ inválido. Corrija no perfil e tente novamente.';
const CANCEL_FAILURE_MESSAGE =
  'Não foi possível cancelar agora. Tente novamente em instantes.';
const PIX_FAILURE_MESSAGE =
  'Não foi possível gerar o PIX agora. Tente novamente em instantes.';

function buildPrisma() {
  const featuredOrder = {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({
      id: ORDER_ID,
      vehicleId: VEHICLE_ID,
      userId: USER_ID,
      planId: '7d',
      status: 'PENDING',
      paymentId: null,
      pixCopiaECola: null,
    }),
    update: jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: ORDER_ID,
        userId: USER_ID,
        status: 'PENDING',
        ...data,
      }),
    ),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    featuredOrder,
  };
  return {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    tx,
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        ownerId: USER_ID,
        isActive: true,
        title: 'Civic 2020',
      }),
    },
    featuredOrder,
    user: {
      findUnique: jest.fn().mockResolvedValue({
        email: 'dono@example.com',
        profile: { fullName: 'Maria Silva', documentNumber: '12345678909' },
      }),
    },
  };
}

function buildAsaas() {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    findCustomerByExternalReference: jest.fn().mockResolvedValue(null),
    createCustomer: jest.fn().mockResolvedValue({ id: 'cus_1' }),
    createPixPayment: jest
      .fn()
      .mockResolvedValue({ id: 'pay_1', value: 29.9, status: 'PENDING' }),
    getPixQrCode: jest.fn().mockResolvedValue({
      encodedImage: 'QUJD',
      payload: '000201pixcopiaecola',
      expirationDate: '2026-10-13 23:59:59',
    }),
    deletePayment: jest.fn().mockResolvedValue(undefined),
  };
}

describe('FeaturedService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let asaas: ReturnType<typeof buildAsaas>;
  let service: FeaturedService;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-11T15:00:00Z') });
    prisma = buildPrisma();
    asaas = buildAsaas();
    const config = { get: jest.fn() } as unknown as ConfigService;
    service = new FeaturedService(
      prisma as unknown as PrismaService,
      asaas as unknown as AsaasClient,
      config,
    );
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('createOrder', () => {
    const dto = { vehicleId: VEHICLE_ID, planId: '7d' as const };

    it('creates PENDING order, asaas customer+payment+qr, and stores paymentId and pixCopiaECola', async () => {
      const result = await service.createOrder(USER_ID, dto);

      expect(prisma.featuredOrder.create).toHaveBeenCalledTimes(1);
      expect(asaas.createPixPayment).toHaveBeenCalledWith({
        customer: 'cus_1',
        value: 29.9,
        dueDate: '2026-10-12',
        description: 'Destaque Triluga — Civic 2020 (7 dias)',
        externalReference: ORDER_ID,
      });
      expect(asaas.getPixQrCode).toHaveBeenCalledWith('pay_1');
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { paymentId: 'pay_1', pixCopiaECola: '000201pixcopiaecola' },
      });
      expect(result.payment.amount).toBe(29.9);
      expect(result.payment.description).toBe(
        'Destaque Triluga — Civic 2020 (7 dias)',
      );
      expect(result.payment.pixCopiaECola).toBe('000201pixcopiaecola');
      expect(result.payment.qrCodeImage).toBe('data:image/png;base64,QUJD');
      expect(result.payment.instructions).toContain(
        'O destaque será ativado automaticamente após a confirmação.',
      );
      expect(result.order.paymentId).toBe('pay_1');
      expect(result.order.pixCopiaECola).toBe('000201pixcopiaecola');
      expect(result.payment).not.toHaveProperty('pixKey');
    });

    it('reuses existing asaas customer', async () => {
      asaas.findCustomerByExternalReference.mockResolvedValue({
        id: 'cus_existing',
      });

      await service.createOrder(USER_ID, dto);

      expect(asaas.findCustomerByExternalReference).toHaveBeenCalledWith(
        USER_ID,
      );
      expect(asaas.createCustomer).not.toHaveBeenCalled();
      expect(asaas.createPixPayment).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_existing' }),
      );
    });

    it('creates one when absent', async () => {
      await service.createOrder(USER_ID, dto);

      expect(asaas.createCustomer).toHaveBeenCalledWith({
        name: 'Maria Silva',
        cpfCnpj: '12345678909',
        email: 'dono@example.com',
        externalReference: USER_ID,
      });
    });

    it('returns 400 when profile has no documentNumber', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'dono@example.com',
        profile: { fullName: 'Maria Silva', documentNumber: null },
      });

      const err = await service.createOrder(USER_ID, dto).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(MISSING_DOCUMENT_MESSAGE);
      expect(prisma.featuredOrder.create).not.toHaveBeenCalled();
      expect(asaas.createPixPayment).not.toHaveBeenCalled();
    });

    it('returns 400 when the user has no profile at all', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'dono@example.com',
        profile: null,
      });

      const err = await service.createOrder(USER_ID, dto).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(MISSING_DOCUMENT_MESSAGE);
      expect(prisma.featuredOrder.create).not.toHaveBeenCalled();
    });

    it('returns 503 when asaas is not configured', async () => {
      asaas.isConfigured.mockReturnValue(false);

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.featuredOrder.create).not.toHaveBeenCalled();
      expect(asaas.createPixPayment).not.toHaveBeenCalled();
    });

    it('rejects vehicle that already has PENDING/ACTIVE order', async () => {
      prisma.featuredOrder.findFirst.mockResolvedValue({ id: 'other-order' });

      const err = await service.createOrder(USER_ID, dto).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(
        'Este veículo já possui um destaque ativo ou pendente de pagamento.',
      );
      expect(prisma.featuredOrder.create).not.toHaveBeenCalled();
    });

    it('rejects foreign vehicle', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        ownerId: 'someone-else',
        isActive: true,
        title: 'Civic 2020',
      });

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.featuredOrder.create).not.toHaveBeenCalled();
    });

    it('cancels the order and throws 503 when asaas fails after creating the order', async () => {
      asaas.createPixPayment.mockRejectedValue(new Error('asaas down'));

      const err = await service.createOrder(USER_ID, dto).catch((e) => e);

      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.message).toBe(PIX_FAILURE_MESSAGE);
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
      // cobrança nunca foi criada: nada para apagar
      expect(asaas.deletePayment).not.toHaveBeenCalled();
    });

    it('deletes the payment and cancels the order when the QR code fails after the payment was created', async () => {
      asaas.getPixQrCode.mockRejectedValue(new Error('qr failed'));

      const err = await service.createOrder(USER_ID, dto).catch((e) => e);

      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.message).toBe(PIX_FAILURE_MESSAGE);
      expect(asaas.deletePayment).toHaveBeenCalledWith('pay_1');
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
    });

    it('cancels the order and throws 503 when the customer step fails', async () => {
      asaas.findCustomerByExternalReference.mockRejectedValue(
        new Error('timeout'),
      );

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
      expect(asaas.deletePayment).not.toHaveBeenCalled();
    });

    it('still throws 503 when deletePayment also fails during rollback', async () => {
      asaas.getPixQrCode.mockRejectedValue(new Error('qr failed'));
      asaas.deletePayment.mockRejectedValue(new Error('delete failed'));

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
    });

    it.each([
      ['2026-10-11T23:30:00Z', '2026-10-12'], // 20:30 em Brasília dia 11
      ['2026-10-12T02:00:00Z', '2026-10-12'], // 23:00 em Brasília ainda dia 11
      ['2026-10-12T03:00:00Z', '2026-10-13'], // 00:00 em Brasília: virou o dia 12
    ])(
      'sends dueDate as tomorrow in Brazil (now=%s -> %s)',
      async (now, due) => {
        jest.setSystemTime(new Date(now));

        await service.createOrder(USER_ID, dto);

        expect(asaas.createPixPayment).toHaveBeenCalledWith(
          expect.objectContaining({ dueDate: due }),
        );
      },
    );

    it('creates the order with the vehicle, plan and price data', async () => {
      await service.createOrder(USER_ID, {
        vehicleId: VEHICLE_ID,
        planId: '30d',
      });

      expect(prisma.tx.featuredOrder.create).toHaveBeenCalledWith({
        data: {
          vehicleId: VEHICLE_ID,
          userId: USER_ID,
          planId: '30d',
          durationDays: 30,
          price: 89.9,
        },
      });
    });

    it('sends a formatted document to asaas as digits only', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'dono@example.com',
        profile: { fullName: 'Maria Silva', documentNumber: '123.456.789-09' },
      });

      await service.createOrder(USER_ID, dto);

      expect(asaas.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ cpfCnpj: '12345678909' }),
      );
    });

    it('returns qrCodeImage null when encodedImage is empty', async () => {
      asaas.getPixQrCode.mockResolvedValue({
        encodedImage: '',
        payload: '000201x',
        expirationDate: '2026-10-13 23:59:59',
      });

      const result = await service.createOrder(USER_ID, dto);

      expect(result.payment.qrCodeImage).toBeNull();
      expect(result.payment.pixCopiaECola).toBe('000201x');
    });

    it('keeps an already data-prefixed encodedImage as is', async () => {
      asaas.getPixQrCode.mockResolvedValue({
        encodedImage: 'data:image/png;base64,QUJD',
        payload: '000201x',
        expirationDate: '2026-10-13 23:59:59',
      });

      const result = await service.createOrder(USER_ID, dto);

      expect(result.payment.qrCodeImage).toBe('data:image/png;base64,QUJD');
    });

    it('rejects an invalid plan with 400', async () => {
      const err = await service
        .createOrder(USER_ID, { vehicleId: VEHICLE_ID, planId: '99d' as never })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('Plano inválido.');
      expect(prisma.vehicle.findUnique).not.toHaveBeenCalled();
    });

    it('returns 404 when the vehicle does not exist', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(null);

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.featuredOrder.create).not.toHaveBeenCalled();
    });

    it('returns 404 when the vehicle is inactive', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        ownerId: USER_ID,
        isActive: false,
        title: 'Civic 2020',
      });

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('takes the per-vehicle advisory lock before checking and creating', async () => {
      await service.createOrder(USER_ID, dto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const lockOrder = prisma.tx.$executeRaw.mock.invocationCallOrder[0];
      const findOrder =
        prisma.tx.featuredOrder.findFirst.mock.invocationCallOrder[0];
      const createOrder =
        prisma.tx.featuredOrder.create.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(findOrder);
      expect(findOrder).toBeLessThan(createOrder);
    });

    it('returns 400 and calls no asaas endpoint when a concurrent request already created a PENDING order', async () => {
      // dentro da transação, sob o lock, o segundo request enxerga o PENDING do primeiro
      prisma.tx.featuredOrder.findFirst.mockResolvedValue({
        id: 'first-order',
        status: 'PENDING',
      });

      const err = await service.createOrder(USER_ID, dto).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(
        'Este veículo já possui um destaque ativo ou pendente de pagamento.',
      );
      expect(prisma.tx.featuredOrder.create).not.toHaveBeenCalled();
      expect(asaas.findCustomerByExternalReference).not.toHaveBeenCalled();
      expect(asaas.createCustomer).not.toHaveBeenCalled();
      expect(asaas.createPixPayment).not.toHaveBeenCalled();
    });

    it('returns 400 and cancels the order when asaas rejects the customer data (4xx)', async () => {
      asaas.createCustomer.mockRejectedValue(
        new AsaasClientError('invalid cpfCnpj', 400),
      );

      const err = await service.createOrder(USER_ID, dto).catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(INVALID_DOCUMENT_MESSAGE);
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
      expect(asaas.createPixPayment).not.toHaveBeenCalled();
    });

    it('keeps 503 when the customer step fails with 401 (our API key), 5xx or a network error', async () => {
      for (const failure of [
        new AsaasClientError('unauthorized', 401),
        new AsaasClientError('boom', 500),
        new Error('ECONNRESET'),
      ]) {
        asaas.createCustomer.mockRejectedValueOnce(failure);
        await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      }
    });

    it('keeps 503 when createPixPayment fails with a 4xx (not a customer-data problem)', async () => {
      asaas.createPixPayment.mockRejectedValue(
        new AsaasClientError('bad request', 400),
      );

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('deletes the payment, cancels the order and throws 503 when the final order update fails', async () => {
      prisma.featuredOrder.update.mockImplementation(({ data }) =>
        data.status === 'CANCELLED'
          ? Promise.resolve({ id: ORDER_ID, ...data })
          : Promise.reject(new Error('db down')),
      );

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(asaas.deletePayment).toHaveBeenCalledWith('pay_1');
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
    });

    it('still throws 503 when the rollback update itself rejects', async () => {
      asaas.createPixPayment.mockRejectedValue(new Error('asaas down'));
      prisma.featuredOrder.update.mockRejectedValue(new Error('db down'));

      await expect(service.createOrder(USER_ID, dto)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    const pendingOrder = {
      id: ORDER_ID,
      userId: USER_ID,
      status: 'PENDING',
      paymentId: 'pay_1',
    };

    beforeEach(() => {
      prisma.featuredOrder.findUnique.mockResolvedValue(pendingOrder);
    });

    it('on PENDING order deletes the asaas payment, cancels with a PENDING guard and returns the re-read order', async () => {
      prisma.featuredOrder.findUnique
        .mockResolvedValueOnce(pendingOrder)
        .mockResolvedValueOnce({ ...pendingOrder, status: 'CANCELLED' });

      const result = await service.cancelOrder(USER_ID, ORDER_ID);

      expect(asaas.deletePayment).toHaveBeenCalledWith('pay_1');
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(result).toEqual(expect.objectContaining({ status: 'CANCELLED' }));
    });

    it('does not call asaas when the order has no paymentId', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        ...pendingOrder,
        paymentId: null,
      });

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalled();
    });

    it('swallows a 404 from deletePayment and still cancels', async () => {
      asaas.deletePayment.mockRejectedValue(
        new AsaasClientError('not found', 404),
      );

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).resolves.toBeDefined();

      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });

    it.each([
      ['5xx', new AsaasClientError('boom', 500)],
      [
        'other 4xx (e.g. already received)',
        new AsaasClientError('cannot delete', 400),
      ],
      ['network error', new Error('ETIMEDOUT')],
    ])(
      'keeps the order PENDING and throws 503 when deletePayment fails with %s',
      async (_label, failure) => {
        asaas.deletePayment.mockRejectedValue(failure);

        const err = await service
          .cancelOrder(USER_ID, ORDER_ID)
          .catch((e) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.message).toBe(CANCEL_FAILURE_MESSAGE);
        expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.update).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
      },
    );

    it('returns 400 when the guarded update matches nothing (webhook activated it in between)', async () => {
      prisma.featuredOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-PENDING orders', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        ...pendingOrder,
        status: 'ACTIVE',
      });

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
    });

    it('rejects foreign orders', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        ...pendingOrder,
        userId: 'someone-else',
      });

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown order', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('cancelStalePendingOrders', () => {
    it('looks for PENDING orders older than 24h', async () => {
      await service.cancelStalePendingOrders();

      expect(prisma.featuredOrder.findMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING',
          createdAt: { lt: new Date('2026-10-10T15:00:00Z') },
        },
        select: { id: true, paymentId: true },
      });
    });

    it('deletes the charge and cancels each stale order, counting them', async () => {
      prisma.featuredOrder.findMany.mockResolvedValue([
        { id: 'o1', paymentId: 'pay_1' },
        { id: 'o2', paymentId: null },
      ]);

      const count = await service.cancelStalePendingOrders();

      expect(count).toBe(2);
      expect(asaas.deletePayment).toHaveBeenCalledTimes(1);
      expect(asaas.deletePayment).toHaveBeenCalledWith('pay_1');
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o1', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o2', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });

    it('skips an order whose charge cannot be deleted (5xx), leaves it PENDING and keeps going', async () => {
      prisma.featuredOrder.findMany.mockResolvedValue([
        { id: 'o1', paymentId: 'pay_1' },
        { id: 'o2', paymentId: 'pay_2' },
      ]);
      asaas.deletePayment.mockImplementation((id: string) =>
        id === 'pay_1'
          ? Promise.reject(new AsaasClientError('boom', 500))
          : Promise.resolve(),
      );

      const count = await service.cancelStalePendingOrders();

      expect(count).toBe(1);
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 'o2', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(warnSpy).toHaveBeenCalled();
    });

    it('cancels an order whose charge is already gone (404)', async () => {
      prisma.featuredOrder.findMany.mockResolvedValue([
        { id: 'o1', paymentId: 'pay_1' },
      ]);
      asaas.deletePayment.mockRejectedValue(new AsaasClientError('nf', 404));

      expect(await service.cancelStalePendingOrders()).toBe(1);
    });

    it('does not count an order that was activated in between (updateMany count 0)', async () => {
      prisma.featuredOrder.findMany.mockResolvedValue([
        { id: 'o1', paymentId: 'pay_1' },
      ]);
      prisma.featuredOrder.updateMany.mockResolvedValue({ count: 0 });

      expect(await service.cancelStalePendingOrders()).toBe(0);
    });

    it('keeps processing when the cancel update throws for one order', async () => {
      prisma.featuredOrder.findMany.mockResolvedValue([
        { id: 'o1', paymentId: null },
        { id: 'o2', paymentId: null },
      ]);
      prisma.featuredOrder.updateMany
        .mockRejectedValueOnce(new Error('db'))
        .mockResolvedValueOnce({ count: 1 });

      expect(await service.cancelStalePendingOrders()).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
