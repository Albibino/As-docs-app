import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TaxonomyFilterDto {
  @IsUUID()
  treeId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  nodeIds?: string[];
}

export class SearchDTO {
  @IsNotEmpty()
  @IsString()
  query: string;

  @IsOptional()
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  creatorId?: string;

  /** Narrows to pages carrying every one of these labels. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  labelIds?: string[];

  /** One entry per tree; an empty nodeIds array means any selection in it. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TaxonomyFilterDto)
  taxonomyFilters?: TaxonomyFilterDto[];

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  offset?: number;
}

export class SearchSuggestionDTO {
  @IsString()
  query: string;

  @IsOptional()
  @IsBoolean()
  includeUsers?: boolean;

  @IsOptional()
  @IsBoolean()
  includePages?: boolean;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
