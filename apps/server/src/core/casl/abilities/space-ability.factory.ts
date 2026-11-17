import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability';
import { User } from '@tcc-docs/db/types/entity.types';
import {
  SpaceCaslAction,
  ISpaceAbility,
  SpaceCaslSubject,
} from '../interfaces/space-ability.type';
import { SpaceAuthorizationService } from '../../space/services/space-authorization.service';

@Injectable()
export default class SpaceAbilityFactory {
  constructor(private readonly authorization: SpaceAuthorizationService) {}
  async createForUser(user: User, spaceId: string) {
    const permission = await this.authorization.resolve(user, spaceId);
    if (!permission) throw new NotFoundException('Space not found');
    return buildSpaceAbility(permission);
  }
}

function buildSpaceAbility(permission: {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  source: string;
}) {
  const { can, build } = new AbilityBuilder<MongoAbility<ISpaceAbility>>(
    createMongoAbility,
  );
  const inheritedAdmin =
    permission.source === 'workspace-admin' || permission.source === 'team-admin';
  if (inheritedAdmin) {
    can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
    can(SpaceCaslAction.Manage, SpaceCaslSubject.Member);
    can(SpaceCaslAction.Manage, SpaceCaslSubject.Label);
    can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
    can(SpaceCaslAction.Delete, SpaceCaslSubject.Page);
  }
  if (permission.canView) {
    can(SpaceCaslAction.Read, SpaceCaslSubject.Settings);
    can(SpaceCaslAction.Read, SpaceCaslSubject.Member);
    can(SpaceCaslAction.Read, SpaceCaslSubject.Page);
    can(SpaceCaslAction.Read, SpaceCaslSubject.Label);
  }
  if (permission.canCreate) can(SpaceCaslAction.Create, SpaceCaslSubject.Page);
  if (permission.canEdit) can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
  if (permission.canDelete) can(SpaceCaslAction.Delete, SpaceCaslSubject.Page);
  return build();
}
