import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { User } from '@tcc-docs/db/types/entity.types';
import { TokenService } from './token.service';
import { SessionService } from '../../session/session.service';
import { findTccUser, TCC_USERS } from '../../tcc/tcc.constants';
import { isUserDisabled } from '../../../common/helpers';

/**
 * TCC: não há login. A pessoa escolhe "Usuário 1" ou "Usuário 2" e recebe a
 * mesma sessão JWT (cookie `authToken` + linha em `user_sessions`) que o fluxo
 * de login emitia antes. Assim WebSocket, colaboração em tempo real e todas as
 * verificações de permissão continuam funcionando sem alteração.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userRepo: UserRepo,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
  ) {}

  listSelectableUsers(workspaceId: string) {
    return Promise.all(
      TCC_USERS.map(async (definition) => {
        const user = await this.userRepo.findByEmail(
          definition.email,
          workspaceId,
        );
        return user
          ? { key: definition.key, id: user.id, name: user.name }
          : null;
      }),
    ).then((users) => users.filter(Boolean));
  }

  async selectUser(userKey: string, workspaceId: string): Promise<string> {
    const definition = findTccUser(userKey);
    const user = definition
      ? await this.userRepo.findByEmail(definition.email, workspaceId)
      : null;
    if (!user || isUserDisabled(user)) {
      throw new NotFoundException('User not found');
    }
    await this.userRepo.updateLastLogin(user.id, workspaceId);
    return this.sessionService.createSessionAndToken(user);
  }

  async getCollabToken(user: User, workspaceId: string) {
    const token = await this.tokenService.generateCollabToken(
      user,
      workspaceId,
    );
    return { token };
  }
}
