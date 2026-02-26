import { Controller, Get, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BridgeService } from './bridge.service.js';

@Controller('instagram/webhook')
export class BridgeController {
  constructor(private readonly bridgeService: BridgeService) {}

  @Get()
  verifyWebhook(@Req() req: Request, @Res() res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
      return res.status(HttpStatus.OK).send(challenge || '');
    }

    return res.status(HttpStatus.BAD_REQUEST).send('Invalid verify token');
  }

  @Post()
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const isValid = this.bridgeService.verifyMetaSignature(req);
    if (!isValid) {
      return res.status(HttpStatus.UNAUTHORIZED).send('Invalid signature');
    }

    res.status(HttpStatus.OK).send('EVENT_RECEIVED');

    try {
      await this.bridgeService.processInstagramEvent(req.body);
    } catch (error) {
      console.error('Error processing webhook:', error);
    }
  }
}