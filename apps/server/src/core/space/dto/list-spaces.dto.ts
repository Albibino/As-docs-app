import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';

export class ListSpacesDto extends PaginationOptions {
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  archived = false;
}
