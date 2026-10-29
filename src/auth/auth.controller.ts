import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  Logger,
  Optional,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppleAuthService } from './apple-auth.service';
import { CreateAuthDto } from './dto/signup-auth.dto';
import { emailverificationDto } from './dto/emailVerification.dto';
import { loginAuthDto } from './dto/login-auth.dto';
import { ForgotAuthDto } from './dto/Forgot.dto';
import { resetAuthDto } from './dto/reset-auth.dto';
import type { Response } from 'express';
import { GoogleStrategy } from './strategies/google.strategy';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OAuthCodeRecord } from './schema/oauth-record.schema';
import passport from 'passport';
import { OAuthStateService, OAuthRole } from './oauth-state.service';
import { isProductionEnv } from 'src/config/env.validation';
import { AuthAccountType } from 'src/users/schema/user.schema';
import { CreateOwnerAuthDto } from './dto/owner-signup-auth.dto';

// Short-lived one-time codes for the OAuth code exchange flow. Tokens are
// never placed in the redirect URL — the frontend swaps a code for tokens.
const OAUTH_CODE_TTL_MS = 60_000;
const REFRESH_COOKIE_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || 'http://localhost:5173')
    .trim()
    .replace(/\/+$/, '');
}

function loginPageFor(role: OAuthRole): string {
  return role === 'owner' ? '/owner-login' : '/login';
}

function refreshCookieMaxAge(): number {
  const value = process.env.JWT_REFRESH_TTL || '7d';
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) return REFRESH_COOKIE_DEFAULT_MS;
  const scale: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(match[1]) * scale[match[2]];
}

function refreshCookieOptions() {
  const configured = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
  const sameSite = ['strict', 'none'].includes(configured) ? configured : 'lax';
  return {
    httpOnly: true,
    secure: isProductionEnv() || sameSite === 'none',
    sameSite: sameSite as 'lax' | 'strict' | 'none',
    path: '/auth',
  };
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private googleConfigured: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly oauthState: OAuthStateService,
    @InjectModel(OAuthCodeRecord.name)
    private readonly oauthCodeModel: Model<OAuthCodeRecord>,
    @Optional() private readonly googleStrategy: GoogleStrategy,
  ) {
    this.googleConfigured = this.googleStrategy?.isConfigured ?? false;
  }

  private readCookie(req: any, name: string): string | undefined {
    const header = String(req?.headers?.cookie || '');
    const value = header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    if (!value) return undefined;
    try {
      return decodeURIComponent(value.slice(name.length + 1));
    } catch {
      return undefined;
    }
  }

  private assertTrustedOrigin(req: any) {
    const origin = req?.headers?.origin;
    const configuredOrigins = (
      process.env.CORS_ORIGINS ||
      process.env.FRONTEND_URL ||
      'http://localhost:5173'
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value).origin;
        } catch {
          return value.replace(/\/+$/, '');
        }
      });
    if (!origin || !configuredOrigins.includes(origin)) {
      throw new UnauthorizedException('Untrusted request origin');
    }
  }

  private refreshCookieName(accountType: AuthAccountType) {
    return `supa_refresh_${accountType}`;
  }

  private authResponse(
    res: Response,
    result: any,
    accountType = AuthAccountType.CUSTOMER,
  ) {
    if (result?.refreshToken) {
      res.cookie(this.refreshCookieName(accountType), result.refreshToken, {
        ...refreshCookieOptions(),
        maxAge: refreshCookieMaxAge(),
      });
    }
    const body = { ...(result || {}) };
    delete body.refreshToken;
    return body;
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(@Body() signupdto: CreateAuthDto) {
    return this.authService.createUser(signupdto);
  }

  @Post('customer/signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  customerSignup(@Body() signupdto: CreateAuthDto) {
    return this.authService.createUser(signupdto);
  }

  @Post('owner/signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  ownerSignup(@Body() signupdto: CreateOwnerAuthDto) {
    return this.authService.createOwnerAccount(signupdto);
  }

  @Post('verifyOtp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyOtp(
    @Body() verifydto: emailverificationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authResponse(
      res,
      await this.authService.verifyOtp(verifydto, AuthAccountType.CUSTOMER),
    );
  }

  @Post('owner/verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyOwnerOtp(
    @Body() dto: emailverificationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authResponse(
      res,
      await this.authService.verifyOtp(dto, AuthAccountType.OWNER),
      AuthAccountType.OWNER,
    );
  }

  @Post('resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendOtp(@Body() body: ForgotAuthDto) {
    return this.authService.resendOtp(body.email, AuthAccountType.CUSTOMER);
  }

  @Post('owner/resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendOwnerOtp(@Body() body: ForgotAuthDto) {
    return this.authService.resendOtp(body.email, AuthAccountType.OWNER);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async Login(
    @Body() Logindto: loginAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authResponse(
      res,
      await this.authService.signin(Logindto, AuthAccountType.CUSTOMER),
    );
  }

  @Post('customer/login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async customerLogin(
    @Body() dto: loginAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authResponse(
      res,
      await this.authService.signin(dto, AuthAccountType.CUSTOMER),
    );
  }

  @Post('owner/login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async ownerLogin(
    @Body() dto: loginAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authResponse(
      res,
      await this.authService.signin(dto, AuthAccountType.OWNER),
      AuthAccountType.OWNER,
    );
  }

  @Post('admin/login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async adminLogin(
    @Body() dto: loginAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authResponse(
      res,
      await this.authService.signin(dto, AuthAccountType.ADMIN),
      AuthAccountType.ADMIN,
    );
  }

  @Post('forgot')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() forgetDto: ForgotAuthDto) {
    return this.authService.ForgotPassword(forgetDto, AuthAccountType.CUSTOMER);
  }

  @Post('owner/forgot')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  ownerForgotPassword(@Body() dto: ForgotAuthDto) {
    return this.authService.ForgotPassword(dto, AuthAccountType.OWNER);
  }

  @Post('admin/forgot')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  adminForgotPassword(@Body() dto: ForgotAuthDto) {
    return this.authService.ForgotPassword(dto, AuthAccountType.ADMIN);
  }

  @Post('reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetpassword(
    @Body() resetdto: resetAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetpassword(
      resetdto,
      AuthAccountType.CUSTOMER,
    );
    res.clearCookie(
      this.refreshCookieName(AuthAccountType.CUSTOMER),
      refreshCookieOptions(),
    );
    return result;
  }

  @Post('owner/reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetOwnerPassword(
    @Body() dto: resetAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetpassword(
      dto,
      AuthAccountType.OWNER,
    );
    res.clearCookie(
      this.refreshCookieName(AuthAccountType.OWNER),
      refreshCookieOptions(),
    );
    return result;
  }

  @Post('admin/reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetAdminPassword(
    @Body() dto: resetAuthDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetpassword(
      dto,
      AuthAccountType.ADMIN,
    );
    res.clearCookie(
      this.refreshCookieName(AuthAccountType.ADMIN),
      refreshCookieOptions(),
    );
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser()
    user: {
      id: string;
      email: string;
      role: string;
      sessionId: string;
      accountType: AuthAccountType;
    },
  ) {
    res.clearCookie(
      this.refreshCookieName(user.accountType),
      refreshCookieOptions(),
    );
    return this.authService.Logout({}, user);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    return this.refreshRealm(req, res, AuthAccountType.CUSTOMER);
  }

  @Post('owner/refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  ownerRefresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    return this.refreshRealm(req, res, AuthAccountType.OWNER);
  }

  @Post('admin/refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  adminRefresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    return this.refreshRealm(req, res, AuthAccountType.ADMIN);
  }

  private async refreshRealm(
    req: any,
    res: Response,
    accountType: AuthAccountType,
  ) {
    this.assertTrustedOrigin(req);
    const cookieName = this.refreshCookieName(accountType);
    const refreshToken = this.readCookie(req, cookieName);
    if (!refreshToken)
      throw new UnauthorizedException('Refresh session is missing');
    try {
      return this.authResponse(
        res,
        await this.authService.refreshAccessToken(refreshToken, accountType),
        accountType,
      );
    } catch (error) {
      res.clearCookie(cookieName, refreshCookieOptions());
      throw error;
    }
  }

  // ──────────────────────────────────────────
  // One-time code exchange (tokens never in URL)
  // ──────────────────────────────────────────
  @Post('oauth/exchange')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async exchangeCode(
    @Body() body: { code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.code || typeof body.code !== 'string' || body.code.length > 100)
      throw new BadRequestException('code is required');
    const codeHash = createHash('sha256').update(body.code).digest('hex');
    const entry = await this.oauthCodeModel
      .findOneAndDelete({
        codeHash,
        expiresAt: { $gt: new Date() },
      })
      .exec();
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired OAuth code');
    }
    return this.authResponse(res, entry.result);
  }

  // ──────────────────────────────────────────
  // Google OAuth
  // ──────────────────────────────────────────
  @Get('google')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async googleAuth(@Req() req: any, @Res() res: Response) {
    const redirectBase = frontendUrl();
    const role: OAuthRole = req.query?.role === 'owner' ? 'owner' : 'customer';
    const errorPage = loginPageFor(role);
    if (!this.googleConfigured) {
      this.logger.warn(
        'Google OAuth requested but GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set in .env',
      );
      return res.redirect(
        `${redirectBase}${errorPage}?error=${encodeURIComponent('Google Sign In is not configured on the server. Please check backend environment configuration.')}`,
      );
    }
    // CSRF protection: a fresh one-time state is minted per request and sent
    // to Google as the OAuth2 `state` parameter. Google echoes it back on the
    // callback, where it is validated and burned (see googleCallback).
    let state: string;
    try {
      state = await this.oauthState.issue(role);
    } catch (err) {
      this.logger.error('Could not persist OAuth state', err as Error);
      return res.redirect(
        `${redirectBase}${errorPage}?error=${encodeURIComponent('Could not start Google Sign In. Please try again.')}`,
      );
    }
    const authenticate = passport.authenticate('google', {
      session: false,
      state, // passport-oauth2 forwards caller-provided state to the provider
      scope: ['email', 'profile'],
      prompt: 'select_account', // let users on shared devices pick the account
    } as any);
    authenticate(req, res, (err: any) => {
      // Only invoked on failure — on success passport has already redirected
      this.logger.warn('Google OAuth start failed', err);
      return res.redirect(
        `${redirectBase}${errorPage}?error=${encodeURIComponent('Could not start Google Sign In. Please try again.')}`,
      );
    });
  }

  @Get('google/callback')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  // Note: this @nestjs/passport version types AuthGuard with a single arg.
  // No express-session is installed, so passport's session mode is inert
  // anyway — the CSRF guarantee comes from the one-time state check below.
  async googleCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query('state') state?: string,
  ) {
    const redirectBase = frontendUrl();
    // The state MUST round-trip: absent, unknown, reused, or expired state
    // means the callback was forged or replayed — reject before trusting it.
    let flow: { role: OAuthRole } | null = null;
    try {
      flow = state ? await this.oauthState.consumeWithRole(state) : null;
    } catch (err) {
      this.logger.error('Could not validate OAuth state', err as Error);
    }
    if (!flow) {
      this.logger.warn(
        'Google OAuth callback rejected: invalid or missing state',
      );
      return res.redirect(
        `${redirectBase}/login?error=${encodeURIComponent('Invalid or expired OAuth state. Please try signing in again.')}`,
      );
    }
    const errorPage = loginPageFor(flow.role);
    // The user pressed "Cancel" on Google's consent screen (or Google refused).
    if (req.query?.error) {
      const message =
        req.query.error === 'access_denied'
          ? 'Google sign-in was cancelled.'
          : 'Google sign-in failed. Please try again.';
      return res.redirect(
        `${redirectBase}${errorPage}?error=${encodeURIComponent(message)}`,
      );
    }
    // State was validated and consumed above, before Passport exchanges
    // Google's code, so a forged callback can't create a login session.
    return passport.authenticate(
      'google',
      { session: false },
      (err: any, user: any) => {
        if (err || !user) {
          this.logger.warn('Google OAuth callback failed', err);
          return res.redirect(
            `${redirectBase}${errorPage}?error=${encodeURIComponent('Google sign-in failed. Please try again.')}`,
          );
        }
        return this.redirectOAuthResult(res, user, errorPage);
      },
    )(req, res);
  }

  // ──────────────────────────────────────────
  // Apple OAuth
  // ──────────────────────────────────────────
  @Get('apple')
  async appleAuth(@Req() req: any, @Res() res: Response) {
    const redirectBase = frontendUrl();
    try {
      if (!this.appleAuthService.isConfigured()) {
        return res.redirect(
          `${redirectBase}/login?error=${encodeURIComponent('Apple Sign In is not configured on the server')}`,
        );
      }
      // CSRF protection: per-request one-time state — Apple returns it in the
      // POST body of the callback, where it is validated and burned.
      const state = await this.oauthState.issue();
      return res.redirect(this.appleAuthService.getAuthorizationUrl(state));
    } catch (err: any) {
      return res.redirect(
        `${redirectBase}/login?error=${encodeURIComponent(err?.message || 'Apple Sign In failed')}`,
      );
    }
  }

  @Post('apple/callback')
  async appleCallback(
    @Body()
    body: {
      code?: string;
      id_token?: string;
      user?: string;
      state?: string;
      error?: string;
    },
    @Req() req: any,
    @Res() res: Response,
  ) {
    try {
      // State is mandatory: Apple always echoes it back. Anything missing,
      // unknown, reused, or expired is a forged/replayed callback.
      if (!body.state || !(await this.oauthState.consume(body.state))) {
        this.logger.warn(
          'Apple OAuth callback rejected: invalid or missing state',
        );
        throw new Error(
          'Invalid or expired OAuth state. Please try signing in again.',
        );
      }
      const result = await this.appleAuthService.handleCallback(body);
      return this.redirectOAuthResult(res, result);
    } catch (err: any) {
      const redirectBase = frontendUrl();
      return res.redirect(
        `${redirectBase}/login?error=${encodeURIComponent(err?.message || 'Apple Sign In failed')}`,
      );
    }
  }

  private async redirectOAuthResult(
    res: Response,
    result?: {
      accessToken?: string;
      refreshToken?: string;
      user?: unknown;
      authError?: string;
    },
    errorPage = '/login',
  ) {
    const redirectBase = frontendUrl();
    try {
      if (result?.authError) {
        return res.redirect(
          `${redirectBase}${errorPage}?error=${encodeURIComponent(result.authError)}`,
        );
      }
      if (!result?.accessToken || !result?.user) {
        return res.redirect(`${redirectBase}${errorPage}?error=OAuth+failed`);
      }
      // One-time code instead of tokens in the URL — tokens no longer land in
      // browser history, logs, or Referer headers.
      const code = randomUUID();
      await this.oauthCodeModel.create({
        codeHash: createHash('sha256').update(code).digest('hex'),
        result: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || '',
          user: result.user,
        },
        expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
      });
      return res.redirect(
        `${redirectBase}/auth/callback?code=${encodeURIComponent(code)}`,
      );
    } catch {
      return res.redirect(`${redirectBase}${errorPage}?error=OAuth+failed`);
    }
  }
}
