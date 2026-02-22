import { IsArray, IsObject, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class WebhookValue {
  @IsString()
  id: string; // media_id
}

class WebhookChange {
  @IsString()
  field: string;

  @IsObject()
  value: WebhookValue;
}

class WebhookEntry {
  @IsString()
  id: string;

  @IsArray()
  changes: WebhookChange[];
}

export class WebhookEventDto {
  @IsString()
  object: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebhookEntry)
  entry: WebhookEntry[];
}
