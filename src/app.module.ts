import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller.js';
import { CommonModule } from './common/common.module.js';
import { LoggerMiddleware } from './common/logger.middleware.js';
import { RawBodyMiddleware } from './common/middleware/raw-body.middleware.js';
import configuration from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { InstagramModule } from './instagram/instagram.module.js';
import { ContentModule } from './modules/content/content.module';
import { TelegramModule } from './telegram/telegram.module.js';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    InstagramModule,
    TelegramModule,
    CommonModule,
    ContentModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware, LoggerMiddleware)
      .forRoutes('*');
  }
}
