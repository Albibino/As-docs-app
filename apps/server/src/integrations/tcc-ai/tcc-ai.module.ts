import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EnvironmentService } from '../environment/environment.service';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { AiIndexingService } from './ai-indexing.service';
import { DocsMcpController } from './docs-mcp.controller';
import { DocsReadService } from './docs-read.service';
import { McpCredentialService } from './mcp-credential.service';
import { AiHttpClientModule } from './ai-http-client.module';

/**
 * Integração do TCC com o tcc-docs-ai:
 * - `AiIndexingService`: envia versões novas de página ao índice vetorial;
 * - `DocsMcpController` (`/mcp`): leitura das páginas atuais pela IA;
 * - `AiChatController` (`/api/ai/chats/*`): conversa e "tirar dúvidas".
 * A escrita assistida continua em `integrations/assisted-writing`.
 */
@Module({
  imports: [
    AiHttpClientModule,
    JwtModule.registerAsync({
      useFactory: (environment: EnvironmentService) => ({
        secret: environment.getAppSecret(),
        signOptions: { issuer: 'tcc-docs-app' },
      }),
      inject: [EnvironmentService],
    }),
  ],
  controllers: [AiChatController, DocsMcpController],
  providers: [
    AiChatService,
    AiIndexingService,
    DocsReadService,
    McpCredentialService,
  ],
  exports: [AiIndexingService, DocsReadService, McpCredentialService],
})
export class TccAiModule {}
