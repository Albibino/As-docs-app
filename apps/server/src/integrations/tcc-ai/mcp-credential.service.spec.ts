import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { McpCredentialService } from './mcp-credential.service';

describe('McpCredentialService', () => {
  const environment = {
    getAppSecret: () => 'app-secret-with-enough-length-0000',
    getAiMcpCredentialTtlSeconds: () => 120,
  };
  const jwt = new JwtService({ secret: environment.getAppSecret() });
  const service = new McpCredentialService(jwt, environment as any);

  it('round-trips a read-only credential bound to user and workspace', async () => {
    const token = service.issue({ userId: 'u1', workspaceId: 'w1', sessionId: 'c1' });
    await expect(service.verify(token)).resolves.toMatchObject({
      sub: 'u1',
      workspaceId: 'w1',
      scope: 'docs:read',
      aud: 'tcc-docs-mcp',
    });
  });

  it('rejects a regular session token (wrong audience)', async () => {
    const sessionToken = jwt.sign({ sub: 'u1', workspaceId: 'w1', type: 'access' });
    await expect(service.verify(sessionToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing credential', async () => {
    await expect(service.verify(undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
