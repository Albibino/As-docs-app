import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateTeamDto } from './create-team.dto';

export class UpdateTeamDto extends PartialType(CreateTeamDto) {
  @IsNotEmpty()
  @IsUUID()
  teamId: string;
}
