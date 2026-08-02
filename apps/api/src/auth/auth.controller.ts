import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/auth', // only sent to auth endpoints, not the whole API surface
      expires: expiresAt,
    });
  }

  // Tighter than the global 100/min default — login is the classic
  // brute-force target, so 5 attempts/min per IP is deliberately restrictive
  // even though it means a person fat-fingering their password five times
  // has to wait a minute. That tradeoff is the point.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const tokens = await this.auth.issueTokenPair(
      user.id,
      user.email,
      user.roleNames,
    );
    this.setRefreshCookie(
      res,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );

    return {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roleNames,
      },
    };
  }

  // Same reasoning as login: the one other unauthenticated write endpoint
  // in the whole system, and mass account creation is its own abuse vector.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.register(dto);
    const tokens = await this.auth.issueTokenPair(
      user.id,
      user.email,
      user.roleNames,
    );
    this.setRefreshCookie(
      res,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );

    return {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roleNames,
      },
    };
  }

  // Higher limit than login/register — this is called automatically by the
  // frontend's axios interceptor on every 401, not typed by a human, so it
  // needs real headroom. Still well under the global 100/min default.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const tokens = await this.auth.refresh(cookieToken ?? '');
    this.setRefreshCookie(
      res,
      tokens.refreshToken,
      tokens.refreshTokenExpiresAt,
    );
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(cookieToken);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  }
}
