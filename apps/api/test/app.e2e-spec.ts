import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the prefix set in src/main.ts — the app here is built directly
    // from AppModule, bypassing bootstrap(), so it isn't applied automatically.
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET) — public, no auth required', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string; timestamp: string };
        expect(body.status).toBe('ok');
        expect(typeof body.timestamp).toBe('string');
      });
  });

  it('/api/users (GET) — protected, rejects unauthenticated requests', () => {
    return request(app.getHttpServer()).get('/api/users').expect(401);
  });

  afterEach(async () => {
    await app.close();
  });
});
