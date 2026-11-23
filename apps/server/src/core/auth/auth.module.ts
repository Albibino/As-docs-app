import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenModule } from './token.module';
import { OidcController } from './oidc/oidc.controller';
import { OidcLoginService } from './oidc/oidc-login.service';
import { OidcTransactionStore } from './oidc/oidc-transaction.store';
import { OidcProviderModule } from '../../integrations/oidc/oidc-provider.module';

@Module({
  imports: [TokenModule, OidcProviderModule],
  controllers: [AuthController, OidcController],
  providers: [AuthService, JwtStrategy, OidcLoginService, OidcTransactionStore],
  exports: [AuthService],
})
export class AuthModule {}
