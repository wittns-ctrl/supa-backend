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
  OnModuleDestroy,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppleAuthService } from './apple-auth.service';
import { CreateAuthDto } from './dto/signup-auth.dto';
import { emailverificationDto } from './dto/emailVerification.dto';
import { loginAuthDto } from './dto/login-auth.dto';
import { ForgotAuthDto } from './dto/Forgot.dto';
import { resetAuthDto } from './dto/reset-auth.dto';
import { LogoutAuthDto } from './dto/Logout.dto';
import { AuthGuard } from '@nestjs/passport';
import { RefreshAuthDto } from './dto/refresh-auth.dto';
import type { Response } from 'express';
import { GoogleStrategy } from './strategies/google.strategy';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { randomUUID } from 'crypto';
import passport from 'passport';
import { OAuthStateService } from './oauth-state.service';

// Short-lived one-time codes for the OAuth code exchange flow. Tokens are
// never placed in the redirect URL — the frontend swaps a code for tokens.
const OAUTH_CODE_TTL_MS = 60_000;

interface PendingOAuthCode {
  result: { accessToken: string; refreshToken: string; user: unknown };
  expiresAt: number;
}

@Controller('auth')
export class AuthController implements OnModuleDestroy {
  private readonly logger = new Logger(AuthController.name);
  private googleConfigured: boolean;
  private pendingCodes = new Map<string, PendingOAuthCode>();
  private readonly codePurgeTimer: ReturnType<typeof setInterval>;

  constructor(
    private readonly authService: AuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly oauthState: OAuthStateService,
    @Optional() private readonly googleStrategy: GoogleStrategy,
  ) {
    this.googleConfigured = this.googleStrategy?.isConfigured ?? false;
    // Periodically purge expired codes to keep the map bounded
    this.codePurgeTimer = setInterval(() => {
      const now = Date.now();
      for (const [code, entry] of this.pendingCodes) {
        if (entry.expiresAt < now) this.pendingCodes.delete(code);
      }
    }, OAUTH_CODE_TTL_MS);
    this.codePurgeTimer.unref?.();
  }

  onModuleDestroy() {
    clearInterval(this.codePurgeTimer);
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signup(@Body() signupdto: CreateAuthDto) {
    return this.authService.createUser(signupdto);
  }

  @Post('verifyOtp')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() verifydto: emailverificationDto) {
    return this.authService.verifyOtp(verifydto);
  }

  @Post('resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendOtp(@Body() body: { email: string }) {
    return this.authService.resendOtp(body.email);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  Login(@Body() Logindto: loginAuthDto) {
    return this.authService.signin(Logindto);
  }

  @Post('forgot')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() forgetDto: ForgotAuthDto) {
    return this.authService.ForgotPassword(forgetDto);
  }

  @Post('reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetpassword(@Body() resetdto: resetAuthDto) {
    return this.authService.resetpassword(resetdto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(
    @Body() logoutdto: LogoutAuthDto,
    @CurrentUser() user: { id: string; email: string; role: string },
  ) {
    return this.authService.Logout(logoutdto, user);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  refresh(@Body() dto: RefreshAuthDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  // ──────────────────────────────────────────
  // One-time code exchange (tokens never in URL)
  // ──────────────────────────────────────────
  @Post('oauth/exchange')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  exchangeCode(@Body() body: { code: string }) {
    if (!body?.code) throw new BadRequestException('code is required');
    const entry = this.pendingCodes.get(body.code);
    if (!entry) {
      throw new UnauthorizedException('Invalid or expired OAuth code');
    }
    // One-time use
    this.pendingCodes.delete(body.code);
    if (entry.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired OAuth code');
    }
    return entry.result;
  }

  // ──────────────────────────────────────────
  // Google OAuth
  // ──────────────────────────────────────────
  @Get('google')
  googleAuth(@Req() req: any, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (!this.googleConfigured) {
      this.logger.warn('Google OAuth requested but GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set in .env');
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Google Sign In is not configured on the server. Please check backend .env configuration.')}`,
      );
    }
    // CSRF protection: a fresh one-time state is minted per request and sent
    // to Google as the OAuth2 `state` parameter. Google echoes it back on the
    // callback, where it is validated and burned (see googleCallback).
    const state = this.oauthState.issue();
    const authenticate = passport.authenticate('google', {
      session: false,
      state, // passport-oauth2 forwards caller-provided state to the provider
      scope: ['email', 'profile'],
    });
    authenticate(req, res, (err: any) => {
      // Only invoked on failure — on success passport has already redirected
      this.logger.warn('Google OAuth start failed', err);
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Could not start Google Sign In. Please try again.')}`,
      );
    });
  }

  @Get('google/callback')
  // Note: this @nestjs/passport version types AuthGuard with a single arg.
  // No express-session is installed, so passport's session mode is inert
  // anyway — the CSRF guarantee comes from the one-time state check below.
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query('state') state?: string,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    // The state MUST round-trip: absent, unknown, reused, or expired state
    // means the callback was forged or replayed — reject before trusting it.
    if (!state || !this.oauthState.consume(state)) {
      this.logger.warn('Google OAuth callback rejected: invalid or missing state');
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent('Invalid or expired OAuth state. Please try signing in again.')}`,
      );
    }
    return this.redirectOAuthResult(res, req.user);
  }

  // ──────────────────────────────────────────
  // Apple OAuth
  // ──────────────────────────────────────────
  @Get('apple')
  appleAuth(@Req() req: any, @Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      if (!this.appleAuthService.isConfigured()) {
        return res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent('Apple Sign In is not configured on the server')}`,
        );
      }
      // CSRF protection: per-request one-time state — Apple returns it in the
      // POST body of the callback, where it is validated and burned.
      const state = this.oauthState.issue();
      return res.redirect(this.appleAuthService.getAuthorizationUrl(state));
    } catch (err: any) {
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(err?.message || 'Apple Sign In failed')}`,
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
      if (!body.state || !this.oauthState.consume(body.state)) {
        this.logger.warn('Apple OAuth callback rejected: invalid or missing state');
        throw new Error('Invalid or expired OAuth state. Please try signing in again.');
      }
      const result = await this.appleAuthService.handleCallback(body);
      return this.redirectOAuthResult(res, result);
    } catch (err: any) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(err?.message || 'Apple Sign In failed')}`,
      );
    }
  }

  private redirectOAuthResult(
    res: Response,
    result?: { accessToken?: string; refreshToken?: string; user?: unknown },
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      if (!result?.accessToken || !result?.user) {
        return res.redirect(`${frontendUrl}/login?error=OAuth+failed`);
      }
      // One-time code instead of tokens in the URL — tokens no longer land in
      // browser history, logs, or Referer headers.
      const code = randomUUID();
      this.pendingCodes.set(code, {
        result: {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || '',
          user: result.user,
        },
        expiresAt: Date.now() + OAUTH_CODE_TTL_MS,
      });
      return res.redirect(`${frontendUrl}/auth/callback?code=${encodeURIComponent(code)}`);
    } catch {
      return res.redirect(`${frontendUrl}/login?error=OAuth+failed`);
    }
  }
}
