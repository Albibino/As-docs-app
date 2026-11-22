import {
  Body,
  Controller,
  GoneException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { AuthService } from './services/auth.service';
import { SessionService } from '../session/session.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import { SelectUserDto } from './dto/select-user.dto';

/**
 * TCC: login, cadastro, senha e SSO foram removidos. Ficam apenas a
 * escolha entre os dois usuários fixos, o token de colaboração e o logout
 * (que volta para a tela de escolha). Ver docs/tcc/02-cortes-de-funcionalidade.md.
 */
@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('users')
  listUsers(@AuthWorkspace() workspace: Workspace) {
    if (this.environmentService.isOidcEnabled()) throw new GoneException();
    return this.authService.listSelectableUsers(workspace.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('select-user')
  async selectUser(
    @Body() dto: SelectUserDto,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    if (this.environmentService.isOidcEnabled()) throw new GoneException();
    const token = await this.authService.selectUser(dto.userKey, workspace.id);
    res.setCookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('collab-token')
  collabToken(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.authService.getCollabToken(user, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const user = (req as any).user?.user as User | undefined;
    const sessionId = (req.raw as any).sessionId;
    if (user && sessionId) {
      await this.sessionService.revokeSession(
        sessionId,
        user.id,
        user.workspaceId,
      );
    }
    res.clearCookie('authToken');
  }
}
