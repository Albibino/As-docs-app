import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class PagesByIdsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  pageIds: string[];
}
