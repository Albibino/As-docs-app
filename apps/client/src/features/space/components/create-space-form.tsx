import {
  Group,
  Box,
  Button,
  Checkbox,
  Loader,
  Table,
  TextInput,
  Stack,
  Textarea,
  Text,
  Select,
} from "@mantine/core";
import React, { useEffect, useRef, useState } from "react";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod/v4";
import { useNavigate } from "react-router-dom";
import { useCreateSpaceMutation } from "@/features/space/queries/space-query.ts";
import { computeSpaceSlug } from "@/lib";
import { getSpaceUrl } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";
import { useTeamsQuery } from "@/features/team/queries/team-query.ts";
import { useTeamMembersQuery } from "@/features/team/queries/team-query.ts";
import type { ICreateSpace } from "@/features/space/types/space.types.ts";

type SpacePermissionDraft = {
  userId: string;
  teamRole: "admin" | "member";
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const permissionKeys = ["canView", "canCreate", "canEdit", "canDelete"] as const;

const createFormSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().trim().min(2).max(100),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
        t(
          "Space slug must start with a letter or number and may contain hyphens and underscores",
        ),
      ),
    description: z.string().max(500),
    teamId: z.string().uuid(),
  });
type FormValues = z.infer<ReturnType<typeof createFormSchema>>;

export function CreateSpaceForm({ teamId }: { teamId?: string }) {
  const { t } = useTranslation();
  const createSpaceMutation = useCreateSpaceMutation();
  const navigate = useNavigate();
  const { data: teams, isLoading: teamsLoading } = useTeamsQuery({
    limit: 100,
  });
  const [permissionDraft, setPermissionDraft] = useState<
    Record<string, SpacePermissionDraft>
  >({});
  const permissionDraftDirtyRef = useRef(false);

  const form = useForm<FormValues>({
    validate: zod4Resolver(createFormSchema(t)),
    validateInputOnChange: ["slug"],
    initialValues: {
      name: "",
      slug: "",
      description: "",
      teamId: teamId ?? "",
    },
  });
  const teamMembersQuery = useTeamMembersQuery(
    form.values.teamId || undefined,
    { limit: 100 },
  );

  useEffect(() => {
    permissionDraftDirtyRef.current = false;
    setPermissionDraft({});
  }, [form.values.teamId]);

  useEffect(() => {
    if (
      !form.values.teamId ||
      !teamMembersQuery.data?.items ||
      permissionDraftDirtyRef.current
    ) {
      return;
    }

    setPermissionDraft(
      Object.fromEntries(
        teamMembersQuery.data.items.map((member) => [
          member.userId,
          {
            userId: member.userId,
            teamRole: member.role,
            canView: true,
            canCreate: member.role === "member",
            canEdit: false,
            canDelete: false,
          },
        ]),
      ),
    );
  }, [form.values.teamId, teamMembersQuery.data]);

  useEffect(() => {
    const name = form.values.name;
    const words = name.trim().split(/\s+/);

    // Check if the last character is a space or if the last word is a single character (indicating it's in progress)
    const lastChar = name[name.length - 1];
    const lastWordIsIncomplete =
      words.length > 1 && words[words.length - 1].length === 1;

    if (lastChar !== " " || lastWordIsIncomplete) {
      const slug = computeSpaceSlug(name);
      form.setFieldValue("slug", slug);
    }
  }, [form.values.name]);

  const handleSubmit = async (data: FormValues) => {
    const spaceData: ICreateSpace = {
      ...data,
      permissions: Object.values(permissionDraft)
        .filter((permission) => permission.teamRole === "member")
        .map(({ userId, canView, canCreate, canEdit, canDelete }) => ({
          userId,
          canView,
          canCreate,
          canEdit,
          canDelete,
        })),
    };

    const createdSpace = await createSpaceMutation.mutateAsync(spaceData);
    navigate(getSpaceUrl(createdSpace.slug));
  };

  const updatePermission = (
    userId: string,
    key: (typeof permissionKeys)[number],
    value: boolean,
  ) => {
    permissionDraftDirtyRef.current = true;
    setPermissionDraft((current) => {
      const permission = current[userId];
      if (!permission || permission.teamRole === "admin") return current;

      if (key === "canView" && !value) {
        return {
          ...current,
          [userId]: {
            ...permission,
            canView: false,
            canCreate: false,
            canEdit: false,
            canDelete: false,
          },
        };
      }

      return {
        ...current,
        [userId]: {
          ...permission,
          [key]: value,
          ...(key !== "canView" && value ? { canView: true } : {}),
        },
      };
    });
  };

  const clearPermissions = () => {
    permissionDraftDirtyRef.current = true;
    setPermissionDraft((current) =>
      Object.fromEntries(
        Object.entries(current).map(([userId, permission]) => [
          userId,
          permission.teamRole === "admin"
            ? permission
            : {
                ...permission,
                canView: false,
                canCreate: false,
                canEdit: false,
                canDelete: false,
              },
        ]),
      ),
    );
  };

  function handleValidationFailure(errors: Record<string, unknown>) {
    const firstInvalidId = Object.keys(errors)[0];
    if (firstInvalidId) {
      document.getElementById(firstInvalidId)?.focus();
    }
  }

  return (
    <>
      <Box maw="500" mx="auto">
        <form
          onSubmit={form.onSubmit(
            (values) => handleSubmit(values),
            handleValidationFailure,
          )}
        >
          <Text size="sm" c="dimmed" mb="sm">
            {t("* indicates required fields")}
          </Text>
          <Stack>
            <TextInput
              withAsterisk
              id="name"
              label={t("Space name")}
              placeholder={t("e.g Product Team")}
              variant="filled"
              data-autofocus
              errorProps={{ role: "alert" }}
              {...form.getInputProps("name")}
            />

            <TextInput
              withAsterisk
              id="slug"
              label={t("Space slug")}
              placeholder={t("e.g product")}
              variant="filled"
              errorProps={{ role: "alert" }}
              {...form.getInputProps("slug")}
            />

            <Textarea
              id="description"
              label={t("Space description")}
              placeholder={t("e.g Space for product team")}
              variant="filled"
              autosize
              minRows={2}
              maxRows={8}
              errorProps={{ role: "alert" }}
              {...form.getInputProps("description")}
            />

            <Select
              withAsterisk
              id="teamId"
              label={t("Team")}
              placeholder={t("Select a team")}
              data={
                teams?.items.map((team) => ({
                  value: team.id,
                  label: team.name,
                })) ?? []
              }
              searchable
              disabled={teamsLoading || Boolean(teamId)}
              errorProps={{ role: "alert" }}
              {...form.getInputProps("teamId")}
            />

            {form.values.teamId && (
              <Stack gap="xs">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" fw={500}>
                      {t("Configure initial Space permissions")}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t(
                        "Create lets members create and edit their own pages. Edit lets members edit accessible pages created by others. Delete lets them move accessible pages to trash.",
                      )}
                    </Text>
                  </div>
                  <Button
                    variant="subtle"
                    size="xs"
                    type="button"
                    onClick={clearPermissions}
                  >
                    {t("Clear all permissions")}
                  </Button>
                </Group>

                {teamMembersQuery.isPending ? (
                  <Loader size="sm" />
                ) : teamMembersQuery.data?.items.length ? (
                  <Table striped withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("User")}</Table.Th>
                        <Table.Th>{t("View")}</Table.Th>
                        <Table.Th>{t("Create")}</Table.Th>
                        <Table.Th>{t("Edit")}</Table.Th>
                        <Table.Th>{t("Delete")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {teamMembersQuery.data.items.map((member) => {
                        const permission = permissionDraft[member.userId];
                        if (!permission) return null;
                        const inherited = permission.teamRole === "admin";

                        return (
                          <Table.Tr key={member.userId}>
                            <Table.Td>
                              <Text size="sm">{member.name}</Text>
                              {inherited && (
                                <Text size="xs" c="dimmed">
                                  {t("Inherited from team administrator")}
                                </Text>
                              )}
                            </Table.Td>
                            {permissionKeys.map((key) => (
                              <Table.Td key={key}>
                                <Checkbox
                                  checked={permission[key]}
                                  disabled={inherited}
                                  aria-label={t(
                                    "{{permission}} access for {{name}}",
                                    {
                                      permission: t(
                                        key === "canView"
                                          ? "View"
                                          : key === "canCreate"
                                            ? "Create"
                                            : key === "canEdit"
                                              ? "Edit"
                                            : "Delete",
                                      ),
                                      name: member.name,
                                    },
                                  )}
                                  onChange={(event) =>
                                    updatePermission(
                                      member.userId,
                                      key,
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
                ) : (
                  <Text size="sm" c="dimmed">
                    {t("No members in this team")}
                  </Text>
                )}
              </Stack>
            )}
          </Stack>

          <Group justify="flex-end" mt="md">
            <Button
              type="submit"
              disabled={Boolean(
                form.values.teamId && teamMembersQuery.isPending,
              )}
            >
              {t("Create")}
            </Button>
          </Group>
        </form>
      </Box>
    </>
  );
}
