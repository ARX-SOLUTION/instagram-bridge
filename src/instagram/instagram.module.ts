import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [HttpModule, ConfigModule, TelegramModule],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
