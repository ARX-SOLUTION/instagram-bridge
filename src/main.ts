import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'body-parser';
import { urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    json({
      verify: (req: { rawBody?: Buffer } & Record<string, any>, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(
    urlencoded({
      extended: true,
      verify: (req: { rawBody?: Buffer } & Record<string, any>, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`Application is running on: http://localhost:${port}`);
}
void bootstrap();
