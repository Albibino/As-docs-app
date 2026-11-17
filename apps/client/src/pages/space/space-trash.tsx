import Trash from "@/features/page/trash/components/trash.tsx";
import { useParams } from "react-router-dom";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import React from "react";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";

export default function SpaceTrash() {
  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

  const spaceAbility = useSpaceAbility(space?.permission);

  if (!space) {
    return <></>;
  }

  if (spaceAbility.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
    return <></>;
  }

  return <Trash />;
}
