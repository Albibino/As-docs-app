import { IsBoolean, IsUUID } from 'class-validator';

export class SpacePermissionEntryDto {
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
