import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { ContentFormat } from './create-page.dto';

export class PageIdDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class SpaceIdDto {
  @IsUUID()
  spaceId: string;
}

export class PageHistoryIdDto {
  @IsUUID()
  historyId: string;
}

export class SaveManualPageHistoryDto extends PageIdDto {
  @IsString()
  title: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsString()
  description?: string;
}

export class RestorePageHistoryDto extends PageIdDto {
  @IsUUID()
  historyId: string;

  @IsString()
  title: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  requestId?: string;
}

export class PageInfoDto extends PageIdDto {
  @IsOptional()
  @IsBoolean()
  includeSpace: boolean;

  @IsOptional()
  @IsBoolean()
  includeContent: boolean;

  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['json', 'markdown', 'html'])
  format?: ContentFormat;
}

export class DeletePageDto extends PageIdDto {
  @IsOptional()
  @IsBoolean()
  permanentlyDelete?: boolean;
}
