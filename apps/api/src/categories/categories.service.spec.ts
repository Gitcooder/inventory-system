import { BadRequestException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

// NOTE: PrismaService types as `any` in this sandbox because its query engine
// binary couldn't be downloaded here (see README), so the mock below and its
// `as any` cast trigger @typescript-eslint/no-unsafe-* warnings that a real
// `npx prisma generate` resolves automatically — same root cause as every
// other file in this list, just showing up in a test double instead of a
// real call. Not disabling the rule project-wide for it; scoping to this file.
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

// Fixture hierarchy: 1 (root) <- 2 <- 3
type Row = { parentCategoryId: number | null };
const fixture: Record<number, Row> = {
  1: { parentCategoryId: null },
  2: { parentCategoryId: 1 },
  3: { parentCategoryId: 2 },
};

function buildMockPrisma() {
  return {
    category: {
      findUnique: jest.fn(({ where: { id } }: { where: { id: number } }) => {
        const row = fixture[id] as Row | undefined;
        return Promise.resolve(row ? { id, ...row } : null);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: number };
          data: Record<string, unknown>;
        }) => Promise.resolve({ id: where.id, ...data }),
      ),
    },
  } as any;
}

describe('CategoriesService — cycle detection', () => {
  it('allows moving a descendant up to a valid ancestor', async () => {
    const prisma = buildMockPrisma();
    const service = new CategoriesService(prisma);
    await expect(
      service.update(3, { parentCategoryId: 1 }),
    ).resolves.toMatchObject({
      id: 3,
      parentCategoryId: 1,
    });
  });

  it('rejects setting a parent to one of its own descendants', async () => {
    const prisma = buildMockPrisma();
    const service = new CategoriesService(prisma);
    // 1 is an ancestor of 3 (1 <- 2 <- 3); making 1's parent be 3 is a cycle.
    await expect(service.update(1, { parentCategoryId: 3 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a category being its own parent', async () => {
    const prisma = buildMockPrisma();
    const service = new CategoriesService(prisma);
    await expect(service.update(2, { parentCategoryId: 2 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a parent id that does not exist', async () => {
    const prisma = buildMockPrisma();
    const service = new CategoriesService(prisma);
    await expect(service.update(1, { parentCategoryId: 999 })).rejects.toThrow(
      BadRequestException,
    );
  });
});
