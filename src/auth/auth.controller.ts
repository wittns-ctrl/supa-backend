import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  Logger,
  Optional,
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
import type { Response } from 'express';
import { GoogleStrategy } from './strategies/google.strategy';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private googleConfigured: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly appleAuthService: AppleAuthService,
    @Optional() private readonly googleStrategy: GoogleStrategy,
  ) {
    this.googleConfigured = this.googleStrategy?.isConfigured ?? false;
  }

  @Post('signup')
  signup(@Body() signupdto: CreateAuthDto) {
    return this.authService.createUser(signupdto);
  }

  @Post('verifyOtp')
  verifyOtp(@Body() verifydto: emailverificationDto) {
    return this.authService.verifyOtp(verifydto);
  }

  @Post('resend-otp')
  resendOtp(@Body() body: { email: string }) {
    return this.authService.resendOtp(body.email);
  }

  @Post('login')
  Login(@Body() Logindto: loginAuthDto) {
    return this.authService.signin(Logindto);
  }

  @Post('forgot')
  forgotPassword(@Body() forgetDto: ForgotAuthDto) {
    return this.authService.ForgotPassword(forgetDto);
  }

  @Post('reset')
  resetpassword(@Body() resetdto: resetAuthDto) {
    return this.authService.resetpassword(resetdto);
  }

  @Post('logout')
  logout(@Body() logoutdto: LogoutAuthDto) {
    return this.authService.Logout(logoutdto);
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
    // When configured, let the Passport guard take over via internal redirect trick.
    // We manually trigger the strategy through the AuthGuard via URL redirect.
    return res.redirect('/auth/google/guard');
  }

  @Get('google/guard')
  @UseGuards(AuthGuard('google'))
  googleAuthGuard() {
    // Passport handles the redirect to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    return this.redirectOAuthResult(res, req.user);
  }

  // ──────────────────────────────────────────
  // Apple OAuth
  // ──────────────────────────────────────────
  @Get('apple')
  appleAuth(@Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      if (!this.appleAuthService.isConfigured()) {
        return res.redirect(
          `${frontendUrl}/login?error=${encodeURIComponent('Apple Sign In is not configured on the server')}`,
        );
      }
      return res.redirect(this.appleAuthService.getAuthorizationUrl());
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
      error?: string;
    },
    @Res() res: Response,
  ) {
    try {
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
      const userEncoded = encodeURIComponent(JSON.stringify(result.user));
      return res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken || ''}&user=${userEncoded}`,
      );
    } catch {
      return res.redirect(`${frontendUrl}/login?error=OAuth+failed`);
    }
  }
}
