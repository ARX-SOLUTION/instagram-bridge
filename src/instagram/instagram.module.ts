import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [ConfigModule, TelegramModule],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
