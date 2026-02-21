import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { TelegramListener } from './listeners/telegram.listener';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [TelegramService, TelegramListener],
  exports: [TelegramService],
})
export class TelegramModule {}
