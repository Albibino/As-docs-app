import { createHash, createHmac, randomUUID } from 'node:crypto';

/**
 * Assinatura HMAC compartilhada com o tcc-docs-ai (`src/tcc_docs_ai/auth.py`).
 * Linha canônica: timestamp, método, path, idempotency-key e sha256 do corpo.
 */
export function signAiRequest(opts: {
  secret: string;
  path: string;
  body: string;
  idempotencyKey?: string;
  timestamp?: string;
  consumer?: string;
}) {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const idempotencyKey = opts.idempotencyKey ?? randomUUID();
  const bodyHash = createHash('sha256').update(opts.body).digest('hex');
  const canonical = [timestamp, 'POST', opts.path, idempotencyKey, bodyHash].join(
    '\n',
  );
  const signature = createHmac('sha256', opts.secret)
    .update(canonical)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-ai-consumer': opts.consumer ?? 'docs-app',
    'x-ai-timestamp': timestamp,
    'idempotency-key': idempotencyKey,
    'x-ai-signature': `v1=${signature}`,
  };
}
