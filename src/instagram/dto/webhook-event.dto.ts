import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class WebhookEventDto {
  @IsOptional()
  @IsString()
  object?: string;

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  entry?: Record<string, unknown>[];
}
