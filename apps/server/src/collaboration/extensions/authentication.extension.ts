import { Extension, onAuthenticatePayload } from '@hocuspocus/server';
import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TokenService } from '../../core/auth/services/token.service';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { isUserDisabled } from '../../common/helpers';
import { getCollaborationResource } from '../collaboration.util';
import { JwtCollabPayload, JwtType } from '../../core/auth/dto/jwt-payload';
import { User } from '@tcc-docs/db/types/entity.types';
import { SpaceAuthorizationService } from '../../core/space/services/space-authorization.service';

@Injectable()
export class AuthenticationExtension implements Extension {
  private readonly logger = new Logger(AuthenticationExtension.name);

  constructor(
    private tokenService: TokenService,
    private userRepo: UserRepo,
    private pageRepo: PageRepo,
    private readonly spaceAuthorization: SpaceAuthorizationService,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  async onAuthenticate(data: onAuthenticatePayload) {
    const { documentName, token } = data;
    const resource = getCollaborationResource(documentName);

    let jwtPayload: JwtCollabPayload;

    try {
      jwtPayload = await this.tokenService.verifyJwt(token, JwtType.COLLAB);
    } catch (error) {
      throw new UnauthorizedException('Invalid collab token');
    }

    const userId = jwtPayload.sub;
    const workspaceId = jwtPayload.workspaceId;

    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user) {
      throw new UnauthorizedException();
    }

    if (isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    const page = await this.pageRepo.findById(resource.id);
    if (!page) {
      this.logger.debug(`Page not found: ${resource.id}`);
      throw new NotFoundException('Page not found');
    }

    const spacePermission = await this.spaceAuthorization.resolve(
      user,
      page.spaceId,
    );

    if (!spacePermission) {
      this.logger.warn(`User not authorized to access page: ${resource.id}`);
      throw new UnauthorizedException();
    }

    // Check page-level permissions
    const { hasAnyRestriction, canAccess, canEdit } =
      await this.pagePermissionRepo.canUserEditPage(user.id, page.id);
    const explicitRule = await this.pagePermissionRepo.getEffectivePermission(
      user.id,
      page.id,
    );
    const inheritedAdmin =
      spacePermission.source === 'workspace-admin' ||
      spacePermission.source === 'team-admin';

    if (hasAnyRestriction || explicitRule.permission || explicitRule.blocked) {
      if (!canAccess && !inheritedAdmin && page.creatorId !== user.id) {
        this.logger.warn(
          `User ${user.id} denied page-level access to page: ${resource.id}`,
        );
        throw new UnauthorizedException();
      }

      if (!canEdit && !inheritedAdmin && page.creatorId !== user.id) {
        data.connectionConfig.readOnly = true;
        this.logger.debug(
          `User ${user.id} granted readonly access to restricted page: ${resource.id}`,
        );
      }
    } else {
      // On unrestricted pages, Space editing also allows editing other authors.
      if (
        !inheritedAdmin &&
        page.creatorId !== user.id &&
        !spacePermission.canEdit
      ) {
        data.connectionConfig.readOnly = true;
        this.logger.debug(
          `User granted readonly access to page: ${resource.id}`,
        );
      }
    }

    if (page.deletedAt) {
      data.connectionConfig.readOnly = true;
    }

    this.logger.debug(`Authenticated user ${user.id} on page ${resource.id}`);

    return {
      user,
    };
  }
}
