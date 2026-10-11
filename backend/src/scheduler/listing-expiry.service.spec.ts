import { Logger } from '@nestjs/common';
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

describe('ListingExpiryService.expireFeaturedListings', () => {
  const build = (result: { orders: number; vehicles: number }) => {
    const featured = {
      expireFeaturedListings: jest.fn().mockResolvedValue(result),
    };
    const service = new ListingExpiryService(
      {} as PrismaService,
      {} as EmailService,
      featured as unknown as FeaturedService,
    );
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    return { featured, service, logSpy };
  };

  afterEach(() => jest.restoreAllMocks());

  it('delegates and logs when something expired', async () => {
    const { featured, service, logSpy } = build({ orders: 2, vehicles: 3 });

    await service.expireFeaturedListings();

    expect(featured.expireFeaturedListings).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      'featured_listings_expired orders=2 vehicles=3',
    );
  });

  it('does not log when nothing expired', async () => {
    const { service, logSpy } = build({ orders: 0, vehicles: 0 });

    await service.expireFeaturedListings();

    expect(logSpy).not.toHaveBeenCalled();
  });
});
