import { signAiRequest } from './ai-signing';

describe('signAiRequest', () => {
  it('produces the same signature as tcc-docs-ai (tcc_docs_ai.auth.sign_request)', () => {
    // Vetor gerado com a função Python do próprio tcc-docs-ai.
    const headers = signAiRequest({
      secret: 'test-secret',
      path: '/v1/index/pages',
      body: '{"tenantId":"w1","pages":[]}',
      timestamp: '1700000000',
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
    });
    expect(headers['x-ai-signature']).toBe(
      'v1=61a1513d1257e4e43452141806cc8cf33b3e947a7616a189906eb875cd324a4a',
    );
    expect(headers['x-ai-consumer']).toBe('docs-app');
  });
});
