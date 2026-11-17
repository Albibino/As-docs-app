import { UserRepo } from './user.repo';

describe('UserRepo', () => {
  it('cria novos usuários com Português (Brasil) como locale padrão', async () => {
    let insertedUser: Record<string, unknown> | undefined;
    const query = {
      values(values: Record<string, unknown>) {
        insertedUser = values;
        return this;
      },
      returning() {
        return this;
      },
      async executeTakeFirst() {
        return insertedUser;
      },
    };
    const db = {
      insertInto: () => query,
    } as any;

    await new UserRepo(db).insertUser(
      { email: 'novo-usuario@example.com' } as any,
    );

    expect(insertedUser?.locale).toBe('pt-BR');
  });
});
