import { IsIn } from 'class-validator';
import { UserStatus } from '../schema/user.schema';

export class SetUserStatusDto {
  @IsIn(Object.values(UserStatus), {
    message: `status must be one of: ${Object.values(UserStatus).join(', ')}`,
  })
  status!: UserStatus;
}
