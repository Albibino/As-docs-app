/**
 * Identidade fixa do TCC: um workspace, um time, um space e dois usuários.
 *
 * Não há cadastro, login nem convite. A pessoa escolhe "Usuário 1" ou
 * "Usuário 2" na tela inicial e o servidor emite a mesma sessão JWT que o
 * fluxo de login emitia antes — o resto da aplicação (WebSocket, colaboração
 * em tempo real, permissões) continua igual.
 */
export const TCC_WORKSPACE = {
  name: 'TCC Docs',
  hostname: 'tcc',
} as const;

export const TCC_TEAM = {
  name: 'Time TCC',
  description: 'Time único do TCC',
} as const;

export const TCC_SPACE = {
  name: 'Documentos',
  slug: 'documentos',
  description: 'Space único do TCC',
} as const;

export const TCC_USERS = [
  { key: 'usuario-1', name: 'Usuário 1', email: 'usuario1@tcc.local' },
  { key: 'usuario-2', name: 'Usuário 2', email: 'usuario2@tcc.local' },
] as const;

export type TccUserKey = (typeof TCC_USERS)[number]['key'];

export function findTccUser(key: string) {
  return TCC_USERS.find((user) => user.key === key);
}
