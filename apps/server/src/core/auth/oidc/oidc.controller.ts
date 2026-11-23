import { Controller, Get, NotFoundException, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Workspace } from '@tcc-docs/db/types/entity.types';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { AI_CHAT_THROTTLER, AUTH_THROTTLER } from '../../../integrations/throttle/throttler-names';
import { OIDC_CALLBACK, OidcLoginService } from './oidc-login.service';
import { OIDC_TRANSACTION_SECONDS } from './oidc-transaction.store';

const BROWSER_COOKIE = 'oidcBrowser';

@Controller('auth/oidc')
@Public()
@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
export class OidcController {
  constructor(private readonly env: EnvironmentService, private readonly login: OidcLoginService) {}

  @Get('status')
  @SkipThrottle({ [AUTH_THROTTLER]: true })
  status(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    return { enabled: this.env.isOidcEnabled() };
  }

  @Get('login')
  async start(@AuthWorkspace() workspace: Workspace, @Res() reply: FastifyReply) {
    this.prepare(reply);
    try {
      const { authorization, browser } = await this.login.begin(workspace.id);
      reply.setCookie(BROWSER_COOKIE, browser, {
        httpOnly: true, secure: this.env.isHttps(), sameSite: 'lax',
        maxAge: OIDC_TRANSACTION_SECONDS, path: OIDC_CALLBACK,
      });
      return reply.redirect(authorization.href, 303);
    } catch {
      return reply.redirect('/login?oidc=failed', 303);
    }
  }

  @Get('callback')
  async callback(@AuthWorkspace() workspace: Workspace, @Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    this.prepare(reply);
    const browser = req.cookies?.[BROWSER_COOKIE];
    reply.clearCookie(BROWSER_COOKIE, { path: OIDC_CALLBACK });
    try {
      if (!browser) return reply.redirect('/login?oidc=failed', 303);
      const queryStart = req.url.indexOf('?');
      const query = queryStart < 0 ? '' : req.url.slice(queryStart);
      const token = await this.login.finish(workspace.id, browser, query);
      reply.setCookie('authToken', token, {
        httpOnly: true, secure: this.env.isHttps(), sameSite: 'lax',
        path: '/', expires: this.env.getCookieExpiresIn(),
      });
      return reply.redirect('/', 303);
    } catch {
      return reply.redirect('/login?oidc=failed', 303);
    }
  }

  private prepare(reply: FastifyReply) {
    if (!this.env.isOidcEnabled()) throw new NotFoundException();
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  }
}
