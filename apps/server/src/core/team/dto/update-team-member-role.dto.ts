import { IsEnum, IsUUID } from 'class-validator';
import { TeamRole } from '../../../common/helpers/types/permission';
import { TeamIdDto } from './team-id.dto';

export class UpdateTeamMemberRoleDto extends TeamIdDto {
  @IsUUID()
  userId: string;

  @IsEnum(TeamRole)
  role: TeamRole;
}
