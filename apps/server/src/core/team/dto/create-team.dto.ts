import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTeamDto {
  @MinLength(2)
  @MaxLength(100)
  @IsString()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }: TransformFnParams) => value?.trim())
  description?: string;
}
