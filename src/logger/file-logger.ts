import { ConsoleLogger } from '@nestjs/common';
import { closeSync, mkdirSync, openSync, writeSync } from 'fs';
import { join, resolve } from 'path';
import { format } from 'util';

/**
 * Nest logger that mirrors every entry to the console (default output,
 * untouched) and appends it to logs/app-YYYY-MM-DD.log, rotating by day.
 * Activated via the NestFactory `logger` option in main.ts so even the
 * earliest bootstrap logs land in the file.
 */
export class FileLogger extends ConsoleLogger {
  private static readonly logDir = resolve(process.cwd(), 'logs');
  private static fd: number | null = null;
  private static fileDate = '';
  private static dirReady = false;

  /** Create the logs dir and persist uncaught crashes to the log file. */
  static init() {
    if (FileLogger.dirReady) return;
    try {
      mkdirSync(FileLogger.logDir, { recursive: true });
      FileLogger.dirReady = true;
    } catch {
      // e.g. read-only filesystem — console-only logging still works
      return;
    }

    // Log before exiting so crashes leave a trail on disk. Exiting (instead
    // of swallowing) preserves Node's default crash semantics — the process
    // manager / watcher restarts it.
    process.on('uncaughtException', (err: Error) => {
      FileLogger.writeToFile('FATAL', 'Process', format(err));
      process.exit(1);
    });
    process.on('unhandledRejection', (reason: unknown) => {
      FileLogger.writeToFile('FATAL', 'Process', format(reason));
      process.exit(1);
    });
  }

  private static writeToFile(
    level: string,
    context: string | undefined,
    message: string,
  ) {
    if (!FileLogger.dirReady) return;
    try {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      if (day !== FileLogger.fileDate || FileLogger.fd === null) {
        if (FileLogger.fd !== null) closeSync(FileLogger.fd);
        FileLogger.fd = openSync(
          join(FileLogger.logDir, `app-${day}.log`),
          'a',
        );
        FileLogger.fileDate = day;
      }
      const ctx = context ? ` [${context}]` : '';
      writeSync(
        FileLogger.fd,
        `${now.toISOString()} ${level}${ctx} ${message}\n`,
      );
    } catch {
      // never let logging take the app down
    }
  }

  private static serialize(messages: unknown[]): string {
    return messages
      .map((m) => (typeof m === 'string' ? m : format(m)))
      .join(' ');
  }

  private writeAll(level: string, messages: unknown[], context?: string) {
    FileLogger.writeToFile(
      level,
      context ?? this.context,
      FileLogger.serialize(messages),
    );
  }

  log(message: any, context?: string) {
    super.log(message, context);
    this.writeAll('LOG', [message], context);
  }

  warn(message: any, context?: string) {
    super.warn(message, context);
    this.writeAll('WARN', [message], context);
  }

  error(message: any, stackOrContext?: string, context?: string) {
    super.error(message, stackOrContext, context);
    const parts: unknown[] = [message];
    if (stackOrContext && stackOrContext.includes('\n'))
      parts.push(stackOrContext);
    this.writeAll('ERROR', parts, context);
  }

  debug(message: any, context?: string) {
    super.debug(message, context);
    this.writeAll('DEBUG', [message]);
  }

  verbose(message: any, context?: string) {
    super.verbose(message, context);
    this.writeAll('VERBOSE', [message]);
  }

  fatal(message: any, context?: string) {
    super.fatal(message, context);
    this.writeAll('FATAL', [message]);
  }
}
