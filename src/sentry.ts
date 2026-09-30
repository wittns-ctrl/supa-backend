/**
 * Optional Sentry error tracking.
 *
 * Disabled by default — nothing happens unless SENTRY_DSN is set in the
 * environment. To enable:
 *   1. npm install @sentry/node
 *   2. Set SENTRY_DSN=<your dsn> in .env (from https://sentry.io)
 *   3. Uncomment the two marked blocks below
 *
 * Everything is wrapped in try/catch so a missing package can never crash
 * the app — it just logs and continues untracked.
 */
export function initSentry(): void {
  if (!process.env.SENTRY_DSN) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    });
    // eslint-disable-next-line no-console
    console.log('Sentry initialized');
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      'SENTRY_DSN is set but @sentry/node is not installed — run: npm install @sentry/node',
    );
  }
}
