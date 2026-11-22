import {
  IsIn,
  IsNotEmpty,
  IsNotIn,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';

export class EnvironmentVariables {
  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['postgres', 'postgresql'],
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'DATABASE_URL must be a valid postgres connection string' },
  )
  DATABASE_URL: string;

  @IsNotEmpty()
  @IsUrl(
    {
      protocols: ['redis', 'rediss'],
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'REDIS_URL must be a valid redis connection string' },
  )
  REDIS_URL: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  APP_URL: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  OIDC_ENABLED: string;

  @ValidateIf((obj) => obj.OIDC_ENABLED === 'true')
  @IsNotEmpty()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  OIDC_ISSUER: string;

  @ValidateIf((obj) => obj.OIDC_ENABLED === 'true' && !!obj.OIDC_BACKCHANNEL_URL)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  OIDC_BACKCHANNEL_URL: string;

  @ValidateIf((obj) => obj.OIDC_ENABLED === 'true')
  @IsString()
  @IsNotEmpty()
  OIDC_CLIENT_ID: string;

  @ValidateIf((obj) => obj.OIDC_ENABLED === 'true')
  @IsString()
  @MinLength(32)
  OIDC_CLIENT_SECRET_WEB: string;











  @IsOptional()
  @ValidateIf((obj) => Boolean(obj.DOCS_AI_HMAC_SECRET))
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  DOCS_AI_URL: string;

  @IsOptional()
  @ValidateIf((obj) => Boolean(obj.DOCS_AI_URL))
  @IsString()
  @MinLength(32)
  DOCS_AI_HMAC_SECRET: string;

  @IsNotEmpty()
  @MinLength(32)
  @IsNotIn(['REPLACE_WITH_LONG_SECRET'])
  APP_SECRET: string;

  @IsOptional()
  @IsIn(['log', 'smtp', 'postmark'])
  MAIL_DRIVER: string;

  @IsOptional()
  @IsIn(['local', 's3', 'azure'])
  STORAGE_DRIVER: string;

  @IsOptional()
  @ValidateIf((obj) => obj.COLLAB_URL != '' && obj.COLLAB_URL != null)
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  COLLAB_URL: string;

  @IsOptional()
  @ValidateIf((obj) => obj.AI_DRIVER)
  @IsIn(['openai', 'openai-compatible', 'gemini', 'ollama'])
  @IsString()
  AI_DRIVER: string;

  @IsOptional()
  @IsString()
  AI_EMBEDDING_MODEL: string;

  @ValidateIf((obj) => obj.AI_EMBEDDING_DIMENSION)
  @IsIn(['768', '1024', '1536', '2000', '3072'])
  @IsString()
  AI_EMBEDDING_DIMENSION: string;

  @IsOptional()
  @ValidateIf((obj) => obj.AI_EMBEDDING_SUPPORTS_MRL)
  @IsIn(['true', 'false'])
  @IsString()
  AI_EMBEDDING_SUPPORTS_MRL: string;

  @ValidateIf((obj) => obj.AI_DRIVER)
  @IsString()
  @IsNotEmpty()
  AI_COMPLETION_MODEL: string;

  @IsOptional()
  @ValidateIf(
    (obj) =>
      obj.AI_DRIVER && ['openai', 'openai-compatible'].includes(obj.AI_DRIVER),
  )
  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY: string;

  @IsOptional()
  @ValidateIf(
    (obj) =>
      obj.AI_DRIVER === 'openai-compatible' ||
      (obj.AI_DRIVER === 'openai' && obj.OPENAI_API_URL),
  )
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  OPENAI_API_URL: string;

  @ValidateIf((obj) => obj.AI_DRIVER && obj.AI_DRIVER === 'gemini')
  @IsString()
  @IsNotEmpty()
  GEMINI_API_KEY: string;

  @ValidateIf((obj) => obj.AI_DRIVER && obj.AI_DRIVER === 'ollama')
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  OLLAMA_API_URL: string;

  @IsOptional()
  @IsIn(['postgres', 'clickhouse'])
  @IsString()
  EVENT_STORE_DRIVER: string;

  @ValidateIf((obj) => obj.EVENT_STORE_DRIVER === 'clickhouse')
  @IsNotEmpty()
  @IsUrl(
    { protocols: ['http', 'https'], require_tld: false },
    {
      message:
        'CLICKHOUSE_URL must be a valid URL e.g http://user:password@localhost:8123/docs',
    },
  )
  CLICKHOUSE_URL: string;
}

export function validate(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validatedConfig);

  if (errors.length > 0) {
    console.error(
      'The Environment variables has failed the following validations:',
    );

    errors.map((error) => {
      console.error(JSON.stringify(error.constraints));
    });

    console.error(
      'Please fix the environment variables and try again. Exiting program...',
    );
    process.exit(1);
  }

  return validatedConfig;
}
