import { Module } from '@nestjs/common';
import { BridgeController } from './bridge.controller.js';
import { BridgeService } from './bridge.service.js';

@Module({
  controllers: [BridgeController],
  providers: [BridgeService],
})
export class BridgeModule {}