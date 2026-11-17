import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';

/**
 * TCC: existe um único workspace (sem modo cloud por subdomínio).
 */
@Injectable()
export class DomainMiddleware implements NestMiddleware {
  constructor(private workspaceRepo: WorkspaceRepo) {}
  async use(
    req: FastifyRequest['raw'],
    res: FastifyReply['raw'],
    next: () => void,
  ) {
    const workspace = await this.workspaceRepo.findFirst();
    if (!workspace) {
      (req as any).workspaceId = null;
      return next();
    }

    (req as any).workspaceId = workspace.id;
    (req as any).workspace = workspace;
    next();
  }
}
