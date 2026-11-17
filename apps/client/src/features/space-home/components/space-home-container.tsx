import { Button, Stack, Text, Title } from "@mantine/core";
import { IconFileText, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ISpace } from "@/features/space/types/space.types";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";
import { useGetSidebarPagesQuery } from "@/features/page/queries/page-query";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation";
import { EmptyState } from "@/components/ui/empty-state";
import { SpacePagesCard } from "./space-pages-card";
import classes from "./space-home.module.css";

// TCC: a home do space é fixa (título, descrição e páginas do space). A
// personalização por usuário e pela equipe foi removida.
export function SpaceHomeContainer({ space }: { space: ISpace }) {
  const { t } = useTranslation();
  const ability = useSpaceAbility(space.permission);
  const canCreatePage = ability.can(
    SpaceCaslAction.Create,
    SpaceCaslSubject.Page,
  );
  const { handleCreate } = useTreeMutation(space.id);
  const rootPagesQuery = useGetSidebarPagesQuery({ spaceId: space.id });
  const rootPages =
    rootPagesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (
    !rootPagesQuery.isLoading &&
    !rootPagesQuery.isError &&
    rootPages.length === 0
  ) {
    return (
      <div className={classes.root}>
        <EmptyState
          icon={IconFileText}
          title={t("This space does not have any pages yet")}
          description={t("Create the first page of this space.")}
          action={
            canCreatePage ? (
              <Button
                mt="sm"
                leftSection={<IconPlus size={16} />}
                onClick={() => handleCreate(null)}
              >
                {t("Create first page")}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <Stack gap={4} className={classes.header}>
        <Title order={1}>{space.name}</Title>
        {space.description && <Text c="dimmed">{space.description}</Text>}
      </Stack>
      <SpacePagesCard
        spaceSlug={space.slug}
        pages={rootPages}
        isLoading={rootPagesQuery.isLoading}
        isError={rootPagesQuery.isError}
      />
    </div>
  );
}
