import { IsIn, IsString } from 'class-validator';
import { TCC_USERS } from '../../tcc/tcc.constants';

export class SelectUserDto {
  @IsString()
  @IsIn(TCC_USERS.map((user) => user.key))
  userKey: string;
}
