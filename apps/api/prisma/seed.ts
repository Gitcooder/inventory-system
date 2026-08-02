import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Permission codes, grouped by the resource they govern. Mirrors section 5.2
// of docs/architecture.md — extend this list as later phases add resources
// (e.g. 'location:manage' already here even though Locations ship in Phase 2).
const PERMISSIONS = [
  { code: 'product:create', description: 'Create catalog products' },
  { code: 'product:update', description: 'Edit catalog products' },
  { code: 'product:delete', description: 'Delete catalog products' },
  { code: 'product:view', description: 'View catalog products' },
  { code: 'category:manage', description: 'Manage categories' },
  { code: 'brand:manage', description: 'Manage brands' },
  { code: 'location:manage', description: 'Manage physical locations' },
  { code: 'stock:adjust', description: 'Restock/correct inventory levels' },
  { code: 'stock:view', description: 'View inventory stock levels' },
  { code: 'dispense:create', description: 'Dispense/check out product' },
  { code: 'dispense:view', description: 'View dispensing history' },
  { code: 'review:create', description: 'Submit a product review' },
  { code: 'review:moderate', description: 'Approve/reject product reviews' },
  { code: 'review:view', description: 'View product reviews' },
  { code: 'report:view', description: 'View usage/inventory reports' },
  { code: 'audit:view', description: 'View the system audit trail' },
  { code: 'user:manage', description: 'Create/edit users and assign roles' },
  { code: 'role:manage', description: 'Create/edit roles and permissions' },
];

// Separation of duties, per section 5.1: Employees dispense but can't see the
// audit trail or manage anything; Customers browse/review but never touch
// stock or dispensing.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  Admin: PERMISSIONS.map((p) => p.code), // full access
  Employee: [
    'product:view',
    'stock:view',
    'dispense:create',
    'dispense:view',
    'review:view',
  ],
  Customer: ['product:view', 'review:create', 'review:view'],
};

async function main() {
  console.log('Seeding permissions...');
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { description: p.description },
      create: p,
    });
  }

  console.log('Seeding roles + role-permission assignments...');
  for (const [roleName, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  console.log(`Seeding bootstrap admin user (${adminEmail})...`);
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Admin' } });
  const passwordHash = await argon2.hash(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'System Administrator',
      email: adminEmail,
      passwordHash,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  });

  console.log('Seed complete.');
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(
      `\n⚠  Using default admin password "${adminPassword}" — set SEED_ADMIN_PASSWORD before seeding a real environment.\n`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
