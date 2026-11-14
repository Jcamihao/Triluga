import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { BillingController } from './billing.controller';
import { BillingPaymentsService } from './billing-payments.service';
import { BillingService } from './billing.service';

describe('BillingController', () => {
  describe('controle de acesso (decorators)', () => {
    const adminRoutes = [
      BillingController.prototype.listGrants,
      BillingController.prototype.createGrant,
      BillingController.prototype.revokeGrant,
    ];

    it.each(adminRoutes.map((fn) => [fn.name, fn]))(
      '%s exige somente ROLE ADMIN',
      (_name, handler) => {
        expect(Reflect.getMetadata(ROLES_KEY, handler as object)).toEqual([
          Role.ADMIN,
        ]);
      },
    );

    it('GET plans é público', () => {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, BillingController.prototype.plans),
      ).toBe(true);
    });

    it('GET me não é público (exige login)', () => {
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, BillingController.prototype.me),
      ).toBeUndefined();
    });
  });

  describe('me', () => {
    it('usa sempre o sub do token, nunca um id vindo da requisição', async () => {
      const billingService = {
        getMe: jest.fn().mockResolvedValue({ plan: 'FREE' }),
      };
      const controller = new BillingController(
        billingService as unknown as BillingService,
        {} as unknown as BillingPaymentsService,
      );

      await controller.me({
        sub: 'user-token',
        role: Role.USER,
        email: 'a@b.com',
      } as any);

      expect(billingService.getMe).toHaveBeenCalledWith('user-token');
    });
  });

  describe('rotas de pagamento (checkout, sync, cancel)', () => {
    const user = {
      sub: 'user-token',
      role: Role.USER,
      email: 'a@b.com',
    } as any;
    const paymentRoutes = [
      BillingController.prototype.checkout,
      BillingController.prototype.sync,
      BillingController.prototype.cancel,
    ];

    it.each(paymentRoutes.map((fn) => [fn.name, fn]))(
      '%s não é pública (exige login)',
      (_name, handler) => {
        expect(
          Reflect.getMetadata(IS_PUBLIC_KEY, handler as object),
        ).toBeUndefined();
      },
    );

    it.each([
      ['checkout', BillingController.prototype.checkout, 5],
      ['sync', BillingController.prototype.sync, 10],
    ])('%s tem @Throttle com limite %i por hora', (_name, handler, limit) => {
      // Chaves do @nestjs/throttler 6.x: THROTTLER:LIMIT<nome> e THROTTLER:TTL<nome>.
      expect(
        Reflect.getMetadata('THROTTLER:LIMITdefault', handler as object),
      ).toBe(limit);
      expect(
        Reflect.getMetadata('THROTTLER:TTLdefault', handler as object),
      ).toBe(3600000);
    });

    it('cancel não tem @Throttle próprio', () => {
      expect(
        Reflect.getMetadata(
          'THROTTLER:LIMITdefault',
          BillingController.prototype.cancel,
        ),
      ).toBeUndefined();
    });

    it('checkout delega ao serviço de pagamentos com user.sub e o dto', async () => {
      const billingService = {} as unknown as BillingService;
      const payments = {
        checkout: jest
          .fn()
          .mockResolvedValue({ link: 'https://asaas.test/c/1' }),
      };
      const controller = new BillingController(
        billingService,
        payments as unknown as BillingPaymentsService,
      );
      const dto = { plan: 'FLEET' as const, interval: 'YEARLY' as const };

      await expect(controller.checkout(user, dto)).resolves.toEqual({
        link: 'https://asaas.test/c/1',
      });
      expect(payments.checkout).toHaveBeenCalledWith('user-token', dto);
    });

    it('sync delega com user.sub', async () => {
      const payments = { sync: jest.fn().mockResolvedValue(undefined) };
      const controller = new BillingController(
        {} as unknown as BillingService,
        payments as unknown as BillingPaymentsService,
      );

      await controller.sync(user);

      expect(payments.sync).toHaveBeenCalledWith('user-token');
    });

    it('cancel delega com user.sub', async () => {
      const payments = { cancel: jest.fn().mockResolvedValue(undefined) };
      const controller = new BillingController(
        {} as unknown as BillingService,
        payments as unknown as BillingPaymentsService,
      );

      await controller.cancel(user);

      expect(payments.cancel).toHaveBeenCalledWith('user-token');
    });
  });
});
