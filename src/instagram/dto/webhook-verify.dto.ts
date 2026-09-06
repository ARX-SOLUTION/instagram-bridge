import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WebhookVerifyDto {
  @IsString()
  @IsNotEmpty()
  'hub.mode': string;

  @IsString()
  @IsNotEmpty()
  'hub.challenge': string;

  @IsString()
  @IsNotEmpty()
  'hub.verify_token': string;

  @IsOptional()
  @IsString()
  hub_mode?: string;

  @IsOptional()
  @IsString()
  hub_challenge?: string;

  @IsOptional()
  @IsString()
  hub_verify_token?: string;
}
