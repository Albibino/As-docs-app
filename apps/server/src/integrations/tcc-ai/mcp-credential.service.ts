import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentService } from '../environment/environment.service';

export const MCP_AUDIENCE = 'tcc-docs-mcp';
export const MCP_SCOPE = 'docs:read';

export interface McpCredentialClaims {
  sub: string;
  workspaceId: string;
  sessionId: string;
  aud: string;
  scope: string;
}

/**
 * Credencial delegada que o app entrega ao tcc-docs-ai a cada conversa.
 *
 * É curta (padrão 120 s), somente leitura, com audiência própria e vinculada
 * ao usuário e ao workspace. O tcc-docs-ai a usa como Bearer no `/mcp`; ela
 * nunca autoriza escrita nem serve como sessão do navegador. Identidade vem
 * daqui, nunca dos argumentos que o modelo escolhe.
 */
@Injectable()
export class McpCredentialService {
  constructor(
    private readonly jwt: JwtService,
    private readonly environment: EnvironmentService,
  ) {}

  issue(opts: { userId: string; workspaceId: string; sessionId: string }) {
    return this.jwt.sign(
      {
        sub: opts.userId,
        workspaceId: opts.workspaceId,
        sessionId: opts.sessionId,
        scope: MCP_SCOPE,
      },
      {
        audience: MCP_AUDIENCE,
        expiresIn: this.environment.getAiMcpCredentialTtlSeconds(),
      },
    );
  }

  async verify(token: string | undefined): Promise<McpCredentialClaims> {
    if (!token) throw new UnauthorizedException('Missing MCP credential');
    try {
      const claims = await this.jwt.verifyAsync<McpCredentialClaims>(token, {
        audience: MCP_AUDIENCE,
        secret: this.environment.getAppSecret(),
      });
      if (claims.scope !== MCP_SCOPE || !claims.workspaceId || !claims.sub) {
        throw new Error('invalid scope');
      }
      return claims;
    } catch {
      throw new UnauthorizedException('Invalid MCP credential');
    }
  }
}
