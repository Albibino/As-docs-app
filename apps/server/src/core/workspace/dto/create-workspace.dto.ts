import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform, TransformFnParams } from 'class-transformer';

export class CreateWorkspaceDto {
  @MinLength(1)
  @MaxLength(64)
  @IsString()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
