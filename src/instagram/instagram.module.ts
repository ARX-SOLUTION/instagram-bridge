import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { InstagramController } from './instagram.controller';
import { InstagramService } from './instagram.service';
import { InstagramPost } from './entities/instagram-post.entity';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstagramPost]),
    HttpModule,
    ConfigModule,
    TelegramModule,
  ],
  controllers: [InstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
