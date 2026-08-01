import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import { AuthService } from './auth.service';

export type AppleAuthConfig = {
  clientID: string;
  teamID: string;
  keyID: string;
  privateKey: string;
  callbackURL: string;
};

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  getConfig(): AppleAuthConfig | null {
    const clientID = this.configService.get<string>('APPLE_CLIENT_ID')?.trim();
    const teamID = this.configService.get<string>('APPLE_TEAM_ID')?.trim();
    const keyID = this.configService.get<string>('APPLE_KEY_ID')?.trim();
    const privateKeyRaw =
      this.configService.get<string>('APPLE_PRIVATE_KEY')?.trim() ||
      this.configService.get<string>('APPLE_KEY_CONTENTS')?.trim();
    const callbackURL =
      this.configService.get<string>('APPLE_CALLBACK_URL')?.trim() ||
      'http://localhost:3000/auth/apple/callback';

    if (!clientID || !teamID || !keyID || !privateKeyRaw) {
      return null;
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    return { clientID, teamID, keyID, privateKey, callbackURL };
  }

  isConfigured(): boolean {
    return this.getConfig() !== null;
  }

  getAuthorizationUrl(state?: string): string {
    const config = this.getConfig();
    if (!config) {
      throw new Error('Apple Sign In is not configured');
    }

    return appleSignin.getAuthorizationUrl({
      clientID: config.clientID,
      redirectUri: config.callbackURL,
      scope: 'name email',
      responseMode: 'form_post',
      state: state || 'supameal',
    });
  }

  private getClientSecret(config: AppleAuthConfig): string {
    return appleSignin.getClientSecret({
      clientID: config.clientID,
      teamID: config.teamID,
      privateKey: config.privateKey,
      keyIdentifier: config.keyID,
      expAfter: 15777000,
    });
  }

  async handleCallback(body: {
    code?: string;
    id_token?: string;
    user?: string;
    error?: string;
  }) {
    if (body.error) {
      throw new Error(body.error);
    }

    const config = this.getConfig();
    if (!config) {
      throw new Error('Apple Sign In is not configured');
    }

    if (!body.code && !body.id_token) {
      throw new Error('Missing Apple authorization code');
    }

    let idToken = body.id_token;
    let accessToken: string | undefined;

    if (body.code) {
      const tokenResponse = await appleSignin.getAuthorizationToken(body.code, {
        clientID: config.clientID,
        redirectUri: config.callbackURL,
        clientSecret: this.getClientSecret(config),
      });
      idToken = tokenResponse.id_token || idToken;
      accessToken = tokenResponse.access_token;
    }

    if (!idToken) {
      throw new Error('Apple did not return an identity token');
    }

    const claims = await appleSignin.verifyIdToken(idToken, {
      audience: config.clientID,
      ignoreExpiration: false,
    });

    let firstName = '';
    let lastName = '';
    let emailFromUserPayload = '';

    if (body.user) {
      try {
        const parsed = typeof body.user === 'string' ? JSON.parse(body.user) : body.user;
        firstName = parsed?.name?.firstName || '';
        lastName = parsed?.name?.lastName || '';
        emailFromUserPayload = parsed?.email || '';
      } catch (err) {
        this.logger.warn(`Failed to parse Apple user payload: ${err}`);
      }
    }

    const email = claims.email || emailFromUserPayload;
    if (!email) {
      throw new Error('Apple account did not provide an email address');
    }

    const displayName =
      `${firstName} ${lastName}`.trim() || email.split('@')[0] || 'Apple User';

    return this.authService.oauthSignIn({
      email,
      name: displayName,
      provider: 'apple',
      providerId: claims.sub,
    });
  }
}
