import { IsArray, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class WebhookChange {
  @IsString()
  field!: string;

  @IsObject()
  value!: Record<string, unknown>;
}

class WebhookEntry {
  @IsString()
  id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookChange)
  changes!: WebhookChange[];
}

export class WebhookEventDto {
  @IsString()
  object!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookEntry)
  entry!: WebhookEntry[];
}
