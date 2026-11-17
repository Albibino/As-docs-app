import { AuthenticationExtension } from './authentication.extension';
import { UserRole } from '../../common/helpers/types/permission';

const userId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const pageId = '00000000-0000-4000-8000-000000000003';
const spaceId = '00000000-0000-4000-8000-000000000004';

function setup() {
  const tokenService = {
    verifyJwt: jest.fn().mockResolvedValue({ sub: userId, workspaceId }),
  };
  const userRepo = {
    findById: jest.fn().mockResolvedValue({
      id: userId,
      workspaceId,
      role: UserRole.MEMBER,
    }),
  };
  const pageRepo = {
    findById: jest.fn().mockResolvedValue({
      id: pageId,
      spaceId,
      workspaceId,
      creatorId: userId,
      deletedAt: null,
    }),
  };
  const spaceAuthorization = {
    resolve: jest.fn().mockResolvedValue({
      userId,
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      source: 'explicit',
    }),
  };
  const pagePermissionRepo = {
    canUserEditPage: jest.fn().mockResolvedValue({
      hasAnyRestriction: false,
      canAccess: true,
      canEdit: false,
    }),
    getEffectivePermission: jest.fn().mockResolvedValue({
      hasRestriction: false,
      permission: undefined,
      blocked: false,
    }),
  };
  const extension = new AuthenticationExtension(
    tokenService as never,
    userRepo as never,
    pageRepo as never,
    spaceAuthorization as never,
    pagePermissionRepo as never,
  );

  return { extension, spaceAuthorization };
}

describe('AuthenticationExtension', () => {
  it('keeps the creator collaboration session editable with only view access to the Space', async () => {
    const { extension } = setup();
    const payload = {
      documentName: `page.${pageId}`,
      token: 'token',
      connectionConfig: {},
    } as any;

    await extension.onAuthenticate(payload);

    expect(payload.connectionConfig.readOnly).not.toBe(true);
  });

  it('keeps an explicit editor collaboration session editable on an unrestricted page', async () => {
    const { extension, spaceAuthorization } = setup();
    const payload = {
      documentName: `page.${pageId}`,
      token: 'token',
      connectionConfig: {},
    } as any;

    spaceAuthorization.resolve.mockResolvedValueOnce({
      userId,
      canView: true,
      canCreate: false,
      canEdit: true,
      canDelete: false,
      source: 'explicit',
    });

    await extension.onAuthenticate(payload);

    expect(payload.connectionConfig.readOnly).not.toBe(true);
  });
});
