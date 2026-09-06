import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class ConfirmPublishDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  confirmPublish: boolean;
}
