import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import { TeamService } from './services/team.service';
import { TeamIdDto } from './dto/team-id.dto';

/**
 * TCC: existe um único time, criado pelo seed com os dois usuários fixos.
 * Criar times e gerenciar membros foi removido; a API fica somente leitura.
 * O `TeamService` continua inteiro porque o seed e as permissões o usam.
 */
@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  listTeams(
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.teamService.listTeams(user, workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  getTeam(
    @Body() dto: TeamIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.teamService.getTeam(user, workspace.id, dto.teamId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  listMembers(
    @Body() dto: TeamIdDto & PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.teamService.listMembers(user, workspace.id, dto.teamId, dto);
  }
}
