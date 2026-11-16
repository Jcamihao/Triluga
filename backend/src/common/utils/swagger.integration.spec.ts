import { Controller, Get, INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { isSwaggerEnabled } from './swagger.util';

// Módulo mínimo: não importa o AppModule (ele exige banco).
@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

// Mesma sequência do main.ts: prefixo global da API, depois Swagger só se ligado.
async function createApp(raw: string | undefined): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  if (isSwaggerEnabled(raw)) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Triluga API teste').build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }
  await app.init();
  return app;
}

describe('swagger + app Nest (integração)', () => {
  it('SWAGGER_ENABLED=true: GET /api/docs responde 200 (seguindo redirect de barra)', async () => {
    const app = await createApp('true');
    try {
      const res = await request(app.getHttpServer())
        .get('/api/docs')
        .redirects(1);
      expect(res.status).toBe(200);
      expect(res.text).toContain('swagger');
    } finally {
      await app.close();
    }
  });

  it('SWAGGER_ENABLED ausente ou falso: GET /api/docs responde 404', async () => {
    for (const raw of [undefined, 'false', '', '1']) {
      const app = await createApp(raw);
      try {
        const res = await request(app.getHttpServer()).get('/api/docs');
        expect(res.status).toBe(404);
      } finally {
        await app.close();
      }
    }
  });

  it('desligado: nenhuma rota de documentação ou de esquema responde (tudo 404)', async () => {
    const app = await createApp(undefined);
    try {
      for (const path of [
        '/api/docs',
        '/api/docs/',
        '/api/docs-json',
        '/api/docs-yaml',
        '/api/docs/swagger-ui-init.js',
        '/api/docs/swagger-ui-bundle.js',
        '/api/v1/docs',
        '/api/v1/docs/',
        '/api/v1/docs-json',
        '/api/v1/api/docs',
        '/api-json',
        '/api/v1/api-json',
      ]) {
        const res = await request(app.getHttpServer()).get(path);
        expect({ path, status: res.status }).toEqual({ path, status: 404 });
      }
    } finally {
      await app.close();
    }
  });

  it('ligado: serve a UI (com e sem barra final), o JSON e o YAML do esquema', async () => {
    const app = await createApp('true');
    try {
      const withSlash = await request(app.getHttpServer()).get('/api/docs/');
      expect(withSlash.status).toBe(200);
      expect(withSlash.text).toContain('swagger');

      const json = await request(app.getHttpServer()).get('/api/docs-json');
      expect(json.status).toBe(200);
      expect(json.body.info.title).toBe('Triluga API teste');

      const yaml = await request(app.getHttpServer()).get('/api/docs-yaml');
      expect(yaml.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('com Swagger desligado, a API continua respondendo normalmente', async () => {
    const app = await createApp(undefined);
    try {
      const res = await request(app.getHttpServer()).get('/api/v1/ping');
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }
  });
});
