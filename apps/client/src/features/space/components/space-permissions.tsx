import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Center,
  Group,
  Loader,
  ScrollArea,
  Table,
  Text,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import {
  useSpacePermissionsQuery,
  useUpdateSpacePermissionsMutation,
} from "@/features/space/queries/space-query";
import { ISpacePermission } from "@/features/space/types/space-permission.types";

type PermissionKey = "canView" | "canCreate" | "canEdit" | "canDelete";

const permissionColumns: Array<{ key: PermissionKey; label: string }> = [
  { key: "canView", label: "View" },
  { key: "canCreate", label: "Create" },
  { key: "canEdit", label: "Edit" },
  { key: "canDelete", label: "Delete" },
];

function permissionsEqual(a: ISpacePermission[], b: ISpacePermission[]) {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index];
      return (
        item.userId === other.userId &&
        item.canView === other.canView &&
        item.canCreate === other.canCreate &&
        item.canEdit === other.canEdit &&
        item.canDelete === other.canDelete
      );
    })
  );
}

export function SpacePermissions({
  spaceId,
  canManage,
}: {
  spaceId: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const query = useSpacePermissionsQuery(spaceId, canManage);
  const updateMutation = useUpdateSpacePermissionsMutation();
  const [draft, setDraft] = useState<ISpacePermission[]>([]);
  const draftDirtyRef = useRef(false);

  useEffect(() => {
    draftDirtyRef.current = false;
    setDraft([]);
  }, [spaceId]);

  useEffect(() => {
    if (query.data?.items && !draftDirtyRef.current) {
      setDraft(query.data.items);
    }
  }, [query.data]);

  const saved = query.data?.items ?? [];
  const hasChanges = useMemo(
    () => !permissionsEqual(draft, saved),
    [draft, saved],
  );

  const setPermission = (
    userId: string,
    key: PermissionKey,
    value: boolean,
  ) => {
    draftDirtyRef.current = true;
    setDraft((current) =>
      current.map((member) => {
        if (member.userId !== userId || member.teamRole === "admin") {
          return member;
        }

        if (key === "canView" && !value) {
          return {
            ...member,
            canView: false,
            canCreate: false,
            canEdit: false,
            canDelete: false,
          };
        }

        return {
          ...member,
          [key]: value,
          ...(key !== "canView" && value ? { canView: true } : {}),
        };
      }),
    );
  };

  const save = async () => {
    await updateMutation.mutateAsync({
      spaceId,
      permissions: draft
        .filter((member) => member.teamRole !== "admin")
        .map(({ userId, canView, canCreate, canEdit, canDelete }) => ({
          userId,
          canView,
          canCreate,
          canEdit,
          canDelete,
        })),
    });
    draftDirtyRef.current = false;
  };

  const confirmSave = () => {
    modals.openConfirmModal({
      title: t("Confirm permission changes"),
      children: (
        <Text size="sm">{t("Save the pending space permissions?")}</Text>
      ),
      centered: true,
      labels: { confirm: t("Save"), cancel: t("Cancel") },
      onConfirm: save,
    });
  };

  if (query.isLoading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  if (!canManage) {
    return (
      <Text c="dimmed">
        {t("Only team administrators can manage space permissions")}
      </Text>
    );
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">
          {t("Team members with access to this space")}
        </Text>
        <Text size="xs" c="dimmed">
          {t(
            "Create lets members create and edit their own pages. Edit lets members edit accessible pages created by others. Delete lets them move accessible pages to trash.",
          )}
        </Text>
        <Group gap="sm">
          <Text
            size="xs"
            c={hasChanges ? "orange" : "dimmed"}
            aria-live="polite"
          >
            {t(hasChanges ? "Pending" : "Saved")}
          </Text>
          {hasChanges && (
            <Button
              size="xs"
              onClick={confirmSave}
              loading={updateMutation.isPending}
            >
              {t("Save")}
            </Button>
          )}
        </Group>
      </Group>

      <ScrollArea>
        <Table striped highlightOnHover withTableBorder miw={650}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("User")}</Table.Th>
              {permissionColumns.map((column) => (
                <Table.Th key={column.key}>{t(column.label)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {draft.map((member) => {
              const inherited = member.teamRole === "admin";
              return (
                <Table.Tr key={member.userId}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <CustomAvatar
                        avatarUrl={member.avatarUrl}
                        name={member.name}
                      />
                      <div>
                        <Text size="sm" fw={500}>
                          {member.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {member.email}
                        </Text>
                        {inherited && (
                          <Text size="xs" c="dimmed">
                            {t("Inherited from team administrator")}
                          </Text>
                        )}
                      </div>
                    </Group>
                  </Table.Td>
                  {permissionColumns.map((column) => (
                    <Table.Td key={column.key}>
                      <Checkbox
                        checked={member[column.key]}
                        disabled={inherited || updateMutation.isPending}
                        aria-label={t("{{permission}} access for {{name}}", {
                          permission: t(column.label),
                          name: member.name,
                        })}
                        onChange={(event) =>
                          setPermission(
                            member.userId,
                            column.key,
                            event.currentTarget.checked,
                          )
                        }
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </>
  );
}
