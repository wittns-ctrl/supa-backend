import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  public readonly isConfigured: boolean;

  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const clientID =
      configService.get<string>('GOOGLE_CLIENT_ID')?.trim() || '';
    const clientSecret =
      configService.get<string>('GOOGLE_CLIENT_SECRET')?.trim() || '';
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_URL')?.trim() ||
      'http://localhost:3000/auth/google/callback';

    const configured = !!clientID && !!clientSecret;
    super({
      clientID: configured ? clientID : 'placeholder-client-id',
      clientSecret: configured ? clientSecret : 'placeholder-client-secret',
      callbackURL,
      scope: ['email', 'profile'],
    });

    this.isConfigured = configured;
    if (!configured) {
      this.logger.warn(
        'Google OAuth is not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). The Google login button will show a friendly error until credentials are added to the .env file.',
      );
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos } = profile;
    const email = emails?.[0]?.value;
    // Google returns a boolean, but older userinfo versions returned "true".
    const rawVerified = profile?._json?.email_verified;
    const emailVerified = rawVerified === true || rawVerified === 'true';
    const displayName =
      `${name?.givenName || ''} ${name?.familyName || ''}`.trim();
    const imageurl = photos?.[0]?.value;

    try {
      if (!email || !emailVerified) {
        throw new Error('Google did not provide a verified email address');
      }
      const result = await this.authService.oauthSignIn({
        email,
        name: displayName,
        imageurl,
        provider: 'google',
        providerId: profile.id,
      });
      done(null, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/ACCOUNT_BLOCKED/i.test(message)) {
        done(null, { authError: message });
      } else {
        done(err as Error, false);
      }
    }
  }
}
