import {
  Injectable,
  Logger,
  NestMiddleware,
  RawBodyRequest,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly maxLogLength = 10000;

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
        params: req.params,
        query: req.query,
        headers: req.headers,
        body: req.body as unknown,
        rawBody,
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
          headers: res.getHeaders(),
        })}`,
      );
    });

    next();
  }

  private toLogString(value: unknown): string {
    try {
      const json = JSON.stringify(
        value,
        (_key, currentValue: unknown) => {
          if (typeof currentValue === 'bigint') return currentValue.toString();

          if (Buffer.isBuffer(currentValue)) {
            return `<Buffer length=${currentValue.length}>`;
          }

          return currentValue;
        },
        2,
      );

      if (!json) return 'null';
      if (json.length <= this.maxLogLength) return json;
      return `${json.slice(0, this.maxLogLength)}...<truncated>`;
    } catch {
      return '<unserializable>';
    }
  }
}
