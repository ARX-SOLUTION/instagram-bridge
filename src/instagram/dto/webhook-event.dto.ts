import { IsArray, IsOptional, IsString } from 'class-validator';

export class WebhookEventDto {
  @IsOptional()
  @IsString()
  object?: string;

  @IsOptional()
  @IsArray()
  entry?: any[];
}
