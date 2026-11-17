import { IsUUID } from 'class-validator';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';

export class ListSpacePermissionsDto extends PaginationOptions {
  @IsUUID()
  spaceId: string;
}
