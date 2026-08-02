import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * This is the test the whole architecture is built to pass: fire two
 * dispense requests at the same instant against exactly 1 unit of stock and
 * prove that exactly one succeeds — never both, never a negative quantity.
 *
 * Requires a live Postgres + Redis and the seed script already run (needs an
 * Admin-permissioned user to set up test fixtures — there's no public
 * registration endpoint by design). Run with:
 *   npm run dev:infra
 *   cd apps/api && npx prisma generate && npx prisma migrate dev
 *   npm run seed
 *   npm run test:e2e
 *
 * This could not be run in the sandbox this scaffold was built in (no
 * Postgres available there) — see README for that constraint. The unit
 * tests in dispense.service.spec.ts cover the same logic with a mocked
 * transaction client, but only a real database can prove the row lock
 * itself actually serializes concurrent transactions; that's what this test
 * is for.
 */
describe('Dispense concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const suffix = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    accessToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function authed() {
    return request(app.getHttpServer()).set(
      'Authorization',
      `Bearer ${accessToken}`,
    );
  }

  it('lets exactly one of two simultaneous dispenses succeed against 1 unit of stock', async () => {
    const server = app.getHttpServer();

    const brand = await request(server)
      .post('/api/brands')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `ConcurrencyTestBrand-${suffix}` })
      .expect(201);

    const category = await request(server)
      .post('/api/categories')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `ConcurrencyTestCategory-${suffix}` })
      .expect(201);

    const location = await request(server)
      .post('/api/locations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `ConcurrencyTestLocation-${suffix}`, type: 'warehouse' })
      .expect(201);

    const product = await request(server)
      .post('/api/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        skuCode: `CONC-TEST-${suffix}`,
        name: `Concurrency Test Product ${suffix}`,
        brandId: (brand.body as { id: number }).id,
        categoryId: (category.body as { id: number }).id,
      })
      .expect(201);

    const productId = (product.body as { id: number }).id;
    const locationId = (location.body as { id: number }).id;

    // Stock exactly 1 unit — the whole point of the test.
    await authed()
      .post('/api/inventory/adjustments')
      .send({
        productId,
        locationId,
        adjustmentType: 'restock',
        quantityChange: 1,
      })
      .expect(201);

    // Fire both dispense requests at the same time — no await between them.
    const [first, second] = await Promise.all([
      authed()
        .post('/api/dispense')
        .send({ productId, locationId, quantityUsed: 1 }),
      authed()
        .post('/api/dispense')
        .send({ productId, locationId, quantityUsed: 1 }),
    ]);

    const statuses = [first.status, second.status].sort();
    // One succeeds (201), one is rejected as insufficient stock (400) — never
    // 201/201, which would mean two units left the building with one in stock.
    expect(statuses).toEqual([201, 400]);

    const stockList = await authed()
      .get('/api/inventory')
      .query({ productId, locationId })
      .expect(200);
    const stockBody = stockList.body as { data: { quantity: number }[] };
    expect(stockBody.data).toHaveLength(1);
    // Never negative, and never still 1 (exactly one dispense should have gone through).
    expect(stockBody.data[0].quantity).toBe(0);
  });
});
