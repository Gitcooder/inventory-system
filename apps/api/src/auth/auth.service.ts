import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'crypto';
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { parseDurationMs } from '../common/duration.util';
import type { JwtPayload } from './strategies/jwt.strategy';

interface TokenPair {
  accessToken: string;
  refreshToken: string; // raw `${id}.${secret}` — caller sets this as an httpOnly cookie
  refreshTokenExpiresAt: Date;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.isActive) return null;

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return null;

    return { ...user, roleNames: user.roles.map((r) => r.role.name) };
  }

  async issueTokenPair(
    userId: number,
    email: string,
    roles: string[],
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, roles };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      // Cast: ConfigService returns a plain string; @nestjs/jwt wants the
      // branded '15m'/'7d'-style literal type from `ms`. The runtime value is
      // exactly that shape (see .env.example), so this is a type-level-only cast.
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_TTL',
      ) as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });

    const id = randomUUID();
    const secret = randomBytes(32).toString('hex');
    const ttlMs = parseDurationMs(this.config.get<string>('JWT_REFRESH_TTL')!);
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.refreshToken.create({
      data: { id, userId, tokenHash: hashSecret(secret), expiresAt },
    });

    return {
      accessToken,
      refreshToken: `${id}.${secret}`,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  /** Verifies + rotates a refresh token. Throws on invalid, expired, or reused tokens. */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const [id, secret] = (rawRefreshToken ?? '').split('.');
    if (!id || !secret)
      throw new UnauthorizedException('Malformed refresh token');

    const record = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!record)
      throw new UnauthorizedException('Refresh token not recognized');

    if (record.revokedAt) {
      // This token was already used once (or explicitly logged out). Seeing it
      // again means it leaked — burn every refresh token this user holds.
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Refresh token reuse detected — all sessions revoked',
      );
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!safeEqual(hashSecret(secret), record.tokenHash)) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user || !user.isActive)
      throw new UnauthorizedException('User no longer active');

    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(
      user.id,
      user.email,
      user.roles.map((r) => r.role.name),
    );
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (!rawRefreshToken) return;
    const [id] = rawRefreshToken.split('.');
    if (!id) return;
    await this.prisma.refreshToken
      .update({ where: { id }, data: { revokedAt: new Date() } })
      .catch(() => undefined); // already gone / already revoked — logout is idempotent
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already in use');
  }

  /**
   * Public self-registration (see AuthController — no auth required to call
   * this). Deliberately hardcodes the 'Customer' role rather than accepting
   * any role from the request body: letting a client pick their own role on
   * a public, unauthenticated endpoint would be a privilege-escalation path
   * straight to Admin. Every other role is assigned by an existing Admin via
   * UsersService.create() instead.
   */
  async register(dto: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }): Promise<{
    id: number;
    name: string;
    email: string;
    roleNames: string[];
  }> {
    await this.assertEmailAvailable(dto.email);
    const passwordHash = await this.hashPassword(dto.password);

    const customerRole = await this.prisma.role.findUnique({
      where: { name: 'Customer' },
    });
    if (!customerRole) {
      // Missing seed data is an operator setup problem, not something the
      // person registering can fix — surfaced as a 500, not a 4xx.
      throw new Error(
        "The 'Customer' role does not exist — has the seed script been run?",
      );
    }

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        roles: { create: [{ roleId: customerRole.id }] },
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleNames: ['Customer'],
    };
  }
}
