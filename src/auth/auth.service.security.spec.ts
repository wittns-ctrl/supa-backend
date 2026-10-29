import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { escapeRegExp } from 'src/common/utils/regex.util';

// Make bcrypt.compare observable without changing its behaviour.
jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs');
  return { ...actual, compare: jest.fn(actual.compare) };
});

/** A Mongoose-like query: awaitable AND exposing .exec(). */
function query<T>(result: T) {
  return {
    exec: () => Promise.resolve(result),
    then: (resolve: (v: T) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
}

function build(userModel: Record<string, jest.Mock>) {
  const mail = {
    sendResetEmail: jest.fn().mockResolvedValue(undefined),
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed-token') };
  const service = new AuthService(
    userModel as never,
    {} as never,
    jwt as never,
    mail as never,
  );
  return { service, mail, jwt };
}

describe('AuthService security regressions', () => {
  beforeAll(() => {
    process.env.JWT_REFRESH = 'test-refresh-secret-test-refresh-secret';
  });

  describe('email lookup (regex injection)', () => {
    it('escapes every regex metacharacter', () => {
      expect(escapeRegExp('a|x@evil.com')).toBe('a\\|x@evil\\.com');
      expect(escapeRegExp('a+b(c)*[d]^$')).toBe('a\\+b\\(c\\)\\*\\[d\\]\\^\\$');
    });

    it('cannot be used to match another account via the legacy fallback', async () => {
      const findOne = jest.fn(() => query(null));
      const { service } = build({ findOne });

      await service.ForgotPassword({ email: 'a|x@evil.com' } as never);

      // 1st call = exact match, 2nd = legacy case-insensitive fallback
      expect(findOne).toHaveBeenCalledTimes(2);
      const fallback = (findOne.mock.calls as unknown[][])[1][0] as {
        email: { $regex: RegExp };
      };
      const pattern = fallback.email.$regex;
      expect(pattern.test('alice@example.com')).toBe(false);
      expect(pattern.test('a|x@evil.com')).toBe(true);
    });

    it('skips the full-scan fallback once no legacy mixed-case emails exist', async () => {
      const findOne = jest.fn(() => query(null));
      const exists = jest.fn().mockResolvedValue(null);
      const { service } = build({ findOne, exists });

      await service.onModuleInit();
      await service.ForgotPassword({ email: 'someone@example.com' } as never);

      expect(findOne).toHaveBeenCalledTimes(1);
    });

    it('sends the reset link to the stored address, never the raw input', async () => {
      const victim = {
        email: 'victim@example.com',
        save: jest.fn().mockResolvedValue(undefined),
      };
      const findOne = jest.fn(() => query(victim));
      const { service, mail } = build({ findOne });

      await service.ForgotPassword({ email: 'Victim@Example.com' } as never);

      expect(mail.sendResetEmail).toHaveBeenCalledWith(
        'victim@example.com',
        expect.stringContaining('/reset-password?token='),
      );
    });
  });

  describe('signin', () => {
    it('still performs a bcrypt comparison when the account does not exist', async () => {
      const compare = bcrypt.compare as unknown as jest.Mock;
      compare.mockClear();
      const findOne = jest.fn(() => query(null));
      const { service } = build({ findOne });

      await expect(
        service.signin({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(compare).toHaveBeenCalledTimes(1);
    });
  });

  describe('oauthSignIn (pre-hijack defence)', () => {
    function existingUser(overrides: Record<string, unknown>) {
      const doc: Record<string, any> = {
        _id: { toString: () => 'user-1' },
        email: 'owner@example.com',
        role: 'customer',
        accountType: 'customer',
        status: 'active',
        authSessions: [],
        save: jest.fn().mockResolvedValue(undefined),
        toObject() {
          return { _id: doc._id, email: doc.email, accountType: 'customer' };
        },
        ...overrides,
      };
      return doc;
    }

    it('drops a planted password/OTP/session when Google verifies an unverified signup', async () => {
      const planted = existingUser({
        isVerified: false,
        password: 'attacker-chosen-hash',
        emailVerificationOtp: 'otp-hash',
        resetToken: 'reset-hash',
        authSessions: [{ sessionId: 'attacker-session' }],
      });
      const { service } = build({ findOne: jest.fn(() => query(planted)) });

      await service.oauthSignIn({
        email: 'owner@example.com',
        name: 'Real Owner',
        provider: 'google',
        providerId: 'g-123',
      });

      expect(planted.isVerified).toBe(true);
      expect(planted.password).toBeUndefined();
      expect(planted.emailVerificationOtp).toBeUndefined();
      expect(planted.resetToken).toBeUndefined();
      expect(planted.oauthProviderId).toBe('g-123');
      // only the session issued by this sign-in survives
      expect(
        planted.authSessions.some(
          (s: { sessionId: string }) => s.sessionId === 'attacker-session',
        ),
      ).toBe(false);
    });

    it('keeps the password of an already-verified account', async () => {
      const verified = existingUser({
        isVerified: true,
        password: 'real-hash',
      });
      const { service } = build({ findOne: jest.fn(() => query(verified)) });

      await service.oauthSignIn({
        email: 'owner@example.com',
        name: 'Real Owner',
        provider: 'google',
        providerId: 'g-123',
      });

      expect(verified.password).toBe('real-hash');
    });

    it('rejects a different Google subject for an already-linked email', async () => {
      const linked = existingUser({
        isVerified: true,
        oauthProvider: 'google',
        oauthProviderId: 'original-subject',
      });
      const { service } = build({ findOne: jest.fn(() => query(linked)) });

      await expect(
        service.oauthSignIn({
          email: 'owner@example.com',
          name: 'Someone Else',
          provider: 'google',
          providerId: 'different-subject',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
