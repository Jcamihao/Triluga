import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasClient, AsaasClientError } from '../asaas/asaas.client';
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
  const vehicleUpdate = jest.fn().mockResolvedValue({});
  const vehicleUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
  const vehicleFindUniqueTx = jest
    .fn()
    .mockResolvedValue({ featuredUntil: null });
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    featuredOrder,
    vehicle: {
      findUnique: vehicleFindUniqueTx,
      update: vehicleUpdate,
      updateMany: vehicleUpdateMany,
    },
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
      update: vehicleUpdate,
      updateMany: vehicleUpdateMany,
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
    getPaymentStatus: jest
      .fn()
      .mockResolvedValue({ status: 'PENDING', deleted: false }),
    deletePayment: jest.fn().mockResolvedValue(undefined),
  };
}

describe('FeaturedService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let asaas: ReturnType<typeof buildAsaas>;
  let service: FeaturedService;
  let configGet: jest.Mock;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-11T15:00:00Z') });
    prisma = buildPrisma();
    asaas = buildAsaas();
    configGet = jest.fn();
    const config = { get: configGet } as unknown as ConfigService;
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

    it('checks the charge status before deleting it', async () => {
      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(asaas.getPaymentStatus).toHaveBeenCalledWith('pay_1');
      expect(asaas.getPaymentStatus.mock.invocationCallOrder[0]).toBeLessThan(
        asaas.deletePayment.mock.invocationCallOrder[0],
      );
    });

    it.each(['PENDING', 'OVERDUE'])(
      'deletes the charge and then cancels when its status is %s',
      async (status) => {
        asaas.getPaymentStatus.mockResolvedValue({ status, deleted: false });

        await service.cancelOrder(USER_ID, ORDER_ID);

        expect(asaas.deletePayment).toHaveBeenCalledWith('pay_1');
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
          where: { id: ORDER_ID, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      },
    );

    it.each([
      'RECEIVED',
      'CONFIRMED',
      'RECEIVED_IN_CASH',
      'REFUND_REQUESTED',
      'CHARGEBACK_REQUESTED',
      'AWAITING_RISK_ANALYSIS',
      'SOMETHING_NEW',
    ])(
      'does not delete nor cancel, logs error and throws 503 when the charge status is %s',
      async (status) => {
        asaas.getPaymentStatus.mockResolvedValue({ status, deleted: false });

        const err = await service
          .cancelOrder(USER_ID, ORDER_ID)
          .catch((e) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.message).toBe(CANCEL_FAILURE_MESSAGE);
        expect(asaas.deletePayment).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.update).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = String(errorSpy.mock.calls[0][0]);
        expect(msg).toContain('cobrança já paga/confirmada');
        expect(msg).toContain(ORDER_ID);
        expect(msg).toContain('pay_1');
        expect(msg).toContain(status);
      },
    );

    it('sanitizes an untrusted status in the error log', async () => {
      asaas.getPaymentStatus.mockResolvedValue({
        status: 'X\nFORGED' + 'z'.repeat(500),
        deleted: false,
      });

      await service.cancelOrder(USER_ID, ORDER_ID).catch(() => undefined);

      const msg = String(errorSpy.mock.calls[0][0]);
      expect(msg).not.toContain('\n');
      expect(msg).not.toContain('z'.repeat(65));
    });

    it('cancels without deleting when the charge is already deleted on Asaas', async () => {
      asaas.getPaymentStatus.mockResolvedValue({
        status: 'RECEIVED_IN_CASH',
        deleted: true,
      });

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
        where: { id: ORDER_ID, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('cancels without deleting when getPaymentStatus answers 404 (charge already gone)', async () => {
      asaas.getPaymentStatus.mockRejectedValue(
        new AsaasClientError('not found', 404),
      );

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['5xx', new AsaasClientError('boom', 500)],
      ['other 4xx', new AsaasClientError('forbidden', 403)],
      ['network error', new Error('ETIMEDOUT')],
    ])(
      'never cancels blindly: getPaymentStatus failing with %s keeps the order PENDING (503) and warns',
      async (_label, failure) => {
        asaas.getPaymentStatus.mockRejectedValue(failure);

        const err = await service
          .cancelOrder(USER_ID, ORDER_ID)
          .catch((e) => e);

        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(asaas.deletePayment).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
      },
    );

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

    it.each(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'SOMETHING_NEW'])(
      'skips an order whose charge is %s (no delete, no cancel, error logged) and keeps going',
      async (status) => {
        prisma.featuredOrder.findMany.mockResolvedValue([
          { id: 'o1', paymentId: 'pay_1' },
          { id: 'o2', paymentId: 'pay_2' },
        ]);
        asaas.getPaymentStatus.mockImplementation((id: string) =>
          Promise.resolve({
            status: id === 'pay_1' ? status : 'PENDING',
            deleted: false,
          }),
        );

        const count = await service.cancelStalePendingOrders();

        expect(count).toBe(1);
        expect(asaas.deletePayment).toHaveBeenCalledTimes(1);
        expect(asaas.deletePayment).toHaveBeenCalledWith('pay_2');
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
          where: { id: 'o2', status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(String(errorSpy.mock.calls[0][0])).toContain('o1');
      },
    );

    it('skips an order when getPaymentStatus fails with 5xx and never cancels blindly', async () => {
      prisma.featuredOrder.findMany.mockResolvedValue([
        { id: 'o1', paymentId: 'pay_1' },
      ]);
      asaas.getPaymentStatus.mockRejectedValue(
        new AsaasClientError('boom', 500),
      );

      expect(await service.cancelStalePendingOrders()).toBe(0);
      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('cancels an order whose charge is gone per getPaymentStatus (404 or deleted:true) without deleting', async () => {
      prisma.featuredOrder.findMany.mockResolvedValue([
        { id: 'o1', paymentId: 'pay_1' },
        { id: 'o2', paymentId: 'pay_2' },
      ]);
      asaas.getPaymentStatus.mockImplementation((id: string) =>
        id === 'pay_1'
          ? Promise.reject(new AsaasClientError('nf', 404))
          : Promise.resolve({ status: 'PENDING', deleted: true }),
      );

      expect(await service.cancelStalePendingOrders()).toBe(2);
      expect(asaas.deletePayment).not.toHaveBeenCalled();
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

  describe('handleAsaasWebhook', () => {
    const TOKEN = 'secret-token';
    const pendingOrder = {
      id: ORDER_ID,
      vehicleId: VEHICLE_ID,
      userId: USER_ID,
      durationDays: 7,
      price: 29.9,
      status: 'PENDING',
      paymentId: 'pay_1',
    };
    const event = (
      overrides: Record<string, unknown> = {},
      evt = 'PAYMENT_RECEIVED',
    ) => ({
      event: evt,
      payment: {
        id: 'pay_1',
        value: 29.9,
        externalReference: ORDER_ID,
        ...overrides,
      },
    });
    beforeEach(() => {
      configGet.mockImplementation((key: string) =>
        key === 'asaas.webhookToken' ? TOKEN : undefined,
      );
      prisma.featuredOrder.findUnique.mockResolvedValue(pendingOrder);
      jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      jest.spyOn(Logger.prototype, 'log').mockImplementation();
    });

    const expectNothingTouched = () => {
      expect(prisma.featuredOrder.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
    };

    describe('token', () => {
      it('rejects with 403 when token is wrong', async () => {
        await expect(
          service.handleAsaasWebhook('wrong-token!', event()),
        ).rejects.toThrow(new ForbiddenException('Invalid webhook token'));
        expectNothingTouched();
      });

      it('rejects with 403 when header is missing', async () => {
        await expect(
          service.handleAsaasWebhook(undefined as unknown as string, event()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.handleAsaasWebhook('', event()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expectNothingTouched();
      });

      it('rejects with 403 when ASAAS_WEBHOOK_TOKEN is not configured', async () => {
        configGet.mockReturnValue(undefined);
        await expect(
          service.handleAsaasWebhook(TOKEN, event()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        configGet.mockReturnValue(null);
        await expect(
          service.handleAsaasWebhook(TOKEN, event()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expectNothingTouched();
      });

      it('rejects with 403 when both env token and header are empty strings', async () => {
        configGet.mockReturnValue('');
        await expect(
          service.handleAsaasWebhook('', event()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expectNothingTouched();
      });

      it('rejects with 403 (no throw from timingSafeEqual) when token has a different length', async () => {
        await expect(
          service.handleAsaasWebhook(TOKEN + 'x', event()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.handleAsaasWebhook('s', event()),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expectNothingTouched();
      });

      it('rejects with 403 before reading a null payload when token is invalid', async () => {
        await expect(
          service.handleAsaasWebhook('nope', null),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    describe('activation', () => {
      it('activates a PENDING order on PAYMENT_RECEIVED', async () => {
        const result = await service.handleAsaasWebhook(TOKEN, event());

        expect(result).toEqual({ ok: true, activated: 1 });
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
          where: { id: ORDER_ID, status: 'PENDING' },
          data: {
            status: 'ACTIVE',
            activatedAt: new Date('2026-10-11T15:00:00Z'),
            expiresAt: new Date('2026-10-18T15:00:00Z'),
          },
        });
        expect(prisma.vehicle.update).toHaveBeenCalledWith({
          where: { id: VEHICLE_ID },
          data: {
            isFeatured: true,
            featuredUntil: new Date('2026-10-18T15:00:00Z'),
          },
        });
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it('keeps a later existing featuredUntil (never shortens) while the order gets now + durationDays', async () => {
        const later = new Date('2026-12-31T00:00:00Z');
        prisma.tx.vehicle.findUnique.mockResolvedValue({
          featuredUntil: later,
        });

        await service.handleAsaasWebhook(TOKEN, event());

        expect(prisma.tx.vehicle.findUnique).toHaveBeenCalledWith({
          where: { id: VEHICLE_ID },
          select: { featuredUntil: true },
        });
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              expiresAt: new Date('2026-10-18T15:00:00Z'),
            }),
          }),
        );
        expect(prisma.vehicle.update).toHaveBeenCalledWith({
          where: { id: VEHICLE_ID },
          data: { isFeatured: true, featuredUntil: later },
        });
      });

      it.each([
        ['no existing featuredUntil', null],
        ['an earlier featuredUntil', new Date('2026-10-12T00:00:00Z')],
      ])('uses the new expiresAt with %s', async (_n, existing) => {
        prisma.tx.vehicle.findUnique.mockResolvedValue({
          featuredUntil: existing,
        });

        await service.handleAsaasWebhook(TOKEN, event());

        expect(prisma.vehicle.update).toHaveBeenCalledWith({
          where: { id: VEHICLE_ID },
          data: {
            isFeatured: true,
            featuredUntil: new Date('2026-10-18T15:00:00Z'),
          },
        });
      });

      it('activates a PENDING order on PAYMENT_CONFIRMED', async () => {
        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({}, 'PAYMENT_CONFIRMED'),
        );
        expect(result).toEqual({ ok: true, activated: 1 });
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledTimes(1);
      });

      it('updates the order and the vehicle in the same transaction', async () => {
        await service.handleAsaasWebhook(TOKEN, event());
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('finds the order by payment.externalReference', async () => {
        await service.handleAsaasWebhook(TOKEN, event());
        expect(prisma.featuredOrder.findUnique).toHaveBeenCalledWith({
          where: { id: ORDER_ID },
        });
      });

      it('falls back to paymentId when externalReference matches no order', async () => {
        prisma.featuredOrder.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(pendingOrder);

        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({ externalReference: 'ghost' }),
        );

        expect(prisma.featuredOrder.findUnique).toHaveBeenNthCalledWith(1, {
          where: { id: 'ghost' },
        });
        expect(prisma.featuredOrder.findUnique).toHaveBeenNthCalledWith(2, {
          where: { paymentId: 'pay_1' },
        });
        expect(result).toEqual({ ok: true, activated: 1 });
      });

      it('falls back to paymentId when externalReference is absent', async () => {
        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({ externalReference: undefined }),
        );
        expect(prisma.featuredOrder.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.featuredOrder.findUnique).toHaveBeenCalledWith({
          where: { paymentId: 'pay_1' },
        });
        expect(result).toEqual({ ok: true, activated: 1 });
      });

      it('treats 29.9 and 29.90 as equal (cents comparison)', async () => {
        for (const price of [29.9, '29.90', '29.9']) {
          prisma.featuredOrder.findUnique.mockResolvedValue({
            ...pendingOrder,
            price,
          });
          const result = await service.handleAsaasWebhook(
            TOKEN,
            event({ value: 29.9 }),
          );
          expect(result).toEqual({ ok: true, activated: 1 });
        }
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it('works with a Decimal-like order.price (object with toString/valueOf)', async () => {
        const decimalLike = {
          toString: () => '29.9',
          valueOf: () => '29.9',
          toNumber: () => 29.9,
        };
        prisma.featuredOrder.findUnique.mockResolvedValue({
          ...pendingOrder,
          price: decimalLike,
        });

        const result = await service.handleAsaasWebhook(TOKEN, event());

        expect(result).toEqual({ ok: true, activated: 1 });
      });

      it('does not activate when payment.value differs from order.price and logs error with orderId and both values', async () => {
        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({ value: 10 }),
        );

        expect(result).toEqual({ ok: true, activated: 0 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = String(errorSpy.mock.calls[0][0]);
        expect(msg).toContain(ORDER_ID);
        expect(msg).toContain('10');
        expect(msg).toContain('29.9');
      });

      it('does not activate when payment.value is missing or not numeric', async () => {
        for (const value of [undefined, null, 'abc', {}]) {
          const result = await service.handleAsaasWebhook(
            TOKEN,
            event({ value }),
          );
          expect(result).toEqual({ ok: true, activated: 0 });
        }
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('is idempotent: a second delivery for an ACTIVE order activates nothing and does not log error', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue({
          ...pendingOrder,
          status: 'ACTIVE',
        });

        const result = await service.handleAsaasWebhook(TOKEN, event());

        expect(result).toEqual({ ok: true, activated: 0 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it('is a quiet no-op for an EXPIRED order', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue({
          ...pendingOrder,
          status: 'EXPIRED',
        });

        const result = await service.handleAsaasWebhook(TOKEN, event());

        expect(result).toEqual({ ok: true, activated: 0 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
      });

      it('does not activate a CANCELLED order that was paid later and logs error with orderId, paymentId and value', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue({
          ...pendingOrder,
          status: 'CANCELLED',
        });

        const result = await service.handleAsaasWebhook(TOKEN, event());

        expect(result).toEqual({ ok: true, activated: 0 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        expect(prisma.vehicle.update).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = String(errorSpy.mock.calls[0][0]);
        expect(msg).toContain(ORDER_ID);
        expect(msg).toContain('pay_1');
        expect(msg).toContain('29.9');
      });

      it('does not activate when the guarded update matches nothing (concurrent cancel or duplicate delivery)', async () => {
        prisma.featuredOrder.updateMany.mockResolvedValue({ count: 0 });

        const result = await service.handleAsaasWebhook(TOKEN, event());

        expect(result).toEqual({ ok: true, activated: 0 });
        expect(prisma.featuredOrder.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.vehicle.update).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
      });
    });

    describe('malformed payloads', () => {
      const cases: Array<[string, unknown]> = [
        ['null payload', null],
        ['undefined payload', undefined],
        ['string payload', 'oops'],
        ['empty object', {}],
        ['unknown event', event({}, 'PAYMENT_CREATED')],
        ['missing event', { payment: { id: 'pay_1', value: 29.9 } }],
        ['missing payment', { event: 'PAYMENT_RECEIVED' }],
        ['null payment', { event: 'PAYMENT_RECEIVED', payment: null }],
        ['string payment', { event: 'PAYMENT_RECEIVED', payment: 'x' }],
        [
          'null externalReference and no payment id',
          {
            event: 'PAYMENT_RECEIVED',
            payment: { value: 29.9, externalReference: null },
          },
        ],
        [
          'empty externalReference and no payment id',
          {
            event: 'PAYMENT_RECEIVED',
            payment: { value: 29.9, externalReference: '' },
          },
        ],
        [
          'non-string externalReference',
          {
            event: 'PAYMENT_RECEIVED',
            payment: { value: 29.9, externalReference: { $ne: 1 } },
          },
        ],
      ];

      it.each(cases)(
        'returns { ok: true, activated: 0 } for %s',
        async (_name, payload) => {
          const result = await service.handleAsaasWebhook(
            TOKEN,
            payload as never,
          );
          expect(result).toEqual({ ok: true, activated: 0 });
          expect(prisma.$transaction).not.toHaveBeenCalled();
          expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        },
      );

      it('returns { ok: true, activated: 0 } for an unknown order', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue(null);

        const result = await service.handleAsaasWebhook(TOKEN, event());

        expect(result).toEqual({ ok: true, activated: 0 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('payment cross-check', () => {
      it('does not activate when payment.id differs from order.paymentId and logs error with both ids', async () => {
        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({ id: 'pay_OTHER' }),
        );

        expect(result).toEqual({ ok: true, activated: 0 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = String(errorSpy.mock.calls[0][0]);
        expect(msg).toContain(ORDER_ID);
        expect(msg).toContain('pay_1');
        expect(msg).toContain('pay_OTHER');
      });

      it('keeps accepting by externalReference when order.paymentId is null', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue({
          ...pendingOrder,
          paymentId: null,
        });

        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({ id: 'pay_whatever' }),
        );

        expect(result).toEqual({ ok: true, activated: 1 });
      });

      it('skips the comparison when payment.id is absent', async () => {
        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({ id: undefined }),
        );

        expect(result).toEqual({ ok: true, activated: 1 });
        expect(errorSpy).not.toHaveBeenCalled();
      });
    });

    describe('log hygiene', () => {
      it('truncates and strips control characters from untrusted strings in logs', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue(null);
        const evil = 'ab\ncd\r\x00' + 'x'.repeat(10_000);

        await service.handleAsaasWebhook(
          TOKEN,
          event({ externalReference: evil, id: evil }),
        );

        expect(warnSpy).toHaveBeenCalled();
        const msg = String(warnSpy.mock.calls[0][0]);
        expect(msg.length).toBeLessThan(400);
        expect(msg).not.toMatch(/[\x00-\x08\x0a-\x1f\x7f]/);
        expect(msg).toContain('abcdxxx');
        expect(msg).not.toContain('x'.repeat(65));
      });

      it('sanitizes the paymentId in the CANCELLED error log', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue({
          ...pendingOrder,
          status: 'CANCELLED',
          paymentId: null,
        });
        await service.handleAsaasWebhook(
          TOKEN,
          event({ id: 'pay\nFORGED ' + 'y'.repeat(500) }),
        );
        const msg = String(errorSpy.mock.calls[0][0]);
        expect(msg).not.toContain('\n');
        expect(msg).not.toContain('y'.repeat(65));
      });
    });

    describe('reversal events', () => {
      const alwaysError = [
        'PAYMENT_REFUNDED',
        'PAYMENT_REVERSED',
        'PAYMENT_CHARGEBACK_REQUESTED',
        'PAYMENT_CHARGEBACK_DISPUTE',
      ];
      const statuses = ['PENDING', 'ACTIVE', 'CANCELLED', 'EXPIRED'];
      let logSpy: jest.SpyInstance;

      beforeEach(() => {
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      });

      const expectNoStateChange = () => {
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.updateMany).not.toHaveBeenCalled();
        expect(prisma.featuredOrder.update).not.toHaveBeenCalled();
        expect(prisma.vehicle.update).not.toHaveBeenCalled();
        expect(prisma.vehicle.updateMany).not.toHaveBeenCalled();
      };

      const cases = alwaysError.flatMap((evt) =>
        statuses.map((status) => [evt, status] as const),
      );

      it.each(cases)(
        '%s on a %s order changes no state and logs error with orderId, paymentId and event',
        async (evt, status) => {
          prisma.featuredOrder.findUnique.mockResolvedValue({
            ...pendingOrder,
            status,
          });

          const result = await service.handleAsaasWebhook(
            TOKEN,
            event({}, evt),
          );

          expect(result).toEqual({ ok: true, activated: 0 });
          expectNoStateChange();
          expect(errorSpy).toHaveBeenCalledTimes(1);
          const msg = String(errorSpy.mock.calls[0][0]);
          expect(msg).toContain(ORDER_ID);
          expect(msg).toContain('pay_1');
          expect(msg).toContain(evt);
        },
      );

      it('PAYMENT_DELETED on an ACTIVE order logs error for manual reconciliation', async () => {
        prisma.featuredOrder.findUnique.mockResolvedValue({
          ...pendingOrder,
          status: 'ACTIVE',
        });

        const result = await service.handleAsaasWebhook(
          TOKEN,
          event({}, 'PAYMENT_DELETED'),
        );

        expect(result).toEqual({ ok: true, activated: 0 });
        expectNoStateChange();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        const msg = String(errorSpy.mock.calls[0][0]);
        expect(msg).toContain(ORDER_ID);
        expect(msg).toContain('pay_1');
        expect(msg).toContain('PAYMENT_DELETED');
      });

      it.each(['PENDING', 'CANCELLED', 'EXPIRED'])(
        'PAYMENT_DELETED on a %s order is informational only (no error)',
        async (status) => {
          prisma.featuredOrder.findUnique.mockResolvedValue({
            ...pendingOrder,
            status,
          });

          const result = await service.handleAsaasWebhook(
            TOKEN,
            event({}, 'PAYMENT_DELETED'),
          );

          expect(result).toEqual({ ok: true, activated: 0 });
          expectNoStateChange();
          expect(errorSpy).not.toHaveBeenCalled();
          expect(logSpy).toHaveBeenCalledTimes(1);
          expect(String(logSpy.mock.calls[0][0])).toContain(
            'cobrança removida; nada a fazer',
          );
        },
      );

      it('looks the order up by paymentId when externalReference is missing', async () => {
        await service.handleAsaasWebhook(
          TOKEN,
          event({ externalReference: null }, 'PAYMENT_REFUNDED'),
        );
        expect(prisma.featuredOrder.findUnique).toHaveBeenCalledWith({
          where: { paymentId: 'pay_1' },
        });
        expect(errorSpy).toHaveBeenCalledTimes(1);
      });

      it.each(['PAYMENT_REFUNDED', 'PAYMENT_DELETED'])(
        '%s for an unknown order warns and returns noop',
        async (evt) => {
          prisma.featuredOrder.findUnique.mockResolvedValue(null);

          const result = await service.handleAsaasWebhook(
            TOKEN,
            event({}, evt),
          );

          expect(result).toEqual({ ok: true, activated: 0 });
          expect(warnSpy).toHaveBeenCalled();
          expect(errorSpy).not.toHaveBeenCalled();
        },
      );
    });

    describe('error semantics', () => {
      it('propagates a transient failure while activating (so Asaas retries) and logs it', async () => {
        (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
          new Error('db down'),
        );

        await expect(
          service.handleAsaasWebhook(TOKEN, event()),
        ).rejects.toThrow('db down');
        expect(errorSpy).toHaveBeenCalled();
        expect(String(errorSpy.mock.calls[0][0])).toContain(ORDER_ID);
      });

      it('propagates a failure while looking up the order (so Asaas retries)', async () => {
        prisma.featuredOrder.findUnique.mockRejectedValue(new Error('db down'));

        await expect(
          service.handleAsaasWebhook(TOKEN, event()),
        ).rejects.toThrow('db down');
      });
    });
  });

  describe('onModuleInit', () => {
    it('warns when the api key is set but the webhook token is empty', () => {
      configGet.mockImplementation((key: string) =>
        key === 'asaas.apiKey' ? 'key' : '',
      );
      service.onModuleInit();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain(
        'webhooks serão recusados com 403 e pedidos pagos não serão ativados',
      );
    });

    it('stays quiet when both are set, or when the api key is not set', () => {
      configGet.mockImplementation((key: string) =>
        key === 'asaas.apiKey' ? 'key' : 'token',
      );
      service.onModuleInit();
      configGet.mockImplementation(() => '');
      service.onModuleInit();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('expireFeaturedListings', () => {
    const now = new Date('2026-10-11T15:00:00Z');

    it('expires ACTIVE orders and clears vehicles in one transaction with the exact where clauses', async () => {
      prisma.featuredOrder.updateMany.mockResolvedValue({ count: 2 });
      prisma.vehicle.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.expireFeaturedListings(now);

      expect(result).toEqual({ orders: 2, vehicles: 3 });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });
      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          isFeatured: true,
          featuredUntil: { not: null, lt: now },
        },
        data: { isFeatured: false, featuredUntil: null },
      });
    });

    it('never targets vehicles with featuredUntil null (manual forever-feature)', async () => {
      await service.expireFeaturedListings(now);
      const where = prisma.vehicle.updateMany.mock.calls[0][0].where;
      expect(where.featuredUntil).toEqual(
        expect.objectContaining({ not: null }),
      );
    });

    it('defaults now to the current time', async () => {
      await service.expireFeaturedListings();
      expect(prisma.featuredOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'ACTIVE',
            expiresAt: { lt: new Date('2026-10-11T15:00:00Z') },
          },
        }),
      );
    });
  });
});
