import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * TCC: nome e e-mail dos dois usuários são fixos (seed). Só preferências
 * podem ser alteradas.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsBoolean()
  fullPageWidth: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['read', 'edit'])
  pageEditMode: string;

  @IsOptional()
  @IsBoolean()
  editorToolbar: boolean;

  @IsOptional()
  @IsString()
  locale: string;

  @IsOptional()
  @IsBoolean()
  notificationPageUpdates: boolean;

  @IsOptional()
  @IsBoolean()
  notificationPageUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentCreated: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentResolved: boolean;
}
