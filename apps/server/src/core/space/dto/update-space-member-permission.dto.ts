import { IsBoolean, IsUUID } from 'class-validator';
import { SpaceIdDto } from './space-id.dto';

export class UpdateSpaceMemberPermissionDto extends SpaceIdDto {
  @IsUUID()
  userId: string;

  @IsBoolean()
  canView: boolean;

  @IsBoolean()
  canCreate: boolean;

  @IsBoolean()
  canEdit: boolean;

  @IsBoolean()
  canDelete: boolean;
}
