import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from "@casl/ability";
import {
  SpaceAbility,
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import { ISpaceAccess } from "@/features/space/types/space-permission.types.ts";

export const useSpaceAbility = (permission?: ISpaceAccess | null) => {
  const { can, build } = new AbilityBuilder<MongoAbility<SpaceAbility>>(
    createMongoAbility,
  );

  if (permission?.source !== "explicit" && permission) {
    can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
    can(SpaceCaslAction.Manage, SpaceCaslSubject.Member);
    can(SpaceCaslAction.Manage, SpaceCaslSubject.Label);
    can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
    can(SpaceCaslAction.Delete, SpaceCaslSubject.Page);
  }

  if (permission?.canView) {
    can(SpaceCaslAction.Read, SpaceCaslSubject.Settings);
    can(SpaceCaslAction.Read, SpaceCaslSubject.Member);
    can(SpaceCaslAction.Read, SpaceCaslSubject.Page);
    can(SpaceCaslAction.Read, SpaceCaslSubject.Label);
  }
  if (permission?.canCreate) can(SpaceCaslAction.Create, SpaceCaslSubject.Page);
  if (permission?.canEdit) can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
  if (permission?.canDelete) can(SpaceCaslAction.Delete, SpaceCaslSubject.Page);

  const ability = build();

  return {
    can: ability.can.bind(ability),
    cannot: ability.cannot.bind(ability),
  };
};
