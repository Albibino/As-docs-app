import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateSpaceDto } from './create-space.dto';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

class UpdateSpaceFieldsDto extends OmitType(CreateSpaceDto, [
  'teamId',
  'permissions',
] as const) {}

export class UpdateSpaceDto extends PartialType(UpdateSpaceFieldsDto) {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsBoolean()
  allowViewerComments: boolean;
}
