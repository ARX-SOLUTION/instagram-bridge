import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class BridgeService {
  private readonly topicThreadCache = new Map<string, number>();
  private readonly TOPIC_CACHE_PATH = process.env.TELEGRAM_TOPIC_CACHE_PATH || '.telegram-topic-cache.json';

  constructor() {
    this.readTopicCache();
  }

  verifyMetaSignature(req: any): boolean {
    const signature = req.header('X-Hub-Signature-256');

    if (req.method === 'GET') return true;

    const META_APP_SECRET = process.env.META_APP_SECRET || '';
    if (!META_APP_SECRET || !signature) return false;

    const raw = req.rawBody || Buffer.from('');
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', META_APP_SECRET).update(raw).digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);

    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async processInstagramEvent(event: any) {
    console.log('========== IG EVENT ==========');
    console.log(JSON.stringify(event, null, 2));
    // Add logic to process Instagram events here
  }

  private readTopicCache() {
    try {
      if (!fs.existsSync(this.TOPIC_CACHE_PATH)) return;
      const raw = fs.readFileSync(this.TOPIC_CACHE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [key, value] of Object.entries(parsed || {})) {
        const threadId = Number(value);
        if (Number.isInteger(threadId) && threadId > 0) {
          this.topicThreadCache.set(key, threadId);
        }
      }
    } catch (err) {
      console.error("Topic cache o'qishda xatolik:", err);
    }
  }

  private writeTopicCache() {
    try {
      const data = Object.fromEntries(this.topicThreadCache.entries());
      fs.writeFileSync(this.TOPIC_CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Topic cache yozishda xatolik:', err);
    }
  }
}