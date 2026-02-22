import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './database/database.module';
import { InstagramModule } from './instagram/instagram.module';
import { TelegramModule } from './telegram/telegram.module';
import { AppController } from './app.controller';
import configuration from './config/configuration';

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
  ],
})
export class AppModule {}
