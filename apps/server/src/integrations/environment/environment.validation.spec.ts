import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvironmentVariables } from './environment.validation';
import { ConfigService } from '@nestjs/config';
import { EnvironmentService } from './environment.service';

const base = {
  DATABASE_URL: 'postgres://db:5432/docs',
  REDIS_URL: 'redis://redis:6379',
  APP_SECRET: 'a'.repeat(32),
};
const legacy = {
  DOCS_AI_URL: 'http://ai:8080',
  DOCS_AI_HMAC_SECRET: 'h'.repeat(32),
};
const oauth = {
  DOCS_AI_OAUTH_ENABLED: 'true',
  DOCS_AI_URL: 'http://ai:8080',
  OIDC_ISSUER: 'http://localhost:9090/realms/as-docs',
  OIDC_CLIENT_SECRET_INDEXER: 'test-indexer-secret',
  OIDC_CLIENT_SECRET_ASSISTANT: 'test-assistant-secret',
};

function invalid(config: Record<string, unknown>) {
  return validateSync(
    plainToInstance(EnvironmentVariables, { ...base, ...config }),
  ).map((error) => error.property);
}

describe('Docs AI authentication configuration', () => {
  it.each([undefined, 'false'])(
    'permits legacy mode (%s) without OIDC',
    (mode) => {
      expect(invalid({ DOCS_AI_OAUTH_ENABLED: mode })).toEqual([]);
      expect(invalid({ ...legacy, DOCS_AI_OAUTH_ENABLED: mode })).toEqual([]);
    },
  );

  it('rejects unknown modes instead of silently selecting HMAC', () => {
    expect(invalid({ ...legacy, DOCS_AI_OAUTH_ENABLED: 'TRUE' })).toContain(
      'DOCS_AI_OAUTH_ENABLED',
    );
  });

  it('enables technical OAuth independently of web login and HMAC', () => {
    expect(invalid(oauth)).toEqual([]);
    const env = new EnvironmentService(new ConfigService(oauth));
    expect(env.isDocsAiConfigured()).toBe(true);
    expect(env.isOidcEnabled()).toBe(false);
    expect(invalid({ ...oauth, DOCS_AI_HMAC_SECRET: '' })).toEqual([]);
    expect(invalid({ ...oauth, APP_SECRET: undefined })).toContain(
      'APP_SECRET',
    );
  });

  it.each([
    'DOCS_AI_URL',
    'OIDC_ISSUER',
    'OIDC_CLIENT_SECRET_INDEXER',
    'OIDC_CLIENT_SECRET_ASSISTANT',
  ])('requires %s in OAuth even if HMAC is configured', (key) => {
    expect(invalid({ ...legacy, ...oauth, [key]: undefined })).toContain(key);
    expect(invalid({ ...legacy, ...oauth, [key]: '  ' })).toContain(key);
  });

  it('validates the optional backchannel in OAuth-only mode', () => {
    expect(
      invalid({ ...oauth, OIDC_BACKCHANNEL_URL: 'http://keycloak:8080' }),
    ).toEqual([]);
    expect(invalid({ ...oauth, OIDC_BACKCHANNEL_URL: 'not-a-url' })).toContain(
      'OIDC_BACKCHANNEL_URL',
    );
  });

  it('still requires web credentials when web login is also enabled', () => {
    expect(invalid({ ...oauth, OIDC_ENABLED: 'true' })).toEqual(
      expect.arrayContaining(['OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET_WEB']),
    );
  });
});
