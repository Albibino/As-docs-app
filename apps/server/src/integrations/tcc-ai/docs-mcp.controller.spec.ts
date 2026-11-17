import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildDocsMcpServer, MCP_TOOL_NAMES } from './docs-mcp.controller';

const PAGE_ID = '11111111-1111-4111-8111-111111111111';

async function connect(docs: any) {
  const server = buildDocsMcpServer(docs, { id: 'u1', workspaceId: 'w1' } as any);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

describe('docs MCP server', () => {
  const docs = {
    searchPages: jest.fn().mockResolvedValue([
      { pageId: PAGE_ID, title: 'Política de férias', version: 2 },
    ]),
    getPageContext: jest.fn().mockResolvedValue([
      { pageId: PAGE_ID, title: 'Política de férias', version: 2, indexedVersion: 1, deleted: false },
    ]),
    readPage: jest.fn(async (_user: unknown, pageId: string) =>
      pageId === PAGE_ID
        ? { pageId, title: 'Política de férias', version: 2, markdown: 'Pedir com 45 dias.', truncated: false }
        : null,
    ),
  };

  it('exposes exactly the read-only allowlist expected by tcc-docs-ai', async () => {
    const client = await connect(docs);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
  });

  it('docs.read_page returns the current version and markdown (mcp-read)', async () => {
    const client = await connect(docs);
    const result: any = await client.callTool({
      name: 'docs.read_page',
      arguments: { pageId: PAGE_ID },
    });
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      version: 2,
      markdown: 'Pedir com 45 dias.',
    });
    expect(docs.readPage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      PAGE_ID,
    );
  });

  it('docs.read_page reports an error for an inaccessible page', async () => {
    const client = await connect(docs);
    const result: any = await client.callTool({
      name: 'docs.read_page',
      arguments: { pageId: '22222222-2222-4222-8222-222222222222' },
    });
    expect(result.isError).toBe(true);
  });

  it('docs.get_page_context returns the current version for staleness checks', async () => {
    const client = await connect(docs);
    const result: any = await client.callTool({
      name: 'docs.get_page_context',
      arguments: { pageIds: [PAGE_ID] },
    });
    expect(JSON.parse(result.content[0].text).pages[0]).toMatchObject({
      version: 2,
      indexedVersion: 1,
    });
  });
});
