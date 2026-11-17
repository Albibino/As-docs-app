import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { SpacePermissionEntryDto } from './space-permission-entry.dto';

export class CreateSpaceDto {
  @IsUUID()
  teamId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SpacePermissionEntryDto)
  permissions?: SpacePermissionEntryDto[];

  @MinLength(2)
  @MaxLength(100)
  @IsString()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message:
      'Space slug must start with a letter or number and may contain hyphens and underscores',
  })
  slug: string;
}
