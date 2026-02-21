import { IsString, IsNotEmpty } from 'class-validator';

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
}
