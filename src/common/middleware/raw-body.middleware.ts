import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

declare module 'express' {
  export interface Request {
    rawBody?: Buffer;
  }
}

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    req.rawBody = Buffer.from('');

    req.on('data', (chunk) => {
      req.rawBody = Buffer.concat([req.rawBody, chunk]);
    });

    req.on('end', () => {
      next();
    });
  }
}