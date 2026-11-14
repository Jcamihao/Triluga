import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { BillingController } from './billing.controller';
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
      );

      await controller.me({
        sub: 'user-token',
        role: Role.USER,
        email: 'a@b.com',
      } as any);

      expect(billingService.getMe).toHaveBeenCalledWith('user-token');
    });
  });
});
