import { NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService (TCC)', () => {
  const user = { id: 'u2', name: 'Usuário 2', workspaceId: 'w1' } as any;

  function setup(found: any = user) {
    const userRepo = {
      findByEmail: jest.fn().mockResolvedValue(found),
      updateLastLogin: jest.fn(),
    };
    const sessionService = {
      createSessionAndToken: jest.fn().mockResolvedValue('jwt'),
    };
    const service = new AuthService(
      userRepo as any,
      {} as any,
      sessionService as any,
    );
    return { service, userRepo, sessionService };
  }

  it('issues the regular JWT session for a fixed user', async () => {
    const { service, userRepo, sessionService } = setup();
    await expect(service.selectUser('usuario-2', 'w1')).resolves.toBe('jwt');
    expect(userRepo.findByEmail).toHaveBeenCalledWith('usuario2@tcc.local', 'w1');
    expect(sessionService.createSessionAndToken).toHaveBeenCalledWith(user);
  });

  it('rejects any user key outside the two fixed users', async () => {
    const { service, userRepo } = setup();
    await expect(service.selectUser('admin', 'w1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(userRepo.findByEmail).not.toHaveBeenCalled();
  });

  it('lists exactly the two fixed users', async () => {
    const { service } = setup();
    const users = await service.listSelectableUsers('w1');
    expect(users.map((item: any) => item.key)).toEqual(['usuario-1', 'usuario-2']);
  });
});
