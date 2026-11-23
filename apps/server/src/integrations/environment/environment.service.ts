import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms, { StringValue } from 'ms';

@Injectable()
export class EnvironmentService {
  constructor(private configService: ConfigService) {}

  getNodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }

  isDevelopment(): boolean {
    return this.getNodeEnv() === 'development';
  }

  isDevelopmentEnvironment(): boolean {
    const railwayEnvironment = this.configService
      .get<string>('RAILWAY_ENVIRONMENT_NAME', '')
      .toLowerCase();
    if (railwayEnvironment) return railwayEnvironment === 'development';
    return this.isDevelopment();
  }

  getAppUrl(): string {
    const rawUrl =
      this.configService.get<string>('APP_URL') ||
      `http://localhost:${this.getPort()}`;

    const { origin } = new URL(rawUrl);
    return origin;
  }

  isHttps(): boolean {
    const appUrl = this.configService.get<string>('APP_URL');
    try {
      const url = new URL(appUrl);
      return url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  getPort(): number {
    return parseInt(this.configService.get<string>('PORT', '3000'));
  }

  getAppSecret(): string {
    return this.configService.get<string>('APP_SECRET');
  }

  isOidcEnabled(): boolean {
    return this.configService.get<string>('OIDC_ENABLED') === 'true';
  }

  getOidcIssuer(): string {
    return this.configService.getOrThrow<string>('OIDC_ISSUER');
  }

  getOidcBackchannelUrl(): string | undefined {
    return this.configService.get<string>('OIDC_BACKCHANNEL_URL');
  }

  getOidcWebClient() {
    return {
      id: this.configService.getOrThrow<string>('OIDC_CLIENT_ID'),
      secret: this.configService.getOrThrow<string>('OIDC_CLIENT_SECRET_WEB'),
    };
  }

  getDocsAiUrl(): string {
    return this.configService.get<string>('DOCS_AI_URL');
  }

  getDocsAiHmacSecret(): string {
    return this.configService.get<string>('DOCS_AI_HMAC_SECRET');
  }

  isDocsAiOAuthEnabled(): boolean {
    return this.configService.get<string>('DOCS_AI_OAUTH_ENABLED') === 'true';
  }

  getDocsAiOAuthSecret(client: 'indexer' | 'assistant'): string {
    return this.configService.getOrThrow<string>(
      client === 'indexer' ? 'OIDC_CLIENT_SECRET_INDEXER' : 'OIDC_CLIENT_SECRET_ASSISTANT',
    );
  }

  isDocsAiConfigured(): boolean {
    return Boolean(
      this.getDocsAiUrl() &&
        (this.isDocsAiOAuthEnabled() || this.getDocsAiHmacSecret()),
    );
  }
  /** TCC: URL pública que o tcc-docs-ai usa para chegar ao servidor MCP (/mcp). */
  isAiMcpEnabled(): boolean {
    return (
      this.configService.get<string>('DOCS_AI_MCP_ENABLED', 'true').toLowerCase() ===
      'true'
    );
  }

  /** Validade, em segundos, da credencial MCP delegada a cada conversa. */
  getAiMcpCredentialTtlSeconds(): number {
    return parseInt(
      this.configService.get<string>('DOCS_AI_MCP_CREDENTIAL_TTL_SECONDS', '120'),
    );
  }

  /** Intervalo do reconciliador que indexa versões pendentes (0 = desligado). */
  getAiIndexIntervalSeconds(): number {
    return parseInt(
      this.configService.get<string>('DOCS_AI_INDEX_INTERVAL_SECONDS', '30'),
    );
  }


  getDatabaseURL(): string {
    return this.configService.get<string>('DATABASE_URL');
  }

  getDatabaseMaxPool(): number {
    return parseInt(this.configService.get<string>('DATABASE_MAX_POOL', '10'));
  }

  getRedisUrl(): string {
    return this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
  }

  getJwtTokenExpiresIn(): string {
    return this.configService.get<string>('JWT_TOKEN_EXPIRES_IN', '90d');
  }

  getCookieExpiresIn(): Date {
    const expiresInStr = this.getJwtTokenExpiresIn();
    let msUntilExpiry: number;
    try {
      msUntilExpiry = ms(expiresInStr as StringValue);
    } catch (err) {
      msUntilExpiry = ms('90d');
    }
    return new Date(Date.now() + msUntilExpiry);
  }

  getGotenbergUrl(): string | undefined {
    return this.configService.get<string>('GOTENBERG_URL');
  }

  getStorageDriver(): string {
    return this.configService.get<string>('STORAGE_DRIVER', 'local');
  }

  getFileUploadSizeLimit(): string {
    return this.configService.get<string>('FILE_UPLOAD_SIZE_LIMIT', '50mb');
  }

  getFileImportSizeLimit(): string {
    return this.configService.get<string>('FILE_IMPORT_SIZE_LIMIT', '200mb');
  }

  getAwsS3AccessKeyId(): string {
    return this.configService.get<string>('AWS_S3_ACCESS_KEY_ID');
  }

  getAwsS3SecretAccessKey(): string {
    return this.configService.get<string>('AWS_S3_SECRET_ACCESS_KEY');
  }

  getAwsS3Region(): string {
    return this.configService.get<string>('AWS_S3_REGION');
  }

  getAwsS3Bucket(): string {
    return this.configService.get<string>('AWS_S3_BUCKET');
  }

  getAwsS3Endpoint(): string {
    return this.configService.get<string>('AWS_S3_ENDPOINT');
  }

  getAwsS3ForcePathStyle(): boolean {
    const forcePathStyle = this.configService
      .get<string>('AWS_S3_FORCE_PATH_STYLE', 'false')
      .toLowerCase();
    return forcePathStyle === 'true';
  }

  getAwsS3Url(): string {
    return this.configService.get<string>('AWS_S3_URL');
  }

  getAzureStorageAccountName(): string {
    return this.configService.get<string>('AZURE_STORAGE_ACCOUNT_NAME');
  }

  getAzureStorageContainer(): string {
    return this.configService.get<string>('AZURE_STORAGE_CONTAINER');
  }

  getAzureStorageAccountKey(): string {
    return this.configService.get<string>('AZURE_STORAGE_ACCOUNT_KEY');
  }

  getAzureStorageEndpoint(): string {
    return this.configService.get<string>('AZURE_STORAGE_ENDPOINT');
  }

  getAzureStorageUrl(): string {
    return this.configService.get<string>('AZURE_STORAGE_URL');
  }

  getMailDriver(): string {
    return this.configService.get<string>('MAIL_DRIVER', 'log');
  }

  getMailFromAddress(): string {
    return this.configService.get<string>('MAIL_FROM_ADDRESS');
  }

  getMailFromName(): string {
    return this.configService.get<string>('MAIL_FROM_NAME', 'Docs');
  }

  getMailBlockedRecipientDomains(): string[] {
    const raw = this.configService.get<string>(
      'MAIL_BLOCKED_RECIPIENT_DOMAINS',
      '',
    );
    return raw
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }

  getSmtpHost(): string {
    return this.configService.get<string>('SMTP_HOST');
  }

  getSmtpPort(): number {
    return parseInt(this.configService.get<string>('SMTP_PORT'));
  }

  getSmtpSecure(): boolean {
    const secure = this.configService
      .get<string>('SMTP_SECURE', 'false')
      .toLowerCase();
    return secure === 'true';
  }

  getSmtpIgnoreTLS(): boolean {
    const ignoretls = this.configService
      .get<string>('SMTP_IGNORETLS', 'false')
      .toLowerCase();
    return ignoretls === 'true';
  }

  getSmtpUsername(): string {
    return this.configService.get<string>('SMTP_USERNAME');
  }

  getSmtpPassword(): string {
    return this.configService.get<string>('SMTP_PASSWORD');
  }

  getPostmarkToken(): string {
    return this.configService.get<string>('POSTMARK_TOKEN');
  }

  getDrawioUrl(): string {
    return this.configService.get<string>('DRAWIO_URL');
  }

  getCollabUrl(): string {
    return this.configService.get<string>('COLLAB_URL');
  }

  isCollabDisableRedis(): boolean {
    const isStandalone = this.configService
      .get<string>('COLLAB_DISABLE_REDIS', 'false')
      .toLowerCase();
    return isStandalone === 'true';
  }

  isDisableTelemetry(): boolean {
    const disable = this.configService
      .get<string>('DISABLE_TELEMETRY', 'false')
      .toLowerCase();
    return disable === 'true';
  }

  getAiDriver(): string {
    return this.configService.get<string>('AI_DRIVER');
  }

  getAiEmbeddingModel(): string {
    return this.configService.get<string>('AI_EMBEDDING_MODEL');
  }

  getAiCompletionModel(): string {
    return this.configService.get<string>('AI_COMPLETION_MODEL');
  }

  getAiChatModel(): string {
    return (
      this.configService.get<string>('AI_CHAT_MODEL') ||
      this.configService.get<string>('AI_COMPLETION_MODEL')
    );
  }

  getAiEmbeddingDimension(): number {
    return parseInt(
      this.configService.get<string>('AI_EMBEDDING_DIMENSION'),
      10,
    );
  }

  getAiEmbeddingSupportsMrl(): boolean | undefined {
    const val = this.configService.get<string>('AI_EMBEDDING_SUPPORTS_MRL');
    if (val === undefined || val === null || val === '') return undefined;
    return val === 'true';
  }

  getOpenAiApiKey(): string {
    return this.configService.get<string>('OPENAI_API_KEY');
  }

  getOpenAiApiUrl(): string {
    return this.configService.get<string>('OPENAI_API_URL');
  }

  getGeminiApiKey(): string {
    return this.configService.get<string>('GEMINI_API_KEY');
  }

  getOllamaApiUrl(): string {
    return this.configService.get<string>(
      'OLLAMA_API_URL',
      'http://localhost:11434',
    );
  }

  getEventStoreDriver(): string {
    return this.configService
      .get<string>('EVENT_STORE_DRIVER', 'postgres')
      .toLowerCase();
  }

  getClickHouseUrl(): string {
    return this.configService.get<string>('CLICKHOUSE_URL');
  }

  getSamlDisableRequestedAuthnContext(): boolean {
    const disabled = this.configService
      .get<string>('SAML_DISABLE_REQUESTED_AUTHN_CONTEXT', 'false')
      .toLowerCase();
    return disabled === 'true';
  }

  isIframeEmbedAllowed(): boolean {
    const allowed = this.configService
      .get<string>('IFRAME_EMBED_ALLOWED', 'false')
      .toLowerCase();
    return allowed === 'true';
  }

  getIframeAllowedOrigins(): string[] {
    const raw = this.configService.get<string>('IFRAME_ALLOWED_ORIGINS', '');
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
}
