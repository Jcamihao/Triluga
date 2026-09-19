import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { resolve } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CacheQueueModule } from './cache-queue/cache-queue.module';
import { ChatModule } from './chat/chat.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { cacheConfig } from './config/cache.config';
import { storageConfig } from './config/storage.config';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfilesModule } from './profiles/profiles.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { VehicleImagesModule } from './vehicle-images/vehicle-images.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AdminModule } from './admin/admin.module';
import { FavoritesModule } from './favorites/favorites.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SearchAlertsModule } from './search-alerts/search-alerts.module';
import { LookupsModule } from './lookups/lookups.module';
import { EmailModule } from './email/email.module';
import { emailConfig } from './config/email.config';
import { efipayConfig } from './config/efipay.config';
import { SitemapModule } from './sitemap/sitemap.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { FeaturedModule } from './featured/featured.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        resolve(__dirname, '../../.env'),
        resolve(__dirname, '../.env'),
        resolve(__dirname, '../.env.example'),
      ],
      load: [
        appConfig,
        authConfig,
        cacheConfig,
        storageConfig,
        emailConfig,
        efipayConfig,
      ],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }]),
    PrismaModule,
    CacheQueueModule,
    StorageModule,
    UsersModule,
    ProfilesModule,
    PrivacyModule,
    AuthModule,
    ChatModule,
    VehicleImagesModule,
    VehiclesModule,
    FavoritesModule,
    AnalyticsModule,
    SearchAlertsModule,
    LookupsModule,
    NotificationsModule,
    ReviewsModule,
    AdminModule,
    EmailModule,
    SitemapModule,
    SchedulerModule,
    ReportsModule,
    AuditModule,
    FeaturedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
