import { Module } from '@nestjs/common';
import { OidcProviderModule } from '../oidc/oidc-provider.module';
import { AiHttpClient } from './ai-http-client.service';

@Module({
  imports: [OidcProviderModule],
  providers: [AiHttpClient],
  exports: [AiHttpClient],
})
export class AiHttpClientModule {}
