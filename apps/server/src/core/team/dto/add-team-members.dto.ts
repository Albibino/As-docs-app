import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TeamRole } from '../../../common/helpers/types/permission';
import { TeamIdDto } from './team-id.dto';

export class TeamMemberSpacePermissionDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  spaceId: string;

  @IsBoolean()
  canView: boolean;

  @IsBoolean()
  canCreate: boolean;

  @IsBoolean()
  canEdit: boolean;

  @IsBoolean()
  canDelete: boolean;
}

export class AddTeamMembersDto extends TeamIdDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  userIds: string[];

  @IsOptional()
  @IsEnum(TeamRole)
  role: TeamRole = TeamRole.MEMBER;

  /**
   * An explicit empty array means that the new members join the team without
   * access to any Space. Omitting the field keeps the API backwards compatible
   * and applies the default view/create access to active Spaces.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => TeamMemberSpacePermissionDto)
  permissions?: TeamMemberSpacePermissionDto[];
}
