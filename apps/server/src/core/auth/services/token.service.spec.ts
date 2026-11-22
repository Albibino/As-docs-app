import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { JwtType } from '../dto/jwt-payload';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenService],
    })
      .useMocker(() => ({}))
      .compile();

    service = module.get<TokenService>(TokenService);
  });

  it('rejects a legacy access token when OIDC is enabled', async () => {
    const secret = 'test-only-secret';
    const jwt = new JwtService({ secret });
    const env = { getAppSecret: () => secret, isOidcEnabled: () => true } as EnvironmentService;
    const verifier = new TokenService(jwt, env);
    const access = { type: JwtType.ACCESS, sessionId: 'session' };
    await expect(verifier.verifyJwt(jwt.sign(access), JwtType.ACCESS)).rejects.toMatchObject({ status: 401 });
    await expect(verifier.verifyJwt(jwt.sign({ ...access, authSource: 'oidc' }), JwtType.ACCESS)).resolves.toMatchObject(access);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
