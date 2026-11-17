import {
  ActionIcon,
  Checkbox,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCheck,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreatePagePropertyDefinitionMutation,
  useCreateWorkspacePagePropertyDefinitionMutation,
  useDeletePagePropertyDefinitionMutation,
  useDeleteWorkspacePagePropertyDefinitionMutation,
  usePagePropertyDefinitionsQuery,
  useUpdatePagePropertyDefinitionMutation,
  useUpdateWorkspacePagePropertyDefinitionMutation,
  useWorkspacePagePropertyDefinitionsQuery,
} from "../queries/page-property-query";
import {
  PagePropertyConfig,
  PagePropertyDefinition,
  PagePropertyType,
} from "../types/page-property.types";
import classes from "./space-page-properties-settings.module.css";

export type SpacePagePropertiesSettingsProps = {
  spaceId?: string;
  canManage?: boolean;
};

export function SpacePagePropertiesSettings({
  spaceId,
  canManage = false,
}: SpacePagePropertiesSettingsProps) {
  const { t } = useTranslation();
  const isWorkspaceScope = !spaceId;
  const spaceDefinitionsQuery = usePagePropertyDefinitionsQuery(spaceId ?? "");
  const workspaceDefinitionsQuery =
    useWorkspacePagePropertyDefinitionsQuery(isWorkspaceScope);
  const definitionsQuery = isWorkspaceScope
    ? workspaceDefinitionsQuery
    : spaceDefinitionsQuery;
  const createSpaceMutation = useCreatePagePropertyDefinitionMutation(
    spaceId ?? "",
  );
  const createWorkspaceMutation =
    useCreateWorkspacePagePropertyDefinitionMutation();
  const updateSpaceMutation = useUpdatePagePropertyDefinitionMutation(
    spaceId ?? "",
  );
  const updateWorkspaceMutation =
    useUpdateWorkspacePagePropertyDefinitionMutation();
  const updateMutation = isWorkspaceScope
    ? updateWorkspaceMutation
    : updateSpaceMutation;
  const deleteSpaceMutation = useDeletePagePropertyDefinitionMutation(
    spaceId ?? "",
  );
  const deleteWorkspaceMutation =
    useDeleteWorkspacePagePropertyDefinitionMutation();
  const deleteMutation = isWorkspaceScope
    ? deleteWorkspaceMutation
    : deleteSpaceMutation;
  const [name, setName] = useState("");
  const [type, setType] = useState<PagePropertyType>("date");
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [editing, setEditing] = useState<PagePropertyDefinition | null>(null);
  const [editName, setEditName] = useState("");
  const [editAllowMultiple, setEditAllowMultiple] = useState(false);

  const create = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    try {
      const config: PagePropertyConfig =
        type === "person" ? { allowMultiple } : {};
      const input = {
        name: trimmedName,
        type,
        config,
      };
      if (spaceId) {
        await createSpaceMutation.mutateAsync({ ...input, spaceId });
      } else {
        await createWorkspaceMutation.mutateAsync(input);
      }
      setName("");
      setAllowMultiple(false);
    } catch {
      // The mutation displays the API error and keeps the draft for retry.
    }
  };

  const beginEdit = (definition: PagePropertyDefinition) => {
    setEditing(definition);
    setEditName(definition.name);
    setEditAllowMultiple(
      definition.type === "person" &&
        "allowMultiple" in definition.config &&
        definition.config.allowMultiple,
    );
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    try {
      await updateMutation.mutateAsync({
        propertyId: editing.id,
        name: editName.trim(),
        ...(editing.type === "person"
          ? { config: { allowMultiple: editAllowMultiple } }
          : {}),
      });
      setEditing(null);
    } catch {
      // The mutation displays the API error and keeps edit mode open.
    }
  };

  const confirmDelete = (definition: PagePropertyDefinition) => {
    modals.openConfirmModal({
      title: t("Delete page property?"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            isWorkspaceScope
              ? 'Deleting "{{name}}" permanently removes its values from every page in this workspace.'
              : 'Deleting "{{name}}" permanently removes its values from every page in this space.',
            { name: definition.name },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(definition.id),
    });
  };

  if (definitionsQuery.isLoading) return <Loader size="sm" />;
  if (definitionsQuery.isError) {
    return <Text c="red">{t("Failed to load page properties")}</Text>;
  }
  const scopedDefinitions = (definitionsQuery.data ?? []).filter(
    (definition) => definition.spaceId === (spaceId ?? null),
  );

  return (
    <Stack gap="md">
      <div>
        <Text fw={600}>{t("Page properties")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            isWorkspaceScope
              ? "Define typed metadata shared by pages in every space in this workspace."
              : "Define typed metadata shared by pages in this space.",
          )}
        </Text>
      </div>

      {canManage && (
        <div className={classes.createRow}>
          <Stack gap="sm">
            <Group align="end" gap="sm" wrap="nowrap">
              <Group grow style={{ flex: 1 }}>
                <TextInput
                  variant="unstyled"
                  classNames={{ input: classes.input, label: classes.label }}
                  label={t("Name")}
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.currentTarget.value)}
                />
                <Select
                  variant="unstyled"
                  classNames={{ input: classes.input, label: classes.label }}
                  label={t("Type")}
                  value={type}
                  allowDeselect={false}
                  data={[
                    { value: "date", label: t("Date") },
                    { value: "number", label: t("Number") },
                    { value: "person", label: t("Person") },
                  ]}
                  onChange={(value) =>
                    setType((value ?? "date") as PagePropertyType)
                  }
                />
              </Group>
              <ActionIcon
                size="lg"
                variant="filled"
                aria-label={t("Add property")}
                loading={
                  createSpaceMutation.isPending ||
                  createWorkspaceMutation.isPending
                }
                disabled={!name.trim()}
                onClick={create}
              >
                <IconPlus size={18} />
              </ActionIcon>
            </Group>
            {type === "person" && (
              <Checkbox
                label={t("Allow multiple people")}
                checked={allowMultiple}
                onChange={(event) =>
                  setAllowMultiple(event.currentTarget.checked)
                }
              />
            )}
          </Stack>
        </div>
      )}

      {scopedDefinitions.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t("No page properties have been defined.")}
        </Text>
      ) : (
        <Stack gap={0}>
          {scopedDefinitions.map((definition) => {
            const isEditing = editing?.id === definition.id;
            return (
              <div key={definition.id} className={classes.definitionRow}>
                {isEditing ? (
                  <Stack gap="xs">
                    <Group align="end" gap="xs" wrap="nowrap">
                      <TextInput
                        style={{ flex: 1 }}
                        variant="unstyled"
                        classNames={{ input: classes.input }}
                        aria-label={t("Property name")}
                        value={editName}
                        maxLength={100}
                        onChange={(event) =>
                          setEditName(event.currentTarget.value)
                        }
                      />
                      <Group gap={4} wrap="nowrap" pb={4}>
                        <ActionIcon
                          variant="subtle"
                          aria-label={t("Save")}
                          loading={updateMutation.isPending}
                          onClick={saveEdit}
                        >
                          <IconCheck size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          aria-label={t("Cancel")}
                          onClick={() => setEditing(null)}
                        >
                          <IconX size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t("Delete")}
                          loading={
                            deleteMutation.isPending &&
                            deleteMutation.variables === definition.id
                          }
                          onClick={() => confirmDelete(definition)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    {definition.type === "person" && (
                      <Checkbox
                        label={t("Allow multiple people")}
                        checked={editAllowMultiple}
                        onChange={(event) =>
                          setEditAllowMultiple(event.currentTarget.checked)
                        }
                      />
                    )}
                  </Stack>
                ) : (
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <div style={{ flex: 1 }}>
                      <Text fw={500}>{definition.name}</Text>
                      <Text size="xs" c="dimmed">
                        {t(
                          definition.type === "date"
                            ? "Date"
                            : definition.type === "number"
                              ? "Number"
                              : "Person",
                        )}
                        {definition.type === "person" &&
                        "allowMultiple" in definition.config &&
                        definition.config.allowMultiple
                          ? ` · ${t("Multiple")}`
                          : ""}
                      </Text>
                    </div>
                    {canManage && (
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                          variant="subtle"
                          aria-label={t("Edit")}
                          onClick={() => beginEdit(definition)}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={t("Delete")}
                          loading={
                            deleteMutation.isPending &&
                            deleteMutation.variables === definition.id
                          }
                          onClick={() => confirmDelete(definition)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                )}
              </div>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

export function WorkspacePagePropertiesSettings({
  canManage = false,
}: Pick<SpacePagePropertiesSettingsProps, "canManage">) {
  return <SpacePagePropertiesSettings canManage={canManage} />;
}
