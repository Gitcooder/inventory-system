import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Same sandbox limitation as the other e2e specs — no Postgres available
 * where this was written, so this has been lint-checked and read-through but
 * never executed. Run it yourself with `npm run test:e2e` once your local DB
 * is up and seeded (see README).
 */
describe('Audit log & reports (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
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
    adminToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function admin() {
    return request(app.getHttpServer()).set(
      'Authorization',
      `Bearer ${adminToken}`,
    );
  }

  it('records an audit entry when a product is deactivated, and it shows up in the audit log', async () => {
    const brand = await admin()
      .post('/api/brands')
      .send({ name: `AuditTestBrand-${suffix}` })
      .expect(201);
    const category = await admin()
      .post('/api/categories')
      .send({ name: `AuditTestCategory-${suffix}` })
      .expect(201);
    const product = await admin()
      .post('/api/products')
      .send({
        skuCode: `AUDIT-TEST-${suffix}`,
        name: `Audit Test Product ${suffix}`,
        brandId: (brand.body as { id: number }).id,
        categoryId: (category.body as { id: number }).id,
      })
      .expect(201);
    const productId = (product.body as { id: number }).id;

    await admin()
      .patch(`/api/products/${productId}/status`)
      .send({ isActive: false })
      .expect(200);

    const auditLog = await admin()
      .get('/api/audit-log')
      .query({ action: 'product.status_change' })
      .expect(200);
    const entries = (
      auditLog.body as {
        data: { entityId: number; newValue: { isActive: boolean } }[];
      }
    ).data;
    const match = entries.find((e) => e.entityId === productId);
    expect(match).toBeDefined();
    expect(match?.newValue).toEqual({ isActive: false });
  });

  it('returns the product details aggregation with all expected sections', async () => {
    const brand = await admin()
      .post('/api/brands')
      .send({ name: `DetailsBrand-${suffix}` })
      .expect(201);
    const category = await admin()
      .post('/api/categories')
      .send({ name: `DetailsCategory-${suffix}` })
      .expect(201);
    const product = await admin()
      .post('/api/products')
      .send({
        skuCode: `DETAILS-TEST-${suffix}`,
        name: `Details Test Product ${suffix}`,
        brandId: (brand.body as { id: number }).id,
        categoryId: (category.body as { id: number }).id,
      })
      .expect(201);
    const productId = (product.body as { id: number }).id;

    const details = await admin()
      .get(`/api/products/${productId}/details`)
      .expect(200);
    const body = details.body as Record<string, unknown>;
    expect(body).toHaveProperty('product');
    expect(body).toHaveProperty('stockByLocation');
    expect(body).toHaveProperty('totalStock', 0);
    expect(body).toHaveProperty('usageSummary');
    expect(body).toHaveProperty('usageLedger');
    expect(body).toHaveProperty('adjustmentLedger');
    expect(body).toHaveProperty('reviewSummary');
  });

  it('serves the usage summary report as JSON and as a downloadable CSV', async () => {
    await admin().get('/api/reports/usage-summary').expect(200);

    const csvRes = await admin()
      .get('/api/reports/usage-summary/export')
      .expect(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.headers['content-disposition']).toContain('attachment');
    expect(csvRes.text.split('\r\n')[0]).toBe(
      'Product,SKU,Times Dispensed,Total Quantity Dispensed',
    );
  });
});
