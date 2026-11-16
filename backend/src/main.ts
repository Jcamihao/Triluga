import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionLoggingFilter } from './common/filters/http-exception-logging.filter';
import { requestContextMiddleware } from './common/middleware/request-context.middleware';
import { applyTrustProxy } from './common/utils/trust-proxy.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const trustProxyHops = applyTrustProxy(app, configService);
  logger.log(`trust proxy hops=${trustProxyHops}`);
  const port = configService.get<number>('app.port', 3000);
  const appUrl =
    configService.get<string>('app.appUrl') ?? `http://localhost:${port}`;

  app.setGlobalPrefix('api/v1');
  app.use(requestContextMiddleware(logger));
  const frontendUrls = (
    configService.get<string>('FRONTEND_URL') ?? 'http://localhost:4200'
  )
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  app.enableCors({
    origin: frontendUrls,
    credentials: true,
  });
  app.use(helmet());
  app.use(compression());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionLoggingFilter());

  // Só monta o Swagger com SWAGGER_ENABLED=true. Desligado, /api/docs é rota inexistente (404).
  if (configService.get<boolean>('app.swaggerEnabled', false) === true) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Triluga API')
      .setDescription('API do classificado de veículos entre pessoas.')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
    logger.log('swagger enabled at /api/docs');
  } else {
    logger.log('swagger disabled');
  }

  await app.listen(port);
  logger.log(`Triluga API running at ${appUrl}/api/v1`);
}
bootstrap();
