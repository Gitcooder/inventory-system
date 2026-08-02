import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Same sandbox-only Prisma-stub situation as the other *.service.spec.ts files.
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

function buildMockPrisma(
  opts: { emailTaken?: boolean; customerRoleExists?: boolean } = {},
) {
  const { emailTaken = false, customerRoleExists = true } = opts;
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(emailTaken ? { id: 1 } : null),
      create: jest.fn().mockResolvedValue({
        id: 99,
        name: 'Jane Doe',
        email: 'jane@example.com',
      }),
    },
    role: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          customerRoleExists ? { id: 3, name: 'Customer' } : null,
        ),
    },
  };
}

// register() never touches jwt/config directly — dummy stand-ins are enough.
const dummyJwt = {} as never;
const dummyConfig = {} as never;

describe('AuthService.register', () => {
  it('rejects an email that is already in use', async () => {
    const service = new AuthService(
      buildMockPrisma({ emailTaken: true }),
      dummyJwt,
      dummyConfig,
    );
    await expect(
      service.register({
        name: 'Jane',
        email: 'jane@example.com',
        password: 'hunter22222',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('assigns exactly the Customer role, regardless of what the caller might try to pass', async () => {
    const prisma = buildMockPrisma();
    const service = new AuthService(prisma, dummyJwt, dummyConfig);

    // RegisterDto has no role field at all — this proves the service itself
    // doesn't accept one even if something upstream forwarded extra fields.
    const result = await service.register({
      name: 'Jane',
      email: 'jane@example.com',
      password: 'hunter22222',
      // @ts-expect-error deliberately probing that an injected role is ignored
      roleNames: ['Admin'],
    });

    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { name: 'Customer' },
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ roles: { create: [{ roleId: 3 }] } }),
      }),
    );
    expect(result.roleNames).toEqual(['Customer']);
  });

  it('throws clearly if the Customer role is missing (seed not run)', async () => {
    const prisma = buildMockPrisma({ customerRoleExists: false });
    const service = new AuthService(prisma, dummyJwt, dummyConfig);
    await expect(
      service.register({
        name: 'Jane',
        email: 'jane@example.com',
        password: 'hunter22222',
      }),
    ).rejects.toThrow(/Customer/);
  });
});
