import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_FOLDER_IMPORT_ENTRIES = 10_000;
export const MAX_FOLDER_IMPORT_FILE_SIZE = 100 * 1024 * 1024;

export class FolderImportManifestEntryDto {
  @IsString()
  @MaxLength(2_048)
  relativePath: string;

  @IsInt()
  @Min(0)
  @Max(MAX_FOLDER_IMPORT_FILE_SIZE)
  fileSize: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  sha256?: string;
}

export class CreateFolderImportDto {
  @IsUUID()
  spaceId: string;

  @IsString()
  @MaxLength(255)
  @Matches(/^[^/\\\0]+$/)
  rootName: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FOLDER_IMPORT_ENTRIES)
  @ValidateNested({ each: true })
  @Type(() => FolderImportManifestEntryDto)
  entries: FolderImportManifestEntryDto[];
}

export class GetFolderImportDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  beforeCursor?: string;
}
