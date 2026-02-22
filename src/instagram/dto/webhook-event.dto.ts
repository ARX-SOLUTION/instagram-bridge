import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class WebhookChange {
  @IsString()
  field!: string;

  @IsOptional()
  value!: Record<string, unknown>;
}

export class MessagingEvent {
  @IsOptional()
  sender?: { id: string };

  @IsOptional()
  recipient?: { id: string };

  @IsOptional()
  timestamp?: number;

  @IsOptional()
  message?: { mid?: string; text?: string };

  @IsOptional()
  read?: { watermark?: number };

  @IsOptional()
  postback?: { payload?: string };
}

class WebhookEntry {
  @IsString()
  id!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookChange)
  changes?: WebhookChange[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessagingEvent)
  messaging?: MessagingEvent[];
}

export class WebhookEventDto {
  @IsString()
  object!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookEntry)
  entry!: WebhookEntry[];
}
