import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkspaceDto } from './create-workspace.dto';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto) {
  @IsOptional()
  @IsArray()
  emailDomains: string[];

  @IsOptional()
  @IsBoolean()
  enforceSso: boolean;

  @IsOptional()
  @IsBoolean()
  aiSearch: boolean;

  @IsOptional()
  @IsBoolean()
  generativeAi: boolean;

  @IsOptional()
  @IsBoolean()
  mcpEnabled: boolean;

  @IsOptional()
  @IsBoolean()
  aiChat: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  trashRetentionDays: number;

  @IsOptional()
  @IsBoolean()
  allowPersonalSpaces: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['read', 'edit'])
  defaultPageEditMode: string;

  @IsOptional()
  @IsObject()
  pdfExport?: Record<string, unknown>;
}
