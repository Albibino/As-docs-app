import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';

describe('AuthController (TCC)', () => {
  let controller: AuthController;
  let oidcEnabled: boolean;
  const authService = {
    selectUser: jest.fn().mockResolvedValue('jwt-token'),
    listSelectableUsers: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    oidcEnabled = false;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      .useMocker(() => ({
        getCookieExpiresIn: () => new Date(Date.now() + 1000),
        isHttps: () => false,
        isOidcEnabled: () => oidcEnabled,
      }))
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('blocks the public selector when OIDC is enabled', async () => {
    oidcEnabled = true;
    const res = { setCookie: jest.fn() } as any;
    const workspace = { id: 'workspace-1' } as any;
    await expect(
      controller.selectUser({ userKey: 'usuario-2' }, workspace, res),
    ).rejects.toMatchObject({ status: 410 });
    expect(() => controller.listUsers(workspace)).toThrow();
    expect(authService.selectUser).not.toHaveBeenCalled();
    expect(authService.listSelectableUsers).not.toHaveBeenCalled();
    expect(res.setCookie).not.toHaveBeenCalled();
  });

  it('sets the session cookie for the chosen fixed user', async () => {
    const res = { setCookie: jest.fn() } as any;
    await controller.selectUser(
      { userKey: 'usuario-2' },
      { id: 'workspace-1' } as any,
      res,
    );
    expect(authService.selectUser).toHaveBeenCalledWith(
      'usuario-2',
      'workspace-1',
    );
    expect(res.setCookie).toHaveBeenCalledWith(
      'authToken',
      'jwt-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });
});
