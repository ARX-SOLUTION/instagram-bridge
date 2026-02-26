import { Injectable } from '@nestjs/common';
import crypto from 'crypto';

@Injectable()
export class CommonService {
  private readonly processedMessages = new Map<string, number>();
  private readonly PROCESSED_TTL_MS = 10 * 60 * 1000;
  private readonly PROCESSED_MAX_SIZE = 5000;

  escapeHtml(text = ''): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  hashObject(value: any): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(value))
      .digest('hex')
      .slice(0, 24);
  }

  isDuplicateKey(key: string): boolean {
    if (this.processedMessages.has(key)) return true;
    this.processedMessages.set(key, Date.now());
    return false;
  }

  cleanupProcessedMessages(): void {
    const now = Date.now();
    for (const [key, ts] of this.processedMessages.entries()) {
      if (now - ts > this.PROCESSED_TTL_MS) {
        this.processedMessages.delete(key);
      }
    }

    if (this.processedMessages.size > this.PROCESSED_MAX_SIZE) {
      const keys = this.processedMessages.keys();
      while (this.processedMessages.size > Math.floor(this.PROCESSED_MAX_SIZE * 0.8)) {
        const oldestKey = keys.next().value;
        if (!oldestKey) break;
        this.processedMessages.delete(oldestKey);
      }
    }
  }

  getChangeEventType(change: any): string {
    const field = change?.field || 'unknown';
    return `change.${field}`;
  }

  getChangeEventKey(change: any): string {
    const field = change?.field || 'unknown';
    const value = change?.value || {};
    const stableId =
      value?.media_id ||
      value?.comment_id ||
      value?.id ||
      value?.target_id ||
      value?.event_id;

    if (stableId) return `change:${field}:${stableId}`;
    return `change:${field}:${this.hashObject(change)}`;
  }

  async downloadBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || '';
    const headers: Record<string, string> = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {};
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType };
  }
}