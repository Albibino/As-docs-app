import { IsUUID } from 'class-validator';
import { TeamIdDto } from './team-id.dto';

export class RemoveTeamMemberDto extends TeamIdDto {
  @IsUUID()
  userId: string;
}
