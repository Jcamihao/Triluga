import { PATH_METADATA } from '@nestjs/common/constants';
import { AnalyticsController } from '../../analytics/analytics.controller';
import { AuthController } from '../../auth/auth.controller';
import { BillingController } from '../../billing/billing.controller';
import { ChatController } from '../../chat/chat.controller';
import { FeaturedController } from '../../featured/featured.controller';
import { LookupsController } from '../../lookups/lookups.controller';
import { ReportsController } from '../../reports/reports.controller';
import {
  ANALYTICS_THROTTLE,
  CHAT_MESSAGE_THROTTLE,
  LOOKUPS_THROTTLE,
  REPORT_CREATE_THROTTLE,
} from './throttle-limits.constants';

// Chaves exatas usadas pelo @nestjs/throttler 6.5 (throttler.constants.js).
const LIMIT = 'THROTTLER:LIMITdefault';
const TTL = 'THROTTLER:TTLdefault';
const SKIP = 'THROTTLER:SKIPdefault';

type Ctor = { prototype: Record<string, unknown> };

// Mesma precedência do ThrottlerGuard: metadata do handler vence a da classe.
function effective(ctor: Ctor, handlerName: string) {
  const handler = ctor.prototype[handlerName] as object;
  return {
    limit:
      Reflect.getMetadata(LIMIT, handler) ?? Reflect.getMetadata(LIMIT, ctor),
    ttl: Reflect.getMetadata(TTL, handler) ?? Reflect.getMetadata(TTL, ctor),
  };
}

function skipped(ctor: Ctor, handlerName: string): boolean {
  const handler = ctor.prototype[handlerName] as object;
  return (
    Reflect.getMetadata(SKIP, handler) === true ||
    Reflect.getMetadata(SKIP, ctor) === true
  );
}

// Nomes de todas as rotas do controller (métodos com @Get/@Post/etc.).
function routeHandlers(ctor: Ctor): string[] {
  return Object.getOwnPropertyNames(ctor.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      Reflect.hasMetadata(PATH_METADATA, ctor.prototype[name] as object),
  );
}

describe('limites de throttle por rota (leitura dos controllers reais)', () => {
  it('constantes com os valores aprovados pelo dono (analytics provisório)', () => {
    expect(LOOKUPS_THROTTLE.default).toEqual({ ttl: 60000, limit: 30 });
    expect(REPORT_CREATE_THROTTLE.default).toEqual({
      ttl: 3600000,
      limit: 5,
    });
    expect(CHAT_MESSAGE_THROTTLE.default).toEqual({ ttl: 60000, limit: 30 });
    expect(ANALYTICS_THROTTLE.default).toEqual({ ttl: 60000, limit: 60 });
  });

  it('lookups: todo handler GET de LookupsController = 30/min', () => {
    const handlers = routeHandlers(LookupsController as unknown as Ctor);
    expect(handlers.sort()).toEqual(
      [
        'lookupZipCode',
        'geocodeAddress',
        'getFipeBrands',
        'getFipeModels',
        'getFipeYears',
        'getFipePrice',
      ].sort(),
    );
    for (const name of handlers) {
      expect({
        name,
        ...effective(LookupsController as unknown as Ctor, name),
      }).toEqual({ name, limit: 30, ttl: 60000 });
    }
  });

  it('denúncia: POST /reports (createReport) = 5 por hora', () => {
    expect(
      effective(ReportsController as unknown as Ctor, 'createReport'),
    ).toEqual({ limit: 5, ttl: 3600000 });
  });

  it('chat: POST /chats/:id/messages (sendMessage) = 30/min', () => {
    expect(effective(ChatController as unknown as Ctor, 'sendMessage')).toEqual(
      { limit: 30, ttl: 60000 },
    );
  });

  it('analytics: os dois POST = 60/min (provisório)', () => {
    const ctor = AnalyticsController as unknown as Ctor;
    expect(effective(ctor, 'trackVisit')).toEqual({ limit: 60, ttl: 60000 });
    expect(effective(ctor, 'trackVehicleView')).toEqual({
      limit: 60,
      ttl: 60000,
    });
  });

  it('auth: register, login, forgot-password, reset-password, resend-verification = 5/min', () => {
    const ctor = AuthController as unknown as Ctor;
    for (const name of [
      'register',
      'login',
      'forgotPassword',
      'resetPassword',
      'resendVerification',
    ]) {
      expect({ name, ...effective(ctor, name) }).toEqual({
        name,
        limit: 5,
        ttl: 60000,
      });
    }
  });

  it('webhooks do Asaas (billing e featured) seguem com SkipThrottle', () => {
    expect(skipped(BillingController as unknown as Ctor, 'asaasWebhook')).toBe(
      true,
    );
    expect(
      skipped(FeaturedController as unknown as Ctor, 'handleAsaasWebhook'),
    ).toBe(true);
  });
});
