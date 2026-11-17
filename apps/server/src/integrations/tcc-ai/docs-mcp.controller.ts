import {
  All,
  Controller,
  Logger,
  NotFoundException,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { extractBearerTokenFromHeader } from '../../common/helpers';
import { EnvironmentService } from '../environment/environment.service';
import { McpCredentialService } from './mcp-credential.service';
import { DocsReadService } from './docs-read.service';
import { User } from '@tcc-docs/db/types/entity.types';

export const MCP_TOOL_NAMES = [
  'docs.search_pages',
  'docs.get_page_context',
  'docs.read_page',
] as const;

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/**
 * Cria o servidor MCP de UMA requisição, já preso ao usuário da credencial.
 * As tools nunca recebem identidade nem workspace como argumento.
 */
export function buildDocsMcpServer(docs: DocsReadService, user: User) {
  const server = new McpServer({ name: 'tcc-docs-app', version: '1.0.0' });

  server.registerTool(
    'docs.search_pages',
    {
      description:
        'Busca páginas pelo texto ATUAL na aplicação (não no índice vetorial). Retorna pageId, título e versão atual.',
      inputSchema: {
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, limit }) =>
      json({ pages: await docs.searchPages(user, query, limit ?? 5) }),
  );

  server.registerTool(
    'docs.get_page_context',
    {
      description:
        'Versão atual (contentVersion), título e estado de exclusão de páginas. Usada para detectar índice desatualizado.',
      inputSchema: { pageIds: z.array(z.string()).min(1).max(20) },
      annotations: { readOnlyHint: true },
    },
    async ({ pageIds }) =>
      json({ pages: await docs.getPageContext(user, pageIds) }),
  );

  server.registerTool(
    'docs.read_page',
    {
      description:
        'Lê o conteúdo atual de uma página em Markdown (mcp-read), com a versão atual.',
      inputSchema: { pageId: z.string().min(1).max(64) },
      annotations: { readOnlyHint: true },
    },
    async ({ pageId }) => {
      const page = await docs.readPage(user, pageId);
      if (!page) {
        return { ...json({ error: 'page_not_found' }), isError: true };
      }
      return json(page);
    },
  );

  return server;
}

/**
 * Servidor MCP somente leitura para o tcc-docs-ai, em `/mcp` (fora do prefixo
 * `/api`). Transporte Streamable HTTP sem sessão: cada POST é autenticado pela
 * credencial delegada (Bearer) e atendido por um servidor novo.
 */
@Controller('mcp')
export class DocsMcpController {
  private readonly logger = new Logger(DocsMcpController.name);

  constructor(
    private readonly environment: EnvironmentService,
    private readonly credentials: McpCredentialService,
    private readonly docs: DocsReadService,
  ) {}

  @Public()
  @SkipTransform()
  @All()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    if (!this.environment.isAiMcpEnabled()) throw new NotFoundException();

    const claims = await this.credentials.verify(
      extractBearerTokenFromHeader(req),
    );
    const user = await this.docs.resolveUser(claims.sub, claims.workspaceId);
    if (!user) throw new NotFoundException('User not found');

    const server = buildDocsMcpServer(this.docs, user);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (error) {
      this.logger.error('MCP request failed', error as Error);
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.end();
      }
    }
  }
}
