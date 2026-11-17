import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PagePropertyRepo } from '@tcc-docs/db/repos/page-property/page-property.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { User } from '@tcc-docs/db/types/entity.types';
import { KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import {
  PagePropertyType,
  parsePagePropertyConfig,
  parsePagePropertyValue,
} from './schemas/page-property.schema';

@Injectable()
export class PagePropertyService {
  constructor(
    private readonly pagePropertyRepo: PagePropertyRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  listDefinitions(spaceId: string, workspaceId: string) {
    return this.pagePropertyRepo.listDefinitions(spaceId, workspaceId);
  }

  listWorkspaceDefinitions(workspaceId: string) {
    return this.pagePropertyRepo.listWorkspaceDefinitions(workspaceId);
  }

  getDefinition(propertyId: string, workspaceId: string) {
    return this.requireDefinition(propertyId, workspaceId);
  }

  async createDefinition(input: {
    workspaceId: string;
    spaceId: string | null;
    userId: string;
    name: string;
    type: PagePropertyType;
    config?: unknown;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Property name is required');
    const config = parsePagePropertyConfig(input.type, input.config ?? {});

    try {
      return await this.pagePropertyRepo.createDefinition({
        workspaceId: input.workspaceId,
        spaceId: input.spaceId,
        createdById: input.userId,
        name,
        type: input.type,
        config,
      });
    } catch (error) {
      this.rethrowDefinitionNameConflict(error);
    }
  }

  async updateDefinition(input: {
    propertyId: string;
    workspaceId: string;
    name?: string;
    config?: unknown;
    position?: number;
  }) {
    const definition = await this.requireDefinition(
      input.propertyId,
      input.workspaceId,
    );
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('Property name is required');
    }

    const config =
      input.config === undefined
        ? undefined
        : parsePagePropertyConfig(
            definition.type as PagePropertyType,
            input.config,
          );

    if (definition.type === 'person' && config !== undefined) {
      const currentConfig = parsePagePropertyConfig(
        'person',
        definition.config,
      );
      const nextConfig = parsePagePropertyConfig('person', config);
      if (
        currentConfig.allowMultiple !== nextConfig.allowMultiple &&
        (await this.pagePropertyRepo.countValues(definition.id)) > 0
      ) {
        throw new BadRequestException(
          'Person cardinality cannot change while values exist',
        );
      }
    }

    try {
      const updated = await this.pagePropertyRepo.updateDefinition(
        definition.id,
        input.workspaceId,
        {
          ...(name !== undefined ? { name } : {}),
          ...(config !== undefined ? { config } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        },
      );
      if (!updated) throw new NotFoundException('Page property not found');
      return updated;
    } catch (error) {
      this.rethrowDefinitionNameConflict(error);
    }
  }

  async deleteDefinition(propertyId: string, workspaceId: string) {
    await this.requireDefinition(propertyId, workspaceId);
    await this.pagePropertyRepo.deleteDefinition(propertyId, workspaceId);
    return { success: true };
  }

  async getValues(pageId: string, workspaceId: string, user: User) {
    const page = await this.requirePage(pageId, workspaceId);
    await this.pageAccessService.validateCanView(page, user);
    return this.pagePropertyRepo.listValues(page.id);
  }

  async setValue(
    input: {
      pageId: string;
      propertyId: string;
      workspaceId: string;
      user: User;
      value: unknown;
    },
    trx?: KyselyTransaction,
  ) {
    const [page, definition] = await Promise.all([
      this.requirePage(input.pageId, input.workspaceId, trx),
      this.requireDefinition(input.propertyId, input.workspaceId, trx),
    ]);
    await this.pageAccessService.validateCanEdit(page, input.user);
    if (definition.spaceId !== null && page.spaceId !== definition.spaceId) {
      throw new BadRequestException(
        'Page and property definition must belong to the same scope',
      );
    }

    const value = parsePagePropertyValue(
      {
        type: definition.type as PagePropertyType,
        config: definition.config,
      },
      input.value,
    );

    if (definition.type === 'person' && value !== null) {
      const personIds = Array.isArray(value) ? value : [value as string];
      if (definition.spaceId === null) {
        await this.validateWorkspacePersonIds(personIds, input.workspaceId);
      } else {
        await this.validatePersonIds(personIds, page.spaceId);
      }
    }

    if (value === null) {
      if (trx) {
        await this.pagePropertyRepo.deleteValue(page.id, definition.id, trx);
      } else {
        await this.pagePropertyRepo.deleteValue(page.id, definition.id);
      }
      return { pageId: page.id, propertyId: definition.id, value: null };
    }

    const valueInput = {
      pageId: page.id,
      propertyId: definition.id,
      value,
      updatedById: input.user.id,
    };
    return trx
      ? this.pagePropertyRepo.upsertValue(valueInput, trx)
      : this.pagePropertyRepo.upsertValue(valueInput);
  }

  private async validatePersonIds(userIds: string[], spaceId: string) {
    const uniqueUserIds = [...new Set(userIds)];
    const roles = await Promise.all(
      uniqueUserIds.map((userId) =>
        this.spaceMemberRepo.getUserSpaceRoles(userId, spaceId),
      ),
    );
    if (roles.some((userRoles) => !userRoles?.length)) {
      throw new BadRequestException(
        'Person values must reference members of the page space',
      );
    }
  }

  private async validateWorkspacePersonIds(
    userIds: string[],
    workspaceId: string,
  ) {
    const uniqueUserIds = [...new Set(userIds)];
    const users = await Promise.all(
      uniqueUserIds.map((userId) =>
        this.userRepo.findById(userId, workspaceId),
      ),
    );
    if (users.some((user) => !user || user.deletedAt || user.deactivatedAt)) {
      throw new BadRequestException(
        'Person values must reference active workspace members',
      );
    }
  }

  private rethrowDefinitionNameConflict(error: unknown): never {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === '23505'
    ) {
      throw new ConflictException(
        'A page property with this name already exists in this scope',
      );
    }
    throw error;
  }

  private async requireDefinition(
    propertyId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ) {
    const definition = await this.pagePropertyRepo.findDefinition(
      propertyId,
      workspaceId,
      trx,
    );
    if (!definition) throw new NotFoundException('Page property not found');
    return definition;
  }

  private async requirePage(
    pageId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ) {
    const page = await this.pageRepo.findById(pageId, { trx, withLock: !!trx });
    if (!page || page.workspaceId !== workspaceId || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }
}
