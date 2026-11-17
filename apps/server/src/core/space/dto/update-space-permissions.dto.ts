import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { SpaceIdDto } from './space-id.dto';
import { SpacePermissionEntryDto } from './space-permission-entry.dto';

export class UpdateSpacePermissionsDto extends SpaceIdDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SpacePermissionEntryDto)
  permissions: SpacePermissionEntryDto[];
}
