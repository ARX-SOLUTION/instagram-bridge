import {
  Injectable,
  Logger,
  NestMiddleware,
  RawBodyRequest,
} from '@nestjs/common';
import { IncomingHttpHeaders } from 'node:http';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly maxLogLength = 10000;
  private readonly maxFieldLength = 1000;
  private readonly sensitiveFieldKeywords = [
    'authorization',
    'token',
    'secret',
    'password',
    'cookie',
    'signature',
  ];

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    const { method, originalUrl } = req;
    const userAgent = req.get('user-agent') ?? '';
    const ip = req.ip ?? '';

    const rawRequest = req as RawBodyRequest<Request>;
    const rawBody = rawRequest.rawBody?.toString('utf8');

    this.logger.log(
      `${method} ${originalUrl} -> request ${this.toLogString({
        ip,
        userAgent,
        params: this.sanitizeValue(req.params),
        query: this.sanitizeValue(req.query),
        headers: this.sanitizeHeaders(req.headers),
        body: this.sanitizeValue(req.body as unknown),
        rawBodyLength: rawBody ? rawBody.length : 0,
      })}`,
    );

    res.on('finish', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      this.logger.log(
        `${method} ${originalUrl} ${statusCode} - ${contentLength ?? 0}b - ${durationMs.toFixed(
          2,
        )}ms -> response ${this.toLogString({
          headers: this.sanitizeHeaders(
            res.getHeaders() as IncomingHttpHeaders,
          ),
        })}`,
      );
    });

    next();
  }

  private toLogString(value: unknown): string {
    try {
      const json = JSON.stringify(value, null, 2);

      if (!json) return 'null';
      if (json.length <= this.maxLogLength) return json;
      return `${json.slice(0, this.maxLogLength)}...<truncated>`;
    } catch {
      return '<unserializable>';
    }
  }

  private sanitizeHeaders(
    headers: IncomingHttpHeaders,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '<redacted>';
        continue;
      }

      sanitized[key] = this.sanitizeValue(value);
    }

    return sanitized;
  }

  private sanitizeValue(
    value: unknown,
    visited: WeakSet<object> = new WeakSet(),
  ): unknown {
    if (typeof value === 'bigint') return value.toString();

    if (Buffer.isBuffer(value)) {
      return `<Buffer length=${value.length}>`;
    }

    if (typeof value === 'string') {
      return this.truncateString(value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, visited));
    }

    if (!value || typeof value !== 'object') {
      return value;
    }

    if (visited.has(value)) {
      return '<circular>';
    }
    visited.add(value);

    const sanitized: Record<string, unknown> = {};
    for (const [key, currentValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '<redacted>';
        continue;
      }

      sanitized[key] = this.sanitizeValue(currentValue, visited);
    }

    return sanitized;
  }

  private truncateString(value: string): string {
    if (value.length <= this.maxFieldLength) return value;
    return `${value.slice(0, this.maxFieldLength)}...<truncated>`;
  }

  private isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return this.sensitiveFieldKeywords.some((keyword) =>
      normalized.includes(keyword),
    );
  }
}
