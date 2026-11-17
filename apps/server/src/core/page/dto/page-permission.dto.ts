import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsArray,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PageIdDto } from './page.dto';
import { PagePermissionSubjectType } from '../../../common/helpers/types/permission';

export class PagePermissionRuleDto {
  @IsIn(Object.values(PagePermissionSubjectType))
  subjectType: PagePermissionSubjectType;

  @ValidateIf((rule) => rule.subjectType !== PagePermissionSubjectType.WORKSPACE)
  @IsUUID()
  subjectId?: string;

  @IsBoolean()
  canView: boolean;

  @IsBoolean()
  canEdit: boolean;

  @IsBoolean()
  canDelete: boolean;

  @IsBoolean()
  includeSubpages: boolean;
}

export class AddPagePermissionDto extends PageIdDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagePermissionRuleDto)
  rules: PagePermissionRuleDto[];
}

export class RemovePagePermissionDto extends PageIdDto {
  @IsArray()
  @IsUUID('all', { each: true })
  permissionIds: string[];
}

export class UpdatePagePermissionDto extends PageIdDto {
  @IsUUID()
  permissionId: string;

  @IsOptional()
  @IsBoolean()
  canView?: boolean;

  @IsOptional()
  @IsBoolean()
  canEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;

  @IsOptional()
  @IsBoolean()
  includeSubpages?: boolean;
}
