import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvVars {
  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV?: NodeEnv = NodeEnv.Development;

  @IsOptional()
  @IsString()
  MONGO_URI?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters in production' })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH must be at least 32 characters in production' })
  JWT_REFRESH!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL?: string = '15m';

  @IsOptional()
  @IsString()
  JWT_REFRESH_TTL?: string = '7d';

  @IsOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  PORT?: number;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  STRIPE_PUBLISHABLE_KEY?: string;

  @IsOptional()
  @IsBoolean()
  SEED_DEMO_DATA?: boolean;
}

/**
 * Validates environment variables at boot. In production, any failure is fatal.
 * In development, only hard requirements (JWT secrets) are enforced, with a
 * short fallback warning for local convenience.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = String(config.NODE_ENV || 'development').toLowerCase();
  const isProd = nodeEnv === 'production' || nodeEnv === 'prod';

  // Provide dev-only fallbacks so local setup works out of the box.
  // These are NEVER applied in production — validation below will fail first.
  if (!isProd) {
    if (!config.JWT_SECRET) {
      config.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me-32chars';
    }
    if (!config.JWT_REFRESH) {
      config.JWT_REFRESH = 'dev-only-insecure-refresh-secret-change-32ch';
    }
  }

  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints || {}).join(', ')}`)
      .join('\n');
    throw new Error(
      isProd
        ? `FATAL: environment validation failed — refusing to start in production:\n${details}`
        : `Environment validation failed:\n${details}`,
    );
  }

  // Production hard requirements beyond the schema above
  if (isProd) {
    if (!config.MONGO_URI) {
      throw new Error('FATAL: MONGO_URI is required in production');
    }
    if (String(config.JWT_SECRET).length < 32) {
      throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production');
    }
    if (String(config.JWT_REFRESH).length < 32) {
      throw new Error('FATAL: JWT_REFRESH must be at least 32 characters in production');
    }
    if (/dev-only-insecure/.test(String(config.JWT_SECRET))) {
      throw new Error('FATAL: dev fallback JWT_SECRET detected in production');
    }
  }

  return config;
}

export function isProductionEnv(): boolean {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  return env === 'production' || env === 'prod';
}
