import { IsNotEmpty, IsString } from 'class-validator';

export class DocxExportDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}
