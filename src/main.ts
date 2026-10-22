import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded, static as expressStatic } from 'express';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { isProductionEnv } from './config/env.validation';
import { UPLOAD_DIR } from './uploads/uploads.controller';
import { FileLogger } from './logger/file-logger';
import { initSentry } from './sentry';

function parseCorsOrigins(): (string | RegExp)[] {
  const isProd = isProductionEnv();
  const rawRaw = process.env.CORS_ORIGINS;
  const isDefault = !rawRaw;
  const raw =
    rawRaw ||
    'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173';

  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (s.startsWith('/') && s.endsWith('/')) {
        return new RegExp(s.slice(1, -1));
      }
      return s.replace(/\/+$/, '');
    });

  if (isProd && isDefault) {
    const logger = new Logger('CORS');
    logger.warn(
      'NODE_ENV=production but CORS_ORIGINS not explicitly set — default localhost origins have been filtered. ' +
        'Please set CORS_ORIGINS comma-separated for your real frontend domains.',
    );
    return origins.filter((o) => {
      if (typeof o !== 'string') return true;
      const low = o.toLowerCase();
      if (
        low.includes('localhost') ||
        low.includes('127.0.0.1') ||
        low.includes('0.0.0.0')
      ) {
        return false;
      }
      return true;
    });
  }
  return origins;
}

async function bootstrap() {
  // Error tracking — no-op unless SENTRY_DSN is configured (see src/sentry.ts)
  initSentry();

  // Console + persistent file logging (logs/app-YYYY-MM-DD.log). Passed to
  // NestFactory so every Nest log — including early bootstrap — is captured.
  FileLogger.init();
  const fileLogger = new FileLogger();

  const logger = new Logger('Bootstrap');
  const isProd = isProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: fileLogger,
  });

  if (isProd) {
    app.use(
      helmet({
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            'default-src': ["'self'"],
            'script-src': [
              "'self'",
              '*.paypal.com',
              '*.paypalobjects.com',
              'https://accounts.google.com',
            ],
            'style-src': [
              "'self'",
              "'unsafe-inline'",
              '*.paypal.com',
              '*.paypalobjects.com',
              'https://fonts.googleapis.com',
            ],
            'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
            'img-src': ["'self'", 'data:', 'https:'],
            'frame-src': [
              "'self'",
              '*.paypal.com',
              '*.paypalobjects.com',
              'https://accounts.google.com',
              'https://appleid.apple.com',
            ],
            'child-src': ["'self'", '*.paypal.com', '*.paypalobjects.com'],
            'connect-src': [
              "'self'",
              '*.paypal.com',
              '*.paypalobjects.com',
              'https://identitytoolkit.googleapis.com',
              'https://securetoken.googleapis.com',
            ],
          },
        },
        frameguard: { action: 'deny' },
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      }),
    );
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: false,
        frameguard: false,
        hsts: false,
        crossOriginEmbedderPolicy: false,
      }),
    );
  }

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true }));

  // ── Multipart (image uploads) ────────────────────────────────────────────
  // Nest's FileInterceptor handles multipart routes itself; this catch-all
  // just ensures non-multipart requests without a body parser don't hang.
  // ── Static serving of uploaded images ────────────────────────────────────
  // Served by the API so a single origin works; swap for S3/Cloudinary URLs
  // later without frontend changes (just swap the stored URL values).
  mkdirSync(UPLOAD_DIR, { recursive: true });
  // fallthrough stays ON: GET requests for existing files are served here,
  // everything else (e.g. POST /uploads) falls through to the Nest router.
  app.use(
    '/uploads',
    expressStatic(resolve(UPLOAD_DIR), {
      maxAge: '7d',
      immutable: false,
    }),
  );

  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // NOTE: implicit conversion disabled — it silently coerces types and
      // undermines class-validator constraints. DTOs use @Type(() => Number)
      // where numeric conversion is needed.
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Graceful shutdown — let in-flight requests drain on SIGTERM/SIGINT
  app.enableShutdownHooks();

  // Reverse-proxy awareness (nginx, Cloudflare, Railway, Render, Fly…).
  // Without this, req.ip is the proxy's IP and the throttler rate-limits
  // ALL users collectively. Set TRUST_PROXY=false to disable, TRUST_PROXY=loopback
  // (default), or an integer hop count / comma-separated IPs for chained proxies.
  const trustProxy = process.env.TRUST_PROXY ?? 'loopback';
  if (trustProxy.toLowerCase() !== 'false') {
    app.set(
      'trust proxy',
      /^-?\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
    logger.log(`Trust proxy enabled: ${trustProxy}`);
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port,'0.0.0.0');
  logger.log(
    `🚀 SupaMeal API listening on port ${port} (${isProd ? 'production' : 'development'})`,
  );
}

void bootstrap();
