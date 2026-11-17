import { IsNotEmpty, IsUUID } from 'class-validator';

export class TeamIdDto {
  @IsNotEmpty()
  @IsUUID()
  teamId: string;
}
