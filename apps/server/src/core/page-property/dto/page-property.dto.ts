import {
  Allow,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PagePropertyType } from '../schemas/page-property.schema';

export class ListPagePropertyDefinitionsDto {
  @IsUUID()
  spaceId: string;
}

export class CreateWorkspacePagePropertyDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsIn(['date', 'number', 'person'])
  type: PagePropertyType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class CreatePagePropertyDefinitionDto extends CreateWorkspacePagePropertyDefinitionDto {
  @IsUUID()
  spaceId: string;
}

export class UpdatePagePropertyDefinitionDto {
  @IsUUID()
  propertyId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class DeletePagePropertyDefinitionDto {
  @IsUUID()
  propertyId: string;
}

export class GetPagePropertyValuesDto {
  @IsUUID()
  pageId: string;
}

export class SetPagePropertyValueDto extends GetPagePropertyValuesDto {
  @IsUUID()
  propertyId: string;

  @Allow()
  value: unknown;
}
