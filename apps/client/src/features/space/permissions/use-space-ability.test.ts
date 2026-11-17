import { describe, expect, it } from "vitest";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import { useSpaceAbility } from "./use-space-ability";
import type { ISpaceAccess } from "@/features/space/types/space-permission.types.ts";

describe("useSpaceAbility", () => {
  it("grants page edit through an explicit Space ACL and inherited administration", () => {
    const explicit = useSpaceAbility({
      userId: "user-1",
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      source: "explicit",
    } as unknown as ISpaceAccess);
    const inheritedAdmin = useSpaceAbility({
      userId: "user-1",
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      source: "team-admin",
    } as unknown as ISpaceAccess);

    expect(explicit.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page)).toBe(
      true,
    );
    expect(
      inheritedAdmin.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
    ).toBe(true);
  });
});
