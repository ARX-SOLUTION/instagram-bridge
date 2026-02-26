import { Injectable } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';

@Injectable()
export class BotService {
  constructor(@InjectBot() private readonly bot: Telegraf<Context>) {
    this.initializeCommands();
  }

  private initializeCommands() {
    this.bot.start((ctx) => ctx.reply('Welcome to MyServiceBot!'));
    this.bot.help((ctx) => ctx.reply('Here are the available commands: /start, /help'));
    this.bot.command('admin', (ctx) => ctx.reply('Admin command placeholder'));
  }
}