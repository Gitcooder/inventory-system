import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

/**
 * Every other integration-style test in this repo (test/*.e2e-spec.ts) needs
 * a live Postgres + Redis and couldn't be run in the sandbox this was built
 * in. This one can, because it mocks Prisma and Redis at the DI level
 * instead of connecting to real ones — which means it proves something
 * different and just as important: that the entire module graph (all 18
 * feature modules, every guard, the Phase 8 LoggerModule and
 * AllExceptionsFilter, AlertsGateway's lifecycle hooks) actually resolves
 * and boots without a circular-dependency or provider-resolution error. That
 * class of bug is invisible to any single unit test and would otherwise only
 * surface the first time someone actually starts the app.
 */
describe('AppModule (full DI graph, mocked Prisma/Redis)', () => {
  let app: INestApplication;

  const mockPrisma = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedis = {
    onModuleInit: jest.fn().mockResolvedValue(undefined),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    client: {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(0),
    },
    // AlertsGateway.afterInit() calls subscriber.subscribe()/.on() as part of
    // normal module bootstrap (not per-request), so these specifically must
    // resolve/exist or app.init() itself would throw.
    subscriber: {
      subscribe: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(RedisService)
      .useValue(mockRedis)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the entire module graph and serves the public health check', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    const body = res.body as { status: string };
    expect(body.status).toBe('ok');
  });

  it('rejects an unauthenticated request to a protected route with 401, via the real guard chain', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });

  it('routes an unknown path through AllExceptionsFilter to a clean 404 JSON body, not a raw stack trace', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/this-route-does-not-exist')
      .expect(404);
    const body = res.body as { statusCode: number; message: unknown };
    expect(body.statusCode).toBe(404);
    expect(body).not.toHaveProperty('stack');
  });

  it('rejects a request body with an unexpected field (whitelist validation actually wired up)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'irrelevant', notAField: true })
      .expect(400);
  });

  it('reports 503 on /api/health/ready when Prisma/Redis are unreachable, without crashing', async () => {
    // The mocks above deliberately don't implement $queryRaw/ping, so this
    // exercises the real "a dependency is down" branch of getReadiness(),
    // not just the happy path — and proves it degrades to a clean 503
    // rather than an unhandled rejection.
    const res = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503);
    const body = res.body as {
      status: string;
      checks: { database: string; redis: string };
    };
    expect(body.status).toBe('unavailable');
    expect(body.checks).toEqual({
      database: 'unavailable',
      redis: 'unavailable',
    });
  });
});
