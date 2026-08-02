import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Proves the whole Phase 6 story end to end: a visitor can browse the
 * catalog with zero authentication, self-register as a Customer (and gets
 * exactly the Customer role, nothing more), submit a review that stays
 * invisible until an Admin approves it, and only then shows up on the public
 * listing.
 *
 * Same sandbox limitation as dispense-concurrency.e2e-spec.ts — no Postgres
 * available where this was written, so this has been lint-checked and
 * read-through but never executed. Run it yourself with `npm run test:e2e`
 * once your local DB is up and seeded (see README).
 */
describe('Customer flow (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  const suffix = Date.now();
  const customerEmail = `customer-${suffix}@example.com`;
  const customerPassword = 'hunter22222';

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

  it('lets an anonymous visitor browse products with no Authorization header at all', async () => {
    await request(app.getHttpServer()).get('/api/products').expect(200);
  });

  it('registers a customer with exactly the Customer role, never more', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: 'Test Customer',
        email: customerEmail,
        password: customerPassword,
      })
      .expect(201);

    const body = res.body as { accessToken: string; user: { roles: string[] } };
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.roles).toEqual(['Customer']);
  });

  it('rejects the new customer from an admin-only endpoint with 403, not 401 (they ARE authenticated)', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: customerEmail, password: customerPassword })
      .expect(201);
    const token = (login.body as { accessToken: string }).accessToken;

    await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('keeps a submitted review invisible until moderated, then shows it once approved', async () => {
    const server = app.getHttpServer();
    const admin = () =>
      request(server).set('Authorization', `Bearer ${adminToken}`);

    const brand = await admin()
      .post('/api/brands')
      .send({ name: `ReviewTestBrand-${suffix}` })
      .expect(201);
    const category = await admin()
      .post('/api/categories')
      .send({ name: `ReviewTestCategory-${suffix}` })
      .expect(201);
    const product = await admin()
      .post('/api/products')
      .send({
        skuCode: `REVIEW-TEST-${suffix}`,
        name: `Review Test Product ${suffix}`,
        brandId: (brand.body as { id: number }).id,
        categoryId: (category.body as { id: number }).id,
      })
      .expect(201);
    const productId = (product.body as { id: number }).id;

    const customerLogin = await request(server)
      .post('/api/auth/login')
      .send({ email: customerEmail, password: customerPassword })
      .expect(201);
    const customerToken = (customerLogin.body as { accessToken: string })
      .accessToken;

    const review = await request(server)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId,
        rating: 5,
        reviewText: 'Excellent, would restock again',
      })
      .expect(201);
    const reviewId = (review.body as { id: number; status: string }).id;
    expect((review.body as { status: string }).status).toBe('pending');

    // Still pending — must not appear on the public listing yet.
    const beforeApproval = await request(server)
      .get('/api/reviews')
      .query({ productId })
      .expect(200);
    expect((beforeApproval.body as { data: unknown[] }).data).toHaveLength(0);

    await admin()
      .patch(`/api/reviews/${reviewId}/moderate`)
      .send({ status: 'approved' })
      .expect(200);

    const afterApproval = await request(server)
      .get('/api/reviews')
      .query({ productId })
      .expect(200);
    const afterBody = afterApproval.body as { data: { id: number }[] };
    expect(afterBody.data.map((r) => r.id)).toContain(reviewId);
  });
});
