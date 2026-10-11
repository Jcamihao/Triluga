import { EmailService } from '../email/email.service';
import { FeaturedService } from '../featured/featured.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListingExpiryService } from './listing-expiry.service';

describe('ListingExpiryService.cancelStalePendingOrders', () => {
  it('delegates to FeaturedService.cancelStalePendingOrders', async () => {
    const featured = {
      cancelStalePendingOrders: jest.fn().mockResolvedValue(3),
    };
    const service = new ListingExpiryService(
      {} as PrismaService,
      {} as EmailService,
      featured as unknown as FeaturedService,
    );

    await service.cancelStalePendingOrders();

    expect(featured.cancelStalePendingOrders).toHaveBeenCalledTimes(1);
  });
});
