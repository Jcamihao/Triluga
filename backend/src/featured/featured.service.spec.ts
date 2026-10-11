import {
  BadRequestException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasClient } from './asaas.client';
import { FeaturedService } from './featured.service';

const USER_ID = 'user-1';
const VEHICLE_ID = 'vehicle-1';
const ORDER_ID = 'order-1';
const MISSING_DOCUMENT_MESSAGE =
  'Complete seu CPF/CNPJ no perfil para pagar o destaque.';
const PIX_FAILURE_MESSAGE =
  'Não foi possível gerar o PIX agora. Tente novamente em instantes.';

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildPrisma() {
  return {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        ownerId: USER_ID,
        isActive: true,
        title: 'Civic 2020',
      }),
    },
    featuredOrder: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
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
    },
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
        dueDate: tomorrowIso(),
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
  });

  describe('cancelOrder', () => {
    it('on PENDING order deletes the asaas payment and marks CANCELLED', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        id: ORDER_ID,
        userId: USER_ID,
        status: 'PENDING',
        paymentId: 'pay_1',
      });

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(asaas.deletePayment).toHaveBeenCalledWith('pay_1');
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
    });

    it('does not call asaas when the order has no paymentId', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        id: ORDER_ID,
        userId: USER_ID,
        status: 'PENDING',
        paymentId: null,
      });

      await service.cancelOrder(USER_ID, ORDER_ID);

      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
    });

    it('still cancels when deletePayment throws', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        id: ORDER_ID,
        userId: USER_ID,
        status: 'PENDING',
        paymentId: 'pay_1',
      });
      asaas.deletePayment.mockRejectedValue(new Error('asaas down'));

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).resolves.toBeDefined();

      expect(prisma.featuredOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { status: 'CANCELLED' },
      });
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('rejects non-PENDING orders', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        id: ORDER_ID,
        userId: USER_ID,
        status: 'ACTIVE',
        paymentId: 'pay_1',
      });

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.update).not.toHaveBeenCalled();
    });

    it('rejects foreign orders', async () => {
      prisma.featuredOrder.findUnique.mockResolvedValue({
        id: ORDER_ID,
        userId: 'someone-else',
        status: 'PENDING',
        paymentId: 'pay_1',
      });

      await expect(
        service.cancelOrder(USER_ID, ORDER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(asaas.deletePayment).not.toHaveBeenCalled();
      expect(prisma.featuredOrder.update).not.toHaveBeenCalled();
    });
  });
});
