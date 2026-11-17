import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateSpaceDto } from '../dto/create-space.dto';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { Space, User } from '@tcc-docs/db/types/entity.types';
import { UpdateSpaceDto } from '../dto/update-space.dto';
import { executeTx } from '@tcc-docs/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { Feature } from '../../../common/features';
import { CursorPaginationResult } from '@tcc-docs/db/pagination/cursor-pagination';
import { LicenseCheckService } from '../../../integrations/environment/license-check.service';
import { TeamService } from '../../team/services/team.service';
import { SpaceAuthorizationService } from './space-authorization.service';
import { isWorkspaceAdmin } from '../../../common/helpers';
import { ListSpacesDto } from '../dto/list-spaces.dto';
import { SpacePermissionService } from './space-permission.service';
import { TeamMemberRepo } from '@tcc-docs/db/repos/team/team-member.repo';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';

@Injectable()
export class SpaceService {
  constructor(
    private spaceRepo: SpaceRepo,
    private workspaceRepo: WorkspaceRepo,
    private teamService: TeamService,
    private authorization: SpaceAuthorizationService,
    private permissionService: SpacePermissionService,
    private teamMemberRepo: TeamMemberRepo,
    private licenseCheckService: LicenseCheckService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async createSpace(
    authUser: User,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
    options?: { isPersonal?: boolean },
  ): Promise<Space> {
    let space = null;

    await executeTx(
      this.db,
      async (trx) => {
        await this.teamService.requireTeamAdmin(
          authUser,
          workspaceId,
          createSpaceDto.teamId,
          trx,
        );
        space = await this.create(
          authUser.id,
          workspaceId,
          createSpaceDto,
          trx,
          options,
        );

        const initialPermissions =
          createSpaceDto.permissions ??
          (await this.teamMemberRepo.getActiveMemberIds(space.teamId, trx)).map(
            (userId) => ({
              userId,
              canView: true,
              canCreate: true,
              canEdit: false,
              canDelete: false,
            }),
          );

        if (initialPermissions.length) {
          await this.permissionService.setInitialPermissions(
            authUser,
            space,
            initialPermissions,
            trx,
          );
        }
      },
      trx,
    );


    return { ...space, memberCount: 1 };
  }

  async create(
    userId: string,
    workspaceId: string,
    createSpaceDto: CreateSpaceDto,
    trx?: KyselyTransaction,
    options?: { isPersonal?: boolean },
  ): Promise<Space> {
    const slugExists = await this.spaceRepo.slugExists(
      createSpaceDto.slug,
      workspaceId,
      trx,
    );
    if (slugExists) {
      throw new BadRequestException(
        'Space slug exists. Please use a unique space slug',
      );
    }

    return await this.spaceRepo.insertSpace(
      {
        name: createSpaceDto.name ?? 'untitled space',
        description: createSpaceDto.description ?? '',
        creatorId: userId,
        workspaceId: workspaceId,
        teamId: createSpaceDto.teamId,
        slug: createSpaceDto.slug,
        isPersonal: options?.isPersonal ?? false,
      },
      trx,
    );
  }

  async updateSpace(
    updateSpaceDto: UpdateSpaceDto,
    workspaceId: string,
  ): Promise<Space> {
    if ('teamId' in updateSpaceDto) {
      throw new BadRequestException('A space cannot be transferred');
    }
    if (updateSpaceDto?.slug) {
      const slugExists = await this.spaceRepo.slugExists(
        updateSpaceDto.slug,
        workspaceId,
        undefined,
        updateSpaceDto.spaceId,
      );

      if (slugExists) {
        throw new BadRequestException(
          'Space slug exists. Please use a unique space slug',
        );
      }
    }

    if (typeof updateSpaceDto.allowViewerComments !== 'undefined') {
      const workspace = await this.workspaceRepo.findById(workspaceId, {
        withLicenseKey: true,
      });
      if (
        !this.licenseCheckService.hasFeature(
          workspace.licenseKey,
          Feature.VIEWER_COMMENTS,
          workspace.plan,
        )
      ) {
        throw new ForbiddenException(
          'Feature em desenvolvimento, novidades em breve.',
        );
      }
    }

    let updatedSpace: Space;

    await executeTx(this.db, async (trx) => {
      if (typeof updateSpaceDto.allowViewerComments !== 'undefined') {
        await this.spaceRepo.updateCommentSettings(
          updateSpaceDto.spaceId,
          workspaceId,
          'allowViewerComments',
          updateSpaceDto.allowViewerComments,
          trx,
        );
      }

      updatedSpace = await this.spaceRepo.updateSpace(
        {
          name: updateSpaceDto.name,
          description: updateSpaceDto.description,
          slug: updateSpaceDto.slug,
        },
        updateSpaceDto.spaceId,
        workspaceId,
        trx,
      );
    });

    return updatedSpace;
  }

  async getSpaceInfo(spaceId: string, workspaceId: string): Promise<Space> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId, {
      includeMemberCount: true,
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    return space;
  }

  async getWorkspaceSpaces(
    user: User,
    workspaceId: string,
    pagination: ListSpacesDto,
  ): Promise<CursorPaginationResult<Space>> {
    if (pagination.teamId) {
      await this.teamService.getTeam(user, workspaceId, pagination.teamId);
    }

    const result = await this.spaceRepo.getSpacesInWorkspace(
      workspaceId,
      pagination,
      {
        userId: isWorkspaceAdmin(user.role) ? undefined : user.id,
        teamId: pagination.teamId,
        archived: pagination.archived,
      },
    );
    result.items = await Promise.all(
      result.items
        .filter(
          (space) => !pagination.teamId || space.teamId === pagination.teamId,
        )
        .map(async (space) => ({
          ...space,
          permission: await this.authorization.resolve(user, space.id),
        })),
    );
    return result;
  }

  async archiveSpace(
    spaceId: string,
    workspaceId: string,
    archivedById: string,
  ): Promise<void> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    if (space.archivedAt) return;
    await this.spaceRepo.archiveSpace(spaceId, workspaceId, archivedById);
    await this.spaceMemberRepo.invalidateSpaceRoles(spaceId);

  }

  async restoreSpace(spaceId: string, workspaceId: string): Promise<void> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) throw new NotFoundException('Space not found');
    if (!space.archivedAt) return;

    await this.spaceRepo.restoreSpace(spaceId, workspaceId);
    await this.spaceMemberRepo.invalidateSpaceRoles(spaceId);
  }
}
